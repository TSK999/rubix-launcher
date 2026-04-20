const { app, BrowserWindow, ipcMain, shell, dialog } = require("electron");
const path = require("path");
const fs = require("fs");
const { spawn } = require("child_process");
const { autoUpdater } = require("electron-updater");
const log = require("electron-log");

// ---------- Auto-updater setup ----------
log.transports.file.level = "info";
autoUpdater.logger = log;
autoUpdater.autoDownload = true;
autoUpdater.autoInstallOnAppQuit = true;
// Accept GitHub pre-releases (so tags like v0.0.4 marked "Pre-release" still update)
autoUpdater.allowPrerelease = true;
autoUpdater.channel = "latest";

let mainWindow = null;

// Persist release notes between download → next launch (after install)
const pendingNotesPath = () =>
  path.join(app.getPath("userData"), "pending-release-notes.json");

function writePendingNotes(data) {
  try {
    fs.writeFileSync(pendingNotesPath(), JSON.stringify(data), "utf-8");
  } catch (err) {
    log.warn("Failed to write pending release notes", err);
  }
}

function readPendingNotes() {
  try {
    const raw = fs.readFileSync(pendingNotesPath(), "utf-8");
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function clearPendingNotes() {
  try {
    fs.unlinkSync(pendingNotesPath());
  } catch {
    /* ignore — file may not exist */
  }
}

function sendUpdateStatus(status, payload) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send("updater:status", { status, payload });
  }
}

autoUpdater.on("checking-for-update", () => sendUpdateStatus("checking"));
autoUpdater.on("update-available", (info) =>
  sendUpdateStatus("available", { version: info.version })
);
autoUpdater.on("update-not-available", (info) =>
  sendUpdateStatus("not-available", { version: info?.version })
);
autoUpdater.on("error", (err) =>
  sendUpdateStatus("error", { message: String(err?.message || err) })
);
autoUpdater.on("download-progress", (p) =>
  sendUpdateStatus("downloading", {
    percent: Math.round(p.percent || 0),
    bytesPerSecond: p.bytesPerSecond,
    transferred: p.transferred,
    total: p.total,
  })
);
autoUpdater.on("update-downloaded", (info) => {
  let notes = "";
  if (typeof info.releaseNotes === "string") {
    notes = info.releaseNotes;
  } else if (Array.isArray(info.releaseNotes)) {
    notes = info.releaseNotes
      .map((n) => `### v${n.version}\n\n${n.note || ""}`)
      .join("\n\n");
  }
  const payload = {
    version: info.version,
    releaseName: info.releaseName || `v${info.version}`,
    releaseNotes: notes,
    releaseDate: info.releaseDate || "",
  };
  // Persist so we can show a "What's new" splash on next launch (post-install)
  writePendingNotes(payload);
  sendUpdateStatus("downloaded", payload);
});

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 900,
    minHeight: 600,
    backgroundColor: "#0a0a0a",
    autoHideMenuBar: true,
    title: "RUBIX Launcher",
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  mainWindow.loadFile(path.join(__dirname, "..", "dist", "index.html"));

  // Kick off an update check shortly after the window is ready (only in packaged builds)
  mainWindow.webContents.once("did-finish-load", () => {
    if (app.isPackaged) {
      setTimeout(() => {
        autoUpdater.checkForUpdates().catch((err) => log.warn("Update check failed", err));
      }, 3000);
    }
  });
}

// Launch a game by path/URI
ipcMain.handle("launch-game", async (_evt, target) => {
  if (!target || typeof target !== "string") {
    return { ok: false, error: "No launch target provided" };
  }

  const trimmed = target.trim();

  // URL schemes (steam://, epicgames://, https://, etc.) open via OS handler
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed)) {
    try {
      await shell.openExternal(trimmed);
      return { ok: true, method: "url" };
    } catch (err) {
      return { ok: false, error: String(err) };
    }
  }

  // Local executable / file path
  try {
    const errorMsg = await shell.openPath(trimmed);
    if (errorMsg) {
      const child = spawn(trimmed, [], { detached: true, stdio: "ignore" });
      child.unref();
      return { ok: true, method: "spawn" };
    }
    return { ok: true, method: "openPath" };
  } catch (err) {
    return { ok: false, error: String(err) };
  }
});

// Native file picker for selecting a game executable
ipcMain.handle("pick-executable", async () => {
  const result = await dialog.showOpenDialog({
    title: "Select game executable",
    properties: ["openFile"],
    filters: [
      { name: "Executables", extensions: ["exe", "app", "sh", "bat", "cmd", "AppImage"] },
      { name: "All Files", extensions: ["*"] },
    ],
  });
  if (result.canceled || !result.filePaths[0]) return null;
  return result.filePaths[0];
});

// ---------- Auto-updater IPC ----------
ipcMain.handle("updater:check", async () => {
  if (!app.isPackaged) {
    return { ok: false, error: "Updates only run in packaged builds" };
  }
  try {
    const result = await autoUpdater.checkForUpdates();
    return { ok: true, version: result?.updateInfo?.version };
  } catch (err) {
    return { ok: false, error: String(err?.message || err) };
  }
});

