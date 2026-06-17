const { app, BrowserWindow, ipcMain, shell, dialog, globalShortcut, desktopCapturer, screen, session } = require("electron");
const path = require("path");
const fs = require("fs");
const { spawn } = require("child_process");
const { autoUpdater } = require("electron-updater");
const log = require("electron-log");
const ffmpegManager = require("./clipping/ffmpeg-manager.cjs");
const encoderDetect = require("./clipping/encoder-detect.cjs");
const replayBuffer = require("./clipping/replay-buffer.cjs");
const clipExport = require("./clipping/clip-export.cjs");

// Keep desktop capture available for the recorder on Chromium/Electron builds
// that still honor the legacy chromeMediaSource path. Modern builds use the
// setDisplayMediaRequestHandler below.
app.commandLine.appendSwitch("enable-usermedia-screen-capturing");
app.commandLine.appendSwitch("disable-renderer-backgrounding");
app.commandLine.appendSwitch("disable-background-timer-throttling");
app.commandLine.appendSwitch("disable-backgrounding-occluded-windows");

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
    icon: path.join(__dirname, "..", "build", process.platform === "win32" ? "icon.ico" : "icon.png"),
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      backgroundThrottling: false,
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
  const scannedDirs = [];
  let firstScannedDir = null;

  for (const dir of dirs) {
    if (!fs.existsSync(dir)) continue;
    if (!firstScannedDir) firstScannedDir = dir;
    scannedDirs.push(dir);

    const manifestFiles = findEaManifestFiles(dir);
    for (const file of manifestFiles) {
      try {
        const raw = fs.readFileSync(file, "utf-8");
        const containingDir = path.dirname(file);
        // For installerdata.xml under "<game>\__Installer\installerdata.xml",
        // the actual game folder is the parent of __Installer.
        const gameRoot = /__Installer$/i.test(path.basename(containingDir))
          ? path.dirname(containingDir)
          : containingDir;

        let displayName = path.basename(gameRoot);
        let contentId = displayName;
        let appId = displayName;

        if (/installerdata\.xml$/i.test(file)) {
          const titleMatch = raw.match(/<gameTitle[^>]*>([^<]+)<\/gameTitle>/i);
          const contentMatch = raw.match(/<contentID[^>]*>([^<]+)<\/contentID>/i);
          const launcherMatch = raw.match(/<contentIDs>[\s\S]*?<contentID[^>]*>([^<]+)<\/contentID>/i);
          if (titleMatch) displayName = titleMatch[1].trim();
          if (contentMatch) contentId = contentMatch[1].trim();
          else if (launcherMatch) contentId = launcherMatch[1].trim();
          appId = contentId;
        } else if (/\.mfst$/i.test(file)) {
          const idMatch = raw.match(/[?&]id=([^&\s]+)/i);
          if (idMatch) {
            contentId = decodeURIComponent(idMatch[1]);
            appId = contentId;
          }
        }

        let installSize = 0;
        try {
          installSize = fs.statSync(gameRoot).size || 0;
        } catch {
          /* ignore */
        }

        games.push({
          appId,
          contentId,
          displayName,
          installLocation: gameRoot,
          installSize,
        });
      } catch {
        /* skip unreadable manifest */
      }
    }
  }

  return { games, scannedDir: scannedDirs.join(" | ") || firstScannedDir };
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


// ---------- Riot Client integration ----------

const RIOT_PRODUCTS = {
  valorant: { productId: "valorant", patchline: "live", displayName: "VALORANT" },
  league_of_legends: { productId: "league_of_legends", patchline: "live", displayName: "League of Legends" },
  lor: { productId: "bacon", patchline: "live", displayName: "Legends of Runeterra" },
};

function getRiotRoots() {
  if (process.platform !== "win32") return [];
  const roots = [];
  const programData = process.env.PROGRAMDATA || "C:\\ProgramData";
  const programFiles = process.env.PROGRAMFILES || "C:\\Program Files";
  const programFilesX86 = process.env["PROGRAMFILES(X86)"] || "C:\\Program Files (x86)";
  roots.push(
    path.join(programData, "Riot Games"),
    path.join(programFiles, "Riot Games"),
    path.join(programFilesX86, "Riot Games"),
    "C:\\Riot Games"
  );
  return [...new Set(roots)];
}

function readRiotClientPath() {
  const programData = process.env.PROGRAMDATA || "C:\\ProgramData";
  const installsPath = path.join(programData, "Riot Games", "RiotClientInstalls.json");
  try {
    const data = JSON.parse(fs.readFileSync(installsPath, "utf-8"));
    const candidate = data.rc_default || data.rc_live || data.associated_client;
    if (candidate && fs.existsSync(candidate)) return candidate;
  } catch {
    /* ignore missing installs file */
  }

  for (const root of getRiotRoots()) {
    const candidate = path.join(root, "Riot Client", "RiotClientServices.exe");
    if (fs.existsSync(candidate)) return candidate;
  }
  return "";
}

function parseRiotSettingsYaml(raw) {
  const get = (key) => {
    const match = raw.match(new RegExp(`^\\s*${key}:\\s*["']?([^"'\\r\\n]+)["']?`, "mi"));
    return match ? match[1].trim() : "";
  };
  return {
    productId: get("product_id") || get("product"),
    patchline: get("patchline") || "live",
    displayName: get("product_name") || get("name"),
    installLocation: get("product_install_full_path") || get("install_full_path"),
  };
}

