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
  sendUpdateStatus("downloaded", {
    version: info.version,
    releaseName: info.releaseName || `v${info.version}`,
    releaseNotes: notes,
    releaseDate: info.releaseDate || "",
  });
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

app.whenReady().then(createWindow);

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