ipcMain.handle("updater:install", async () => {
  // Quits the app and installs the downloaded update
  setImmediate(() => autoUpdater.quitAndInstall(false, true));
  return { ok: true };
});

ipcMain.handle("updater:get-version", async () => {
  return { version: app.getVersion() };
});

// Returns release notes only if they correspond to the currently-running version
// (i.e. the user just relaunched into the new build). Otherwise returns null.
ipcMain.handle("updater:get-pending-notes", async () => {
  const data = readPendingNotes();
  if (!data) return null;
  if (data.version !== app.getVersion()) return null;
  return data;
});

ipcMain.handle("updater:clear-pending-notes", async () => {
  clearPendingNotes();
  return { ok: true };
});

// ---------- Epic Games Store integration ----------

function getEpicManifestDirs() {
  const dirs = [];
  if (process.platform === "win32") {
    const programData = process.env.PROGRAMDATA || "C:\\ProgramData";
    dirs.push(path.join(programData, "Epic", "EpicGamesLauncher", "Data", "Manifests"));
  } else if (process.platform === "darwin") {
    dirs.push(
      path.join(
        app.getPath("home"),
        "Library",
        "Application Support",
        "Epic",
        "EpicGamesLauncher",
        "Data",
        "Manifests"
      )
    );
  } else {
    const home = app.getPath("home");
    dirs.push(
      path.join(home, ".config", "heroic", "store", "legendary", "manifests"),
      path.join(home, ".wine", "drive_c", "ProgramData", "Epic", "EpicGamesLauncher", "Data", "Manifests")
    );
  }
  return dirs;
}

ipcMain.handle("epic:scan-installed", async () => {
  const dirs = getEpicManifestDirs();
  const games = [];
  let scannedDir = null;

  for (const dir of dirs) {
    if (!fs.existsSync(dir)) continue;
    scannedDir = dir;
    try {
      const files = fs.readdirSync(dir).filter((f) => f.toLowerCase().endsWith(".item"));
      for (const file of files) {
        try {
          const raw = fs.readFileSync(path.join(dir, file), "utf-8");
          const m = JSON.parse(raw);
          if (!m.LaunchExecutable && !m.AppName) continue;
          games.push({
            appName: m.AppName || m.MainGameAppName || "",
            displayName: m.DisplayName || m.AppName || "Unknown",
            installLocation: m.InstallLocation || "",
            launchExecutable: m.LaunchExecutable || "",
            catalogNamespace: m.CatalogNamespace || m.MainGameCatalogNamespace || "",
            catalogItemId: m.CatalogItemId || m.MainGameCatalogItemId || "",
            installSize: m.InstallSize || 0,
            image: "",
          });
        } catch {
          /* skip malformed manifest */
        }
      }
    } catch {
      /* skip unreadable dir */
    }
  }

  const seen = new Map();
  for (const g of games) {
    if (!seen.has(g.appName)) seen.set(g.appName, g);
  }

  return {
    ok: true,
    scannedDir,
    games: Array.from(seen.values()).sort((a, b) =>
      a.displayName.localeCompare(b.displayName)
    ),
  };
});

ipcMain.handle("epic:launch", async (_evt, payload) => {
  if (!payload || typeof payload !== "object") {
    return { ok: false, error: "Invalid launch payload" };
  }
  const { catalogNamespace, catalogItemId, appName } = payload;
  if (!catalogNamespace || !catalogItemId || !appName) {
    return { ok: false, error: "Missing Epic launch identifiers" };
  }
  const uri = `com.epicgames.launcher://apps/${encodeURIComponent(
    catalogNamespace
  )}%3A${encodeURIComponent(catalogItemId)}%3A${encodeURIComponent(
    appName
  )}?action=launch&silent=true`;
  try {
    await shell.openExternal(uri);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: String(err) };
  }
});

// ---------- EA app (Origin) integration ----------

function getEaInstallDataDirs() {
  const dirs = [];
  if (process.platform === "win32") {
    const programData = process.env.PROGRAMDATA || "C:\\ProgramData";
    const localAppData = process.env.LOCALAPPDATA || "";
    dirs.push(
      // Modern EA Desktop (correct path — no "Electronic Arts" parent)
      path.join(programData, "EA Desktop", "InstallData"),
      path.join(programData, "EA Desktop"),
      // Older / alternate layouts
      path.join(programData, "Electronic Arts", "EA Desktop", "InstallData"),
      path.join(programData, "Electronic Arts", "EA Services", "Installed"),
      // Legacy Origin manifests
      path.join(programData, "Origin", "LocalContent"),
      localAppData && path.join(localAppData, "Electronic Arts", "EA Desktop")
    );
  }
  return dirs.filter(Boolean);
}