function normalizeRiotProduct(id, dirName) {
  const raw = String(id || dirName || "").toLowerCase();
  if (raw.includes("valorant")) return RIOT_PRODUCTS.valorant;
  if (raw.includes("league")) return RIOT_PRODUCTS.league_of_legends;
  if (raw.includes("bacon") || raw.includes("runeterra") || raw === "lor") return RIOT_PRODUCTS.lor;
  return null;
}

function readRiotMetadataGames() {
  const games = [];
  const metadataDir = path.join(process.env.PROGRAMDATA || "C:\\ProgramData", "Riot Games", "Metadata");
  if (!fs.existsSync(metadataDir)) return { games, scannedDir: null };

  for (const entry of fs.readdirSync(metadataDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const settingsPath = path.join(metadataDir, entry.name, `${entry.name}.product_settings.yaml`);
    if (!fs.existsSync(settingsPath)) continue;
    try {
      const parsed = parseRiotSettingsYaml(fs.readFileSync(settingsPath, "utf-8"));
      const product = normalizeRiotProduct(parsed.productId, entry.name);
      if (!product) continue;
      games.push({
        productId: product.productId,
        patchline: parsed.patchline || product.patchline,
        displayName: parsed.displayName || product.displayName,
        installLocation: parsed.installLocation || "",
        clientPath: readRiotClientPath(),
        installSize: 0,
      });
    } catch {
      /* skip unreadable metadata */
    }
  }
  return { games, scannedDir: metadataDir };
}

function scanRiotKnownFolders() {
  const games = [];
  const clientPath = readRiotClientPath();
  for (const root of getRiotRoots()) {
    const candidates = [
      { product: RIOT_PRODUCTS.valorant, dir: path.join(root, "VALORANT") },
      { product: RIOT_PRODUCTS.league_of_legends, dir: path.join(root, "League of Legends") },
      { product: RIOT_PRODUCTS.lor, dir: path.join(root, "LoR") },
    ];
    for (const { product, dir } of candidates) {
      if (!fs.existsSync(dir)) continue;
      games.push({
        productId: product.productId,
        patchline: product.patchline,
        displayName: product.displayName,
        installLocation: dir,
        clientPath,
        installSize: 0,
      });
    }
  }
  return games;
}

ipcMain.handle("riot:scan-installed", async () => {
  if (process.platform !== "win32") {
    return { ok: false, scannedDir: null, games: [], error: "Riot scanning requires Windows" };
  }
  try {
    const { games: metadataGames, scannedDir } = readRiotMetadataGames();
    const folderGames = scanRiotKnownFolders();
    const seen = new Map();
    for (const g of [...metadataGames, ...folderGames]) {
      if (!g.productId) continue;
      const key = `${g.productId}:${g.patchline || "live"}`;
      if (!seen.has(key)) seen.set(key, g);
      else seen.set(key, { ...g, ...seen.get(key), installLocation: seen.get(key).installLocation || g.installLocation });
    }
    const games = Array.from(seen.values()).sort((a, b) => a.displayName.localeCompare(b.displayName));
    return {
      ok: true,
      scannedDir: scannedDir || getRiotRoots().filter((d) => fs.existsSync(d)).join(" | ") || null,
      games,
    };
  } catch (err) {
    return { ok: false, scannedDir: null, games: [], error: String(err?.message || err) };
  }
});

ipcMain.handle("riot:launch", async (_evt, payload) => {
  if (!payload || typeof payload !== "object") {
    return { ok: false, error: "Invalid launch payload" };
  }
  const productId = payload.productId;
  const patchline = payload.patchline || "live";
  const clientPath = payload.clientPath || readRiotClientPath();
  if (!productId) return { ok: false, error: "Missing Riot product ID" };
  if (!clientPath || !fs.existsSync(clientPath)) return { ok: false, error: "Riot Client not found" };

  try {
    const child = spawn(clientPath, [`--launch-product=${productId}`, `--launch-patchline=${patchline}`], {
      detached: true,
      stdio: "ignore",
      windowsHide: true,
    });
    child.unref();
    return { ok: true };
  } catch (err) {
    return { ok: false, error: String(err?.message || err) };
  }
});

// ---------- Xbox app (Microsoft Store / Gaming Services UWP) integration ----------

function runPowerShell(script, timeoutMs = 15000) {
  if (process.platform !== "win32") {
    throw new Error("Xbox library scanning requires Windows");
  }
  const { execFileSync } = require("child_process");
  const out = execFileSync(
    "powershell.exe",
    ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-Command", script],
    { encoding: "utf-8", windowsHide: true, timeout: timeoutMs, maxBuffer: 1024 * 1024 * 8 }
  );
  return out;
}

// Heuristic: drop system / framework / first-party utility packages.
function isLikelyXboxGame(pkg) {
  if (!pkg || !pkg.PackageFamilyName) return false;
  if (pkg.IsFramework) return false;
  if (!pkg.InstallLocation) return false;
  const name = String(pkg.Name || "");
  const blocklist = [
    /^Microsoft\.Windows/i, /^Microsoft\.VCLibs/i, /^Microsoft\.NET/i, /^Microsoft\.UI/i,
    /^Microsoft\.Services\.Store/i, /^Microsoft\.WebMediaExtensions/i, /ImageExtension/i,
    /VideoExtension/i, /^Microsoft\.MicrosoftEdge/i, /^Microsoft\.GamingApp$/i,
    /^Microsoft\.XboxApp$/i, /^Microsoft\.Xbox\./i, /^Microsoft\.XboxIdentityProvider/i,
    /^Microsoft\.XboxGameOverlay/i, /^Microsoft\.XboxGamingOverlay/i,
    /^Microsoft\.XboxSpeechToTextOverlay/i, /^Microsoft\.GamingServices/i,
    /^Microsoft\.StorePurchaseApp/i, /^Microsoft\.WindowsStore/i,
    /^Microsoft\.DesktopAppInstaller/i, /^Microsoft\.WindowsTerminal/i,
    /^Microsoft\.Paint/i, /^Microsoft\.ScreenSketch/i, /^Microsoft\.YourPhone/i,
    /^Microsoft\.Office/i, /^Microsoft\.OneDrive/i, /^Microsoft\.Getstarted/i,
    /^Microsoft\.GetHelp/i, /^Microsoft\.People/i, /^Microsoft\.ZuneMusic/i,
    /^Microsoft\.ZuneVideo/i, /^Microsoft\.WindowsCalculator/i, /^Microsoft\.WindowsCamera/i,
    /^Microsoft\.WindowsAlarms/i, /^Microsoft\.WindowsFeedbackHub/i,
    /^Microsoft\.WindowsMaps/i, /^Microsoft\.WindowsSoundRecorder/i,
    /^Microsoft\.MixedReality/i, /^Microsoft\.Bing/i, /^MicrosoftCorporationII\./i,
    /^MicrosoftWindows\./i, /^windows\./i, /^NVIDIA/i, /^AMDExtension/i, /^Realtek/i,
  ];
  if (blocklist.some((rx) => rx.test(name))) return false;
  return true;
}

ipcMain.handle("xbox:scan-installed", async () => {
  if (process.platform !== "win32") {
    return { ok: false, scannedDir: null, games: [], error: "Xbox scanning requires Windows" };
  }
  try {
    const script = `
$ErrorActionPreference = 'SilentlyContinue';
$startApps = @{};
try {
  Get-StartApps | ForEach-Object {
    if ($_.AppID -match '^([^!]+)!') {
      $pfn = $matches[1];
      if (-not $startApps.ContainsKey($pfn)) { $startApps[$pfn] = $_.AppID; }
    }
  }
} catch {}
$pkgs = Get-AppxPackage | Where-Object { -not $_.IsFramework -and $_.SignatureKind -ne 'System' };
$out = @();
foreach ($p in $pkgs) {
  $aumid = $startApps[$p.PackageFamilyName];
  if (-not $aumid) { continue; }
  $logo = '';
  $displayName = $p.Name;
  $publisher = $p.Publisher;
  try {
    $manifest = Get-AppxPackageManifest -Package $p.PackageFullName;
    if ($manifest) {
      $dn = $manifest.Package.Properties.DisplayName;
      if ($dn -and $dn -notlike 'ms-resource:*') { $displayName = $dn; }
      $pn = $manifest.Package.Properties.PublisherDisplayName;
      if ($pn -and $pn -notlike 'ms-resource:*') { $publisher = $pn; }
      $logoRel = $manifest.Package.Properties.Logo;
      if ($logoRel -and $p.InstallLocation) {
        $logoPath = Join-Path $p.InstallLocation $logoRel;
        if (Test-Path $logoPath) { $logo = $logoPath; }
      }
    }
  } catch {}
  $out += [pscustomobject]@{
    Name = $p.Name;
    PackageFamilyName = $p.PackageFamilyName;
    AppUserModelId = $aumid;
    DisplayName = $displayName;
    Publisher = $publisher;
    InstallLocation = $p.InstallLocation;
    InstallSize = 0;
    Logo = $logo;
    IsFramework = $p.IsFramework;
  };
}
$out | ConvertTo-Json -Depth 4 -Compress
`;
    const raw = runPowerShell(script, 30000);
    let parsed;
    try {
      parsed = JSON.parse(raw || "[]");
    } catch {
      parsed = [];
    }
    if (!Array.isArray(parsed)) parsed = [parsed];

    const games = parsed
      .filter(isLikelyXboxGame)
      .map((p) => ({
        packageFamilyName: p.PackageFamilyName,
        appUserModelId: p.AppUserModelId,
        displayName: p.DisplayName || p.Name,
        installLocation: p.InstallLocation || "",
        publisher: p.Publisher || "",
        installSize: Number(p.InstallSize) || 0,
        logo: p.Logo || "",
      }))
      .sort((a, b) => a.displayName.localeCompare(b.displayName));

    return {
      ok: true,
      scannedDir: "Get-AppxPackage (UWP / Microsoft Store)",
      games,
    };
  } catch (err) {
    return {
      ok: false,
      scannedDir: null,
      games: [],
      error: String(err?.message || err),
    };
  }
});

ipcMain.handle("xbox:launch", async (_evt, payload) => {
  if (!payload || typeof payload !== "object") {
    return { ok: false, error: "Invalid launch payload" };
  }
  const { appUserModelId, packageFamilyName } = payload;
  const aumid = appUserModelId || (packageFamilyName ? `${packageFamilyName}!App` : "");
  if (!aumid) return { ok: false, error: "Missing Xbox app identifier" };

  try {
    const child = spawn("explorer.exe", [`shell:AppsFolder\\${aumid}`], {
      detached: true,
      stdio: "ignore",
      windowsHide: true,
    });
    child.unref();
    return { ok: true };
  } catch (err) {
    return { ok: false, error: String(err?.message || err) };
  }
});

// ---------- Screenshot capture (F12 global hotkey) ----------

async function captureActiveScreen() {
  try {
    const cursor = screen.getCursorScreenPoint();
    const display = screen.getDisplayNearestPoint(cursor);
    const { width, height } = display.size;
    const scale = display.scaleFactor || 1;
    const thumbSize = {
      width: Math.round(width * scale),
      height: Math.round(height * scale),
    };
    const sources = await desktopCapturer.getSources({
      types: ["screen"],
      thumbnailSize: thumbSize,
    });
    // Best-effort match by display id; fall back to first source
    const match =
      sources.find((s) => String(s.display_id) === String(display.id)) ||
      sources[0];
    if (!match) return null;
    const buf = match.thumbnail.toPNG();
    return {
      dataUrl: `data:image/png;base64,${buf.toString("base64")}`,
      width: match.thumbnail.getSize().width,
      height: match.thumbnail.getSize().height,
    };
  } catch (err) {
    log.warn("Screenshot capture failed", err);
    return null;
  }
}

ipcMain.handle("screenshots:capture", async () => {
  const shot = await captureActiveScreen();
  if (!shot) return { ok: false, error: "Capture failed" };
  return { ok: true, ...shot };
});

// ---------- Clip capture source (F9 global hotkey) ----------
// Actual recording lives in the renderer via MediaRecorder + a rolling
// buffer. Main just resolves the chromeMediaSource id for the active
// display and forwards the F9 trigger.

let activeClipTarget = null;
let preferredDisplayId = null; // user-pinned monitor; overrides cursor/window heuristics

function normalizeSourceText(value) {
  return String(value || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function chooseClipSource(sources) {
  const cursor = screen.getCursorScreenPoint();
  const display = screen.getDisplayNearestPoint(cursor);
  const screens = sources.filter((s) => s.id.startsWith("screen:"));
  const windows = sources.filter((s) => s.id.startsWith("window:"));

  const targetParts = [activeClipTarget?.title, activeClipTarget?.exe]
    .map(normalizeSourceText)
    .filter((part) => part.length >= 3);

  // Resolve which display to capture, in priority order:
  // 1) user-pinned monitor from Settings
  // 2) the display the targeted game window is on
  // 3) the display under the cursor
  let displayIdHint = preferredDisplayId ? String(preferredDisplayId) : null;
  if (!displayIdHint && targetParts.length) {
    const targetWindow = windows.find((source) => {
      const name = normalizeSourceText(source.name);
      return targetParts.some((part) => name.includes(part) || part.includes(name));
    });
    if (targetWindow?.display_id) displayIdHint = String(targetWindow.display_id);
  }

  // Always return a SCREEN source. Window sources fail to capture frames
  // for exclusive/borderless fullscreen games (black/blank video), while
  // screen sources work via DXGI/desktop duplication regardless of game mode.
  const byDisplay = (id) => screens.find((s) => String(s.display_id) === String(id));
  return (
    (displayIdHint && byDisplay(displayIdHint)) ||
    byDisplay(display.id) ||
    screens[0] ||
    sources[0] ||
    null
  );
}

ipcMain.handle("clips:list-displays", async () => {
  try {
    const cursor = screen.getCursorScreenPoint();
    const primaryId = String(screen.getPrimaryDisplay().id);
    const cursorId = String(screen.getDisplayNearestPoint(cursor).id);
    const displays = screen.getAllDisplays().map((d, i) => ({
      id: String(d.id),
      label: d.label || `Display ${i + 1}`,
      width: d.size.width,
      height: d.size.height,
      isPrimary: String(d.id) === primaryId,
      isCursor: String(d.id) === cursorId,
    }));
    return { ok: true, displays };
  } catch (err) {
    return { ok: false, displays: [], error: String(err?.message || err) };
  }
});

ipcMain.handle("clips:list-audio-devices", async () => {
  if (process.platform !== "win32") return { ok: true, devices: [] };
  try {
    const r = await ffmpegManager.runFfmpeg([
      "-hide_banner",
      "-list_devices", "true",
      "-f", "dshow",
      "-i", "dummy",
    ], { timeoutMs: 6000 });
    const text = `${r.stderr || ""}\n${r.stdout || ""}`;
    const devices = [];
    let inAudio = false;
    for (const line of text.split(/\r?\n/)) {
      if (/DirectShow audio devices/i.test(line)) { inAudio = true; continue; }
      if (/DirectShow video devices/i.test(line)) { inAudio = false; continue; }
      if (!inAudio || /Alternative name/i.test(line)) continue;
      const m = line.match(/"([^"]+)"/);
      if (m && !devices.some((d) => d.label === m[1])) {
        devices.push({ id: m[1], label: m[1] });
      }
    }
    return { ok: true, devices };
  } catch (err) {
    return { ok: false, devices: [], error: String(err?.message || err) };
  }
});

ipcMain.handle("clips:set-preferred-display", async (_evt, id) => {
  preferredDisplayId = id ? String(id) : null;
  return { ok: true };
});

ipcMain.handle("clips:set-target", async (_evt, target) => {
  activeClipTarget = target && typeof target === "object"
    ? {
        title: String(target.title || ""),
        exe: path.basename(String(target.path || ""), path.extname(String(target.path || ""))),
      }
    : null;
  return { ok: true };
});

ipcMain.handle("clips:get-source", async () => {
  try {
    const sources = await desktopCapturer.getSources({
      types: ["screen", "window"],
      thumbnailSize: { width: 0, height: 0 },
    });
    const match = chooseClipSource(sources);
    if (!match) return { ok: false, error: "No screen source" };
    return { ok: true, sourceId: match.id, displayId: String(match.display_id || ""), name: match.name };
  } catch (err) {
    return { ok: false, error: String(err?.message || err) };
  }
});


// ---------- FFmpeg-powered replay buffer ----------
// Owns the recording pipeline end-to-end so the renderer never has to touch
// MediaRecorder for clipping. The renderer just calls start/stop/save and
// receives the finished MP4 as an ArrayBuffer it can upload.

replayBuffer.subscribe((snap) => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send("clips:ffmpeg-status", snap);
  }
});

