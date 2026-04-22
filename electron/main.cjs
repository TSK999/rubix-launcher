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

app.whenReady().then(createWindow);

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