// Recursively find installerdata.xml / .mfst within a root, capped depth
function findEaManifestFiles(root, depth = 0, out = []) {
  if (depth > 4) return out;
  let entries;
  try {
    entries = fs.readdirSync(root, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const entry of entries) {
    const full = path.join(root, entry.name);
    if (entry.isDirectory()) {
      findEaManifestFiles(full, depth + 1, out);
    } else if (entry.isFile()) {
      if (/^installerdata\.xml$/i.test(entry.name) || /\.mfst$/i.test(entry.name)) {
        out.push(full);
      }
    }
  }
  return out;
}

function readEaInstalledRegistry() {
  // Best-effort: query HKLM\SOFTWARE\WOW6432Node\Electronic Arts via reg.exe
  if (process.platform !== "win32") return [];
  const { execSync } = require("child_process");
  const games = [];
  const roots = [
    "HKLM\\SOFTWARE\\WOW6432Node\\Electronic Arts",
    "HKLM\\SOFTWARE\\Electronic Arts",
  ];
  for (const root of roots) {
    try {
      const out = execSync(`reg query "${root}" /s /f "Install Dir" /t REG_SZ`, {
        encoding: "utf-8",
        windowsHide: true,
        timeout: 8000,
      });
      const blocks = out.split(/\r?\n\r?\n/);
      for (const block of blocks) {
        const keyMatch = block.match(/^(HKEY_[^\s]+\\[^\r\n]+)/m);
        const dirMatch = block.match(/Install Dir\s+REG_SZ\s+(.+)$/im);
        if (!keyMatch || !dirMatch) continue;
        const key = keyMatch[1];
        const installDir = dirMatch[1].trim();
        const name = key.split("\\").pop() || "Unknown";
        if (!installDir || /Electronic Arts$/i.test(name)) continue;
        games.push({
          appId: name,
          contentId: name,
          displayName: name,
          installLocation: installDir,
          installSize: 0,
        });
      }
    } catch {
      /* registry path may not exist on this machine */
    }
  }
  return games;
}

function readEaManifests() {
  const games = [];
  const dirs = getEaInstallDataDirs();
  let scannedDir = null;
  for (const dir of dirs) {
    if (!fs.existsSync(dir)) continue;
    scannedDir = scannedDir || dir;
    try {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        if (!entry.isDirectory()) continue;
        const subdir = path.join(dir, entry.name);
        // Look for installerdata.xml (EA Desktop) or .mfst (Origin legacy)
        try {
          const subEntries = fs.readdirSync(subdir);
          const xml = subEntries.find((f) => /installerdata\.xml$/i.test(f));
          const mfst = subEntries.find((f) => /\.mfst$/i.test(f));
          let displayName = entry.name;
          let contentId = entry.name;
          let appId = entry.name;
          let installLocation = subdir;
          let installSize = 0;

          if (xml) {
            const raw = fs.readFileSync(path.join(subdir, xml), "utf-8");
            const titleMatch = raw.match(/<gameTitle[^>]*>([^<]+)<\/gameTitle>/i);
            const contentMatch = raw.match(/<contentID[^>]*>([^<]+)<\/contentID>/i);
            if (titleMatch) displayName = titleMatch[1].trim();
            if (contentMatch) contentId = contentMatch[1].trim();
          } else if (mfst) {
            const raw = fs.readFileSync(path.join(subdir, mfst), "utf-8");
            const idMatch = raw.match(/[?&]id=([^&\s]+)/i);
            if (idMatch) contentId = decodeURIComponent(idMatch[1]);
          }

          try {
            const stat = fs.statSync(installLocation);
            installSize = stat.size || 0;
          } catch {
            /* ignore */
          }

          games.push({ appId, contentId, displayName, installLocation, installSize });
        } catch {
          /* skip unreadable subdir */
        }
      }
    } catch {
      /* skip unreadable dir */
    }
  }
  return { games, scannedDir };
}

ipcMain.handle("ea:scan-installed", async () => {
  try {
    const { games: manifestGames, scannedDir } = readEaManifests();
    const regGames = readEaInstalledRegistry();

    const seen = new Map();
    for (const g of [...manifestGames, ...regGames]) {
      const key = (g.contentId || g.appId || g.displayName).toLowerCase();
      if (!seen.has(key)) seen.set(key, g);
    }

    const games = Array.from(seen.values()).sort((a, b) =>
      a.displayName.localeCompare(b.displayName)
    );

    return {
      ok: true,
      scannedDir: scannedDir || (regGames.length ? "Windows Registry" : null),
      games,
    };
  } catch (err) {
    return { ok: false, scannedDir: null, games: [], error: String(err?.message || err) };
  }
});

ipcMain.handle("ea:launch", async (_evt, payload) => {
  if (!payload || typeof payload !== "object") {
    return { ok: false, error: "Invalid launch payload" };
  }
  const { appId, contentId } = payload;
  const offer = contentId || appId;
  if (!offer) return { ok: false, error: "Missing EA offer/content ID" };
  const uri = `origin2://game/launch?offerIds=${encodeURIComponent(offer)}`;
  try {
    await shell.openExternal(uri);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: String(err) };
  }
});

app.whenReady().then(createWindow);

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