ipcMain.handle("clips:ffmpeg-probe", async () => {
  const [ff, enc] = await Promise.all([
    ffmpegManager.probe(),
    encoderDetect.detectBestEncoder().catch((err) => ({
      selected: null,
      tested: [],
      error: String(err?.message || err),
    })),
  ]);
  return { ok: true, ffmpeg: ff, encoders: enc };
});

ipcMain.handle("clips:ffmpeg-start", async (_evt, options) => {
  try {
    const merged = {
      ...(options || {}),
      displayId: options?.displayId || preferredDisplayId || null,
    };
    return await replayBuffer.start(merged);
  } catch (err) {
    return { ok: false, error: String(err?.message || err) };
  }
});

ipcMain.handle("clips:ffmpeg-stop", async () => {
  try { return await replayBuffer.stop(); }
  catch (err) { return { ok: false, error: String(err?.message || err) }; }
});

ipcMain.handle("clips:ffmpeg-status", async () => replayBuffer.getStatus());

ipcMain.handle("clips:ffmpeg-save", async (_evt, options) => {
  try {
    const result = await replayBuffer.saveClip(options || {});
    const buffer = await clipExport.readClipBuffer(result.path);
    return {
      ok: true,
      buffer,
      mimeType: result.mimeType,
      durationSeconds: result.durationSeconds,
      path: result.path,
    };
  } catch (err) {
    return { ok: false, error: String(err?.message || err) };
  }
});

ipcMain.handle("clips:ffmpeg-discard", async (_evt, p) => {
  if (typeof p === "string") await clipExport.deleteClip(p);
  return { ok: true };
});

const DEFAULT_HOTKEYS = {

  screenshot: "F12",
  clip: "F9",
  toggleMute: "F7",
  togglePresence: "F8",
};

let activeHotkeys = { ...DEFAULT_HOTKEYS };

function runHotkey(action) {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  if (action === "screenshot") {
    captureActiveScreen().then((shot) => {
      if (shot && mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send("screenshots:captured", shot);
      }
    });
    return;
  }
  if (action === "clip") {
    mainWindow.webContents.send("clips:save-trigger", { triggeredAt: Date.now() });
    return;
  }
  mainWindow.webContents.send("hotkeys:fired", { action, at: Date.now() });
}

function registerShortcuts(map) {
  try {
    globalShortcut.unregisterAll();
  } catch (_) {}
  activeHotkeys = { ...DEFAULT_HOTKEYS, ...(map || {}) };
  const results = {};
  for (const [action, accel] of Object.entries(activeHotkeys)) {
    if (!accel) {
      results[action] = { ok: false, error: "empty" };
      continue;
    }
    try {
      const ok = globalShortcut.register(accel, () => runHotkey(action));
      results[action] = { ok: !!ok, accelerator: accel };
      if (!ok) log.warn("Failed to register accelerator", action, accel);
    } catch (err) {
      results[action] = { ok: false, error: String(err && err.message) };
      log.warn("Error registering accelerator", action, accel, err);
    }
  }
  return results;
}

ipcMain.handle("hotkeys:set", (_evt, map) => {
  const results = registerShortcuts(map);
  return { ok: true, active: activeHotkeys, results };
});

ipcMain.handle("hotkeys:get", () => ({ ok: true, active: activeHotkeys }));

// ---------- Mods (CKAN-style installer) ----------
const AdmZip = require("adm-zip");
const https = require("https");
const http = require("http");

function modsDir() {
  const dir = path.join(app.getPath("userData"), "rubix-mods");
  try { fs.mkdirSync(dir, { recursive: true }); } catch {}
  return dir;
}
function configPath() { return path.join(modsDir(), "config.json"); }
function manifestPath(gameKey) {
  return path.join(modsDir(), `installed-${gameKey}.json`);
}
function readJson(file, fallback) {
  try { return JSON.parse(fs.readFileSync(file, "utf8")); } catch { return fallback; }
}
function writeJson(file, data) {
  fs.writeFileSync(file, JSON.stringify(data, null, 2));
}

function downloadFollow(url, dest, maxRedirects = 6) {
  return new Promise((resolve, reject) => {
    const go = (u, left) => {
      const lib = u.startsWith("https") ? https : http;
      const req = lib.get(u, { headers: { "User-Agent": "RUBIX-ModManager" } }, (res) => {
        if ([301, 302, 303, 307, 308].includes(res.statusCode) && res.headers.location) {
          if (left <= 0) return reject(new Error("Too many redirects"));
          const next = new URL(res.headers.location, u).toString();
          res.resume();
          return go(next, left - 1);
        }
        if (res.statusCode !== 200) {
          res.resume();
          return reject(new Error(`Download failed: HTTP ${res.statusCode}`));
        }
        const out = fs.createWriteStream(dest);
        res.pipe(out);
        out.on("finish", () => out.close(() => resolve()));
        out.on("error", reject);
      });
      req.on("error", reject);
    };
    go(url, maxRedirects);
  });
}

// Detect strip prefix inside the zip. `hint` overrides auto-detection:
//   "GameData" — require/strip a GameData/ top-level folder (KSP)
//   ""         — extract zip as-is
//   undefined  — auto: strip GameData/ if present, else as-is
function detectZipRoot(zip, hint) {
  if (hint === "") return "";
  const entries = zip.getEntries();
  const topLevel = new Set();
  for (const e of entries) {
    const p = e.entryName.replace(/\\/g, "/").replace(/^\/+/, "");
    if (!p) continue;
    topLevel.add(p.split("/")[0]);
  }
  if (hint && topLevel.has(hint)) return `${hint}/`;
  if (!hint && topLevel.has("GameData")) return "GameData/";
  return "";
}

function safeJoin(base, rel) {
  const target = path.resolve(base, rel);
  const baseResolved = path.resolve(base) + path.sep;
  if (!target.startsWith(baseResolved) && target !== path.resolve(base)) {
    throw new Error(`Unsafe path in zip: ${rel}`);
  }
  return target;
}

ipcMain.handle("mods:pick-folder", async (_evt, { gameKey, title, mode }) => {
  if (!mainWindow) return { ok: false, error: "No window" };
  const result = await dialog.showOpenDialog(mainWindow, {
    title: title || `Select ${gameKey} folder`,
    properties: ["openDirectory"],
  });
  if (result.canceled || !result.filePaths[0]) return { ok: false, canceled: true };
  const chosen = result.filePaths[0];
  let gameDataDir = chosen;
  // KSP convenience: accept either GameData itself or the game root containing GameData
  if (mode === "ksp" && path.basename(chosen).toLowerCase() !== "gamedata") {
    const candidate = path.join(chosen, "GameData");
    if (fs.existsSync(candidate) && fs.statSync(candidate).isDirectory()) {
      gameDataDir = candidate;
    }
  }
  const cfg = readJson(configPath(), {});
  cfg[gameKey] = { gameDataDir };
  writeJson(configPath(), cfg);
  return { ok: true, gameDataDir };
});

ipcMain.handle("mods:get-folder", async (_evt, { gameKey }) => {
  const cfg = readJson(configPath(), {});
  return { ok: true, gameDataDir: cfg[gameKey]?.gameDataDir || null };
});

ipcMain.handle("mods:list-installed", async (_evt, { gameKey }) => {
  return { ok: true, installed: readJson(manifestPath(gameKey), {}) };
});

ipcMain.handle("mods:install", async (_evt, payload) => {
  try {
    const {
      gameKey,
      modId,
      modName,
      version,
      versionId,
      downloadUrl,
      stripHint,      // "GameData" | "" | undefined (auto)
      installSubdir,  // optional subdir relative to picked folder
    } = payload || {};
    if (!gameKey || !modId || !downloadUrl) {
      return { ok: false, error: "Missing parameters" };
    }
    const cfg = readJson(configPath(), {});
    const baseDir = cfg[gameKey]?.gameDataDir;
    if (!baseDir || !fs.existsSync(baseDir)) {
      return { ok: false, error: "Install folder not set. Choose it first." };
    }
    const targetDir = installSubdir ? path.join(baseDir, installSubdir) : baseDir;
    fs.mkdirSync(targetDir, { recursive: true });

    // If already installed, uninstall the previous version first
    const manifest = readJson(manifestPath(gameKey), {});
    if (manifest[modId]?.files?.length) {
      const prevBase = manifest[modId].installSubdir
        ? path.join(baseDir, manifest[modId].installSubdir)
        : baseDir;
      for (const rel of manifest[modId].files) {
        try { fs.rmSync(path.join(prevBase, rel), { force: true }); } catch {}
      }
    }

    const safeId = String(modId).replace(/[^a-z0-9]/gi, "_");
    const tmp = path.join(app.getPath("temp"), `rubix-mod-${safeId}-${Date.now()}.zip`);
    await downloadFollow(downloadUrl, tmp);

    const zip = new AdmZip(tmp);
    const strip = detectZipRoot(zip, stripHint);
    const written = [];
    for (const entry of zip.getEntries()) {
      const norm = entry.entryName.replace(/\\/g, "/").replace(/^\/+/, "");
      if (!norm) continue;
      if (strip && !norm.startsWith(strip)) continue;
      const rel = strip ? norm.slice(strip.length) : norm;
      if (!rel || rel.endsWith("/")) {
        if (rel) fs.mkdirSync(safeJoin(targetDir, rel), { recursive: true });
        continue;
      }
      const dest = safeJoin(targetDir, rel);
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      fs.writeFileSync(dest, entry.getData());
      written.push(rel);
    }
    try { fs.unlinkSync(tmp); } catch {}

    manifest[modId] = {
      modId,
      modName,
      version,
      versionId,
      installSubdir: installSubdir || "",
      installedAt: new Date().toISOString(),
      files: written,
    };
    writeJson(manifestPath(gameKey), manifest);
    return { ok: true, files: written.length };
  } catch (err) {
    log.warn("mod install failed", err);
    return { ok: false, error: err?.message || String(err) };
  }
});

ipcMain.handle("mods:uninstall", async (_evt, { gameKey, modId }) => {
  try {
    const cfg = readJson(configPath(), {});
    const baseDir = cfg[gameKey]?.gameDataDir;
    if (!baseDir) return { ok: false, error: "Install folder not set" };
    const manifest = readJson(manifestPath(gameKey), {});
    const entry = manifest[modId];
    if (!entry) return { ok: true, removed: 0 };
    const targetDir = entry.installSubdir
      ? path.join(baseDir, entry.installSubdir)
      : baseDir;

    const dirs = new Set();
    let removed = 0;
    for (const rel of entry.files || []) {
      const full = path.join(targetDir, rel);
      try { fs.rmSync(full, { force: true }); removed++; } catch {}
      let d = path.dirname(full);
      const root = path.resolve(targetDir);
      while (d.startsWith(root) && d !== root) { dirs.add(d); d = path.dirname(d); }
      if (entry.installSubdir) dirs.add(root);
    }
    // Prune now-empty dirs (deepest first)
    const sorted = [...dirs].sort((a, b) => b.length - a.length);
    for (const d of sorted) {
      try { if (fs.readdirSync(d).length === 0) fs.rmdirSync(d); } catch {}
    }
    delete manifest[modId];
    writeJson(manifestPath(gameKey), manifest);
    return { ok: true, removed };
  } catch (err) {
    log.warn("mod uninstall failed", err);
    return { ok: false, error: err?.message || String(err) };
  }
});

ipcMain.handle("mods:open-folder", async (_evt, { gameKey }) => {
  const cfg = readJson(configPath(), {});
  const dir = cfg[gameKey]?.gameDataDir;
  if (!dir) return { ok: false, error: "Not set" };
  await shell.openPath(dir);
  return { ok: true };
});

// ---------- Mod adapter: auto-detect / validate / set / list-configured ----------
const os = require("os");

function expandPathHint(t) {
  if (!t || typeof t !== "string") return "";
  const home = os.homedir();
  return t
    .replace(/\{HOME\}/g, home)
    .replace(/\{APPDATA\}/g, process.env.APPDATA || path.join(home, "AppData", "Roaming"))
    .replace(/\{LOCALAPPDATA\}/g, process.env.LOCALAPPDATA || path.join(home, "AppData", "Local"))
    .replace(/\{USERPROFILE\}/g, process.env.USERPROFILE || home)
    .replace(/\{DOCUMENTS\}/g, app.getPath("documents"));
}

function validateGameDir(dir, signatureFiles) {
  try {
    if (!dir || !fs.existsSync(dir)) return { ok: false, reason: "Folder does not exist" };
    if (!fs.statSync(dir).isDirectory()) return { ok: false, reason: "Not a directory" };
    const sigs = Array.isArray(signatureFiles) ? signatureFiles : [];
    if (sigs.length === 0) {
      const items = fs.readdirSync(dir);
      if (items.length === 0) return { ok: false, reason: "Folder is empty" };
      return { ok: true, matched: null };
    }
    for (const sig of sigs) {
      if (fs.existsSync(path.join(dir, sig))) return { ok: true, matched: sig };
    }
    // Permissive fallback: any executable-like file in the dir.
    try {
      const items = fs.readdirSync(dir);
      if (items.some((n) => /\.(exe|app|x86_64|sh)$/i.test(n))) {
        return { ok: true, matched: null };
      }
    } catch { /* ignore */ }
    return { ok: false, reason: "No expected game files found in that folder" };
  } catch (err) {
    return { ok: false, reason: err?.message || String(err) };
  }
}

ipcMain.handle("mods:validate-path", async (_evt, payload) => {
  const { path: p, signatureFiles } = payload || {};
  return validateGameDir(p, signatureFiles);
});

function getSteamRoots() {
  const home = os.homedir();
  if (process.platform === "win32") {
    const roots = [
      "C:\\Program Files (x86)\\Steam",
      "C:\\Program Files\\Steam",
      path.join(home, "AppData", "Local", "Steam"),
    ];
    if (process.env["ProgramFiles(x86)"]) {
      roots.push(path.join(process.env["ProgramFiles(x86)"], "Steam"));
    }
    return roots;
  }
  if (process.platform === "darwin") {
    return [path.join(home, "Library", "Application Support", "Steam")];
  }
  return [
    path.join(home, ".steam", "steam"),
    path.join(home, ".local", "share", "Steam"),
    path.join(home, ".var", "app", "com.valvesoftware.Steam", "data", "Steam"),
  ];
}

function findSteamLibraries() {
  const libs = new Set();
  for (const root of getSteamRoots()) {
    try {
      if (!fs.existsSync(root)) continue;
      libs.add(root);
      const lf = path.join(root, "steamapps", "libraryfolders.vdf");
      if (!fs.existsSync(lf)) continue;
      const text = fs.readFileSync(lf, "utf8");
      const re = /"path"\s+"([^"]+)"/g;
      let m;
      while ((m = re.exec(text))) {
        // Unescape the standard VDF backslashes.
        libs.add(m[1].replace(/\\\\/g, "\\"));
      }
    } catch { /* ignore */ }
  }
  return Array.from(libs);
}

function findSteamGameInstallDir(appId) {
  if (!appId) return null;
  for (const lib of findSteamLibraries()) {
    try {
      const acf = path.join(lib, "steamapps", `appmanifest_${appId}.acf`);
      if (!fs.existsSync(acf)) continue;
      const text = fs.readFileSync(acf, "utf8");
      const m = /"installdir"\s+"([^"]+)"/.exec(text);
      if (!m) continue;
      const full = path.join(lib, "steamapps", "common", m[1]);
      if (fs.existsSync(full)) return full;
    } catch { /* ignore */ }
  }
  return null;
}

ipcMain.handle("mods:auto-detect", async (_evt, adapter) => {
  try {
    const sigs = Array.isArray(adapter?.signatureFiles) ? adapter.signatureFiles : [];
    const candidates = [];
    const seen = new Set();
    const push = (source, p, opts = {}) => {
      if (!p) return;
      const norm = path.resolve(p);
      if (seen.has(norm)) return;
      seen.add(norm);
      const v = validateGameDir(norm, sigs);
      candidates.push({
        source,
        path: norm,
        valid: !!(opts.assumeValid || v.ok),
        matched: v.matched || null,
      });
    };

    if (adapter?.steamAppId) {
      const dir = findSteamGameInstallDir(adapter.steamAppId);
      if (dir) push("Steam", dir, { assumeValid: true });
    }

    if (Array.isArray(adapter?.userPathHints)) {
      for (const hint of adapter.userPathHints) {
        const p = expandPathHint(hint);
        if (p && fs.existsSync(p)) push("Default location", p);
      }
    }

    return { ok: true, candidates };
  } catch (err) {
    return { ok: false, candidates: [], error: err?.message || String(err) };
  }
});

ipcMain.handle("mods:set-folder", async (_evt, { gameKey, path: p }) => {
  if (!gameKey || !p || typeof p !== "string") {
    return { ok: false, error: "gameKey and path are required" };
  }
  if (!fs.existsSync(p)) return { ok: false, error: "Folder does not exist" };
  const cfg = readJson(configPath(), {});
  cfg[gameKey] = { gameDataDir: p };
  writeJson(configPath(), cfg);
  return { ok: true, gameDataDir: p };
});

ipcMain.handle("mods:list-configured", async () => {
  const cfg = readJson(configPath(), {});
  const out = {};
  for (const [k, v] of Object.entries(cfg)) {
    if (v && typeof v === "object" && v.gameDataDir) out[k] = v.gameDataDir;
  }
  return { ok: true, configured: out };
});

ipcMain.handle("mods:remove-folder", async (_evt, { gameKey }) => {
  const cfg = readJson(configPath(), {});
  if (cfg[gameKey]) {
    delete cfg[gameKey];
    writeJson(configPath(), cfg);
  }
  return { ok: true };
});

app.whenReady().then(() => {
  try {
    const isMediaPermission = (permission) => {
      return ["media", "display-capture"].includes(permission);
    };
    session.defaultSession.setPermissionRequestHandler((_webContents, permission, callback) => {
      callback(isMediaPermission(permission));
    });
    session.defaultSession.setPermissionCheckHandler((_webContents, permission) => {
      return isMediaPermission(permission);
    });
  } catch (err) {
    log.warn("capture permission handler unavailable", err);
  }

  // Wire getDisplayMedia → desktopCapturer so the renderer can grab the
  // active screen via the standard web API (Electron ≥30 removed the legacy
  // getUserMedia chromeMediaSource path that the clip buffer used to rely on).
  try {
    session.defaultSession.setDisplayMediaRequestHandler(
      async (_request, callback) => {
        try {
          const sources = await desktopCapturer.getSources({
            types: ["screen", "window"],
            thumbnailSize: { width: 0, height: 0 },
          });
          const match = chooseClipSource(sources);
          if (!match) return callback({});
          callback({ video: match, audio: process.platform === "darwin" ? undefined : "loopback" });
        } catch (err) {
          log.warn("display media handler failed", err);
          callback({});
        }
      },
      { useSystemPicker: false },
    );
  } catch (err) {
    log.warn("setDisplayMediaRequestHandler unavailable", err);
  }

  createWindow();
  registerShortcuts(DEFAULT_HOTKEYS);
});

app.on("will-quit", () => {
  globalShortcut.unregisterAll();
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
