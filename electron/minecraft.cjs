// RUBIX Minecraft mini-launcher backend.
// Handles instances, loader install (best-effort), CF mod download,
// modpack import, and launching via the official Minecraft Launcher
// (because writing a full Java launcher is out of scope here).
//
// Storage: ~/.rubix/minecraft/
//   instances.json                 ← registry { [name]: { name, mcVersion, loader, loaderVersion, createdAt, lastPlayed, ramMb, javaPath } }
//   loader-installers/             ← cached loader installer jars
//   instances/<name>/
//     mods/  config/  resourcepacks/  saves/  screenshots/
//     installed-mods.json          ← { [projectId]: { projectId, fileId, fileName, name, dependencies:[ids] } }
//     instance.json                ← per-instance metadata snapshot

const { app, ipcMain, dialog, shell } = require("electron");
const path = require("path");
const fs = require("fs");
const fsp = fs.promises;
const https = require("https");
const { spawn, spawnSync } = require("child_process");

const ROOT = () => path.join(app.getPath("home"), ".rubix", "minecraft");
const INSTANCES_DIR = () => path.join(ROOT(), "instances");
const REGISTRY = () => path.join(ROOT(), "instances.json");
const INSTALLER_CACHE = () => path.join(ROOT(), "loader-installers");

function ensureDir(p) {
  fs.mkdirSync(p, { recursive: true });
}

function readJson(p, fallback) {
  try { return JSON.parse(fs.readFileSync(p, "utf-8")); } catch { return fallback; }
}
function writeJson(p, obj) {
  ensureDir(path.dirname(p));
  fs.writeFileSync(p, JSON.stringify(obj, null, 2), "utf-8");
}

function safeName(n) {
  return String(n || "").replace(/[\\/:*?"<>|]+/g, "_").trim();
}

function instanceDir(name) {
  return path.join(INSTANCES_DIR(), safeName(name));
}

function readRegistry() {
  return readJson(REGISTRY(), {});
}
function writeRegistry(reg) {
  writeJson(REGISTRY(), reg);
}

// ---------- Download helper ----------
function downloadTo(url, destPath, redirectsLeft = 5) {
  return new Promise((resolve, reject) => {
    ensureDir(path.dirname(destPath));
    const tmp = destPath + ".part";
    const file = fs.createWriteStream(tmp);
    https.get(url, { headers: { "User-Agent": "RUBIX/1.0" } }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        file.close(); fs.unlink(tmp, () => {});
        if (redirectsLeft <= 0) return reject(new Error("Too many redirects"));
        return resolve(downloadTo(res.headers.location, destPath, redirectsLeft - 1));
      }
      if (res.statusCode < 200 || res.statusCode >= 300) {
        file.close(); fs.unlink(tmp, () => {});
        return reject(new Error(`HTTP ${res.statusCode} for ${url}`));
      }
      res.pipe(file);
      file.on("finish", () => file.close(() => {
        fs.rename(tmp, destPath, (err) => err ? reject(err) : resolve(destPath));
      }));
    }).on("error", (err) => { fs.unlink(tmp, () => {}); reject(err); });
  });
}

// ---------- Java detection ----------
function detectJava() {
  try {
    const r = spawnSync("java", ["-version"], { encoding: "utf-8" });
    if (r.status === 0 || r.stderr) {
      const out = (r.stderr || r.stdout || "").trim();
      const m = out.match(/version "([^"]+)"/);
      return { ok: true, version: m ? m[1] : "unknown", path: "java" };
    }
  } catch (_e) { /* ignore */ }
  return { ok: false, error: "Java not found on PATH" };
}

// ---------- Folder size ----------
function dirSize(p) {
  let total = 0;
  try {
    const entries = fs.readdirSync(p, { withFileTypes: true });
    for (const e of entries) {
      const full = path.join(p, e.name);
      try {
        if (e.isDirectory()) total += dirSize(full);
        else if (e.isFile()) total += fs.statSync(full).size;
      } catch (_e) { /* ignore */ }
    }
  } catch (_e) { /* ignore */ }
  return total;
}

// ---------- IPC: meta ----------
ipcMain.handle("mc:env", async () => {
  ensureDir(ROOT());
  ensureDir(INSTANCES_DIR());
  return { ok: true, root: ROOT(), java: detectJava() };
});

ipcMain.handle("mc:list-instances", async () => {
  ensureDir(INSTANCES_DIR());
  const reg = readRegistry();
  const items = Object.values(reg).map((inst) => {
    const dir = instanceDir(inst.name);
    const modsDir = path.join(dir, "mods");
    let modCount = 0;
    try {
      modCount = fs.readdirSync(modsDir).filter((f) => f.endsWith(".jar") || f.endsWith(".jar.disabled")).length;
    } catch (_e) { /* ignore */ }
    return { ...inst, dir, modCount, sizeBytes: dirSize(dir) };
  });
  return { ok: true, instances: items };
});

ipcMain.handle("mc:get-instance", async (_e, { name }) => {
  const reg = readRegistry();
  const inst = reg[name];
  if (!inst) return { ok: false, error: "Instance not found" };
  const dir = instanceDir(name);
  const installed = readJson(path.join(dir, "installed-mods.json"), {});
  return { ok: true, instance: { ...inst, dir }, installed };
});

// ---------- IPC: create instance ----------
ipcMain.handle("mc:create-instance", async (_e, payload) => {
  try {
    const { name, mcVersion, loader, loaderVersion } = payload || {};
    if (!name || !mcVersion || !loader) {
      return { ok: false, error: "Missing fields" };
    }
    const java = detectJava();
    if (!java.ok) {
      return { ok: false, error: "Java is not installed. Install Java 17+ from adoptium.net then try again." };
    }
    const reg = readRegistry();
    if (reg[name]) return { ok: false, error: "Instance with that name already exists" };

    const dir = instanceDir(name);
    if (fs.existsSync(dir)) return { ok: false, error: "Folder already exists" };
    for (const sub of ["mods", "config", "resourcepacks", "saves", "screenshots"]) {
      ensureDir(path.join(dir, sub));
    }

    // Best-effort: cache loader installer jar for the user. Running headless
    // install reliably across Forge/NeoForge/Quilt is out of scope; the jar
    // is downloaded so the user can double-click to install if desired.
    let installerPath = null;
    try {
      installerPath = await cacheLoaderInstaller(loader, mcVersion, loaderVersion);
    } catch (err) {
      // non-fatal
      installerPath = null;
    }

    const inst = {
      name, mcVersion, loader, loaderVersion: loaderVersion || "",
      createdAt: new Date().toISOString(),
      lastPlayed: null,
      ramMb: 2048,
      javaPath: "java",
      installerPath,
    };
    writeJson(path.join(dir, "instance.json"), inst);
    writeJson(path.join(dir, "installed-mods.json"), {});
    reg[name] = inst;
    writeRegistry(reg);
    return { ok: true, instance: { ...inst, dir } };
  } catch (err) {
    return { ok: false, error: String(err?.message || err) };
  }
});

async function cacheLoaderInstaller(loader, mc, lv) {
  ensureDir(INSTALLER_CACHE());
  let url = null; let filename = null;
  const L = String(loader).toLowerCase();
  if (L === "fabric") {
    // Fabric's "installer" jar; same installer for all MC versions.
    const v = lv || "1.0.1";
    url = `https://maven.fabricmc.net/net/fabricmc/fabric-installer/${v}/fabric-installer-${v}.jar`;
    filename = `fabric-installer-${v}.jar`;
  } else if (L === "quilt") {
    const v = lv || "0.9.2";
    url = `https://maven.quiltmc.org/repository/release/org/quiltmc/quilt-installer/${v}/quilt-installer-${v}.jar`;
    filename = `quilt-installer-${v}.jar`;
  } else if (L === "neoforge") {
    if (!lv) return null;
    url = `https://maven.neoforged.net/releases/net/neoforged/neoforge/${lv}/neoforge-${lv}-installer.jar`;
    filename = `neoforge-${lv}-installer.jar`;
  } else if (L === "forge") {
    if (!lv) return null;
    url = `https://maven.minecraftforge.net/net/minecraftforge/forge/${mc}-${lv}/forge-${mc}-${lv}-installer.jar`;
    filename = `forge-${mc}-${lv}-installer.jar`;
  } else {
    return null;
  }
  const dest = path.join(INSTALLER_CACHE(), filename);
  if (fs.existsSync(dest)) return dest;
  await downloadTo(url, dest);
  return dest;
}

// ---------- IPC: instance ops ----------
ipcMain.handle("mc:rename-instance", async (_e, { from, to }) => {
  const reg = readRegistry();
  if (!reg[from]) return { ok: false, error: "Not found" };
  if (reg[to]) return { ok: false, error: "Name taken" };
  const fromDir = instanceDir(from);
  const toDir = instanceDir(to);
  try {
    fs.renameSync(fromDir, toDir);
    const inst = { ...reg[from], name: to };
    delete reg[from]; reg[to] = inst;
    writeJson(path.join(toDir, "instance.json"), inst);
    writeRegistry(reg);
    return { ok: true };
  } catch (err) { return { ok: false, error: String(err?.message || err) }; }
});

ipcMain.handle("mc:duplicate-instance", async (_e, { name, newName }) => {
  const reg = readRegistry();
  if (!reg[name]) return { ok: false, error: "Not found" };
  if (reg[newName]) return { ok: false, error: "Name taken" };
  try {
    copyDirSync(instanceDir(name), instanceDir(newName));
    const inst = { ...reg[name], name: newName, createdAt: new Date().toISOString(), lastPlayed: null };
    reg[newName] = inst;
    writeJson(path.join(instanceDir(newName), "instance.json"), inst);
    writeRegistry(reg);
    return { ok: true };
  } catch (err) { return { ok: false, error: String(err?.message || err) }; }
});

function copyDirSync(src, dst) {
  ensureDir(dst);
  for (const e of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, e.name);
    const d = path.join(dst, e.name);
    if (e.isDirectory()) copyDirSync(s, d);
    else if (e.isFile()) fs.copyFileSync(s, d);
  }
}

ipcMain.handle("mc:delete-instance", async (_e, { name }) => {
  const reg = readRegistry();
  if (!reg[name]) return { ok: false, error: "Not found" };
  try {
    fs.rmSync(instanceDir(name), { recursive: true, force: true });
    delete reg[name]; writeRegistry(reg);
    return { ok: true };
  } catch (err) { return { ok: false, error: String(err?.message || err) }; }
});

ipcMain.handle("mc:open-instance-folder", async (_e, { name }) => {
  const dir = instanceDir(name);
  if (!fs.existsSync(dir)) return { ok: false, error: "Not found" };
  await shell.openPath(dir);
  return { ok: true };
});

ipcMain.handle("mc:update-instance", async (_e, { name, patch }) => {
  const reg = readRegistry();
  if (!reg[name]) return { ok: false, error: "Not found" };
  reg[name] = { ...reg[name], ...(patch || {}) };
  writeRegistry(reg);
  writeJson(path.join(instanceDir(name), "instance.json"), reg[name]);
  return { ok: true, instance: reg[name] };
});

// ---------- IPC: mods ----------
ipcMain.handle("mc:install-mod", async (_e, payload) => {
  try {
    const { instance, projectId, fileId, fileName, name, downloadUrl, dependencies } = payload;
    const dir = instanceDir(instance);
    if (!fs.existsSync(dir)) return { ok: false, error: "Instance not found" };
    const modsDir = path.join(dir, "mods");
    ensureDir(modsDir);
    const dest = path.join(modsDir, fileName);
    await downloadTo(downloadUrl, dest);
    const installed = readJson(path.join(dir, "installed-mods.json"), {});
    installed[String(projectId)] = {
      projectId, fileId, fileName, name,
      dependencies: dependencies || [],
      installedAt: new Date().toISOString(),
      enabled: true,
    };
    writeJson(path.join(dir, "installed-mods.json"), installed);
    return { ok: true };
  } catch (err) { return { ok: false, error: String(err?.message || err) }; }
});

ipcMain.handle("mc:uninstall-mod", async (_e, { instance, projectId }) => {
  const dir = instanceDir(instance);
  const installed = readJson(path.join(dir, "installed-mods.json"), {});
  const entry = installed[String(projectId)];
  if (!entry) return { ok: false, error: "Not installed" };
  for (const ext of ["", ".disabled"]) {
    const f = path.join(dir, "mods", entry.fileName + ext);
    try { fs.unlinkSync(f); } catch (_e) { /* ignore */ }
  }
  delete installed[String(projectId)];
  writeJson(path.join(dir, "installed-mods.json"), installed);
  return { ok: true };
});

ipcMain.handle("mc:toggle-mod", async (_e, { instance, projectId, enabled }) => {
  const dir = instanceDir(instance);
  const installed = readJson(path.join(dir, "installed-mods.json"), {});
  const entry = installed[String(projectId)];
  if (!entry) return { ok: false, error: "Not installed" };
  const onPath = path.join(dir, "mods", entry.fileName);
  const offPath = onPath + ".disabled";
  try {
    if (enabled && fs.existsSync(offPath)) fs.renameSync(offPath, onPath);
    if (!enabled && fs.existsSync(onPath)) fs.renameSync(onPath, offPath);
    entry.enabled = !!enabled;
    installed[String(projectId)] = entry;
    writeJson(path.join(dir, "installed-mods.json"), installed);
    return { ok: true };
  } catch (err) { return { ok: false, error: String(err?.message || err) }; }
});

// ---------- IPC: modpack import (CF .zip) ----------
ipcMain.handle("mc:import-modpack", async (_e, { instanceName }) => {
  const result = await dialog.showOpenDialog({
    title: "Import CurseForge modpack",
    filters: [{ name: "Modpack", extensions: ["zip"] }],
    properties: ["openFile"],
  });
  if (result.canceled || !result.filePaths[0]) return { ok: false, canceled: true };
  const zipPath = result.filePaths[0];
  try {
    // Parse manifest.json without unzip dependency: shell out to system unzip.
    const tmpDir = path.join(app.getPath("temp"), `rubix-mp-${Date.now()}`);
    ensureDir(tmpDir);
    const unzip = spawnSync("unzip", ["-o", zipPath, "-d", tmpDir]);
    if (unzip.status !== 0) {
      return { ok: false, error: "Failed to extract modpack (system unzip required)" };
    }
    const manifest = readJson(path.join(tmpDir, "manifest.json"), null);
    if (!manifest) return { ok: false, error: "Modpack manifest.json not found" };
    const mc = manifest?.minecraft?.version || "";
    const rawLoader = (manifest?.minecraft?.modLoaders ?? [])[0]?.id || "";
    const [loaderName, loaderVersion] = rawLoader.split("-");
    const loader = (loaderName || "vanilla").replace(/^([a-z])/, (c) => c.toUpperCase());
    const name = instanceName || manifest.name || `Modpack ${Date.now()}`;
    // Create instance
    const create = await ipcMain._invokeHandlers?.get("mc:create-instance")?.(_e, {
      name, mcVersion: mc, loader, loaderVersion,
    });
    // Fallback: direct create
    let inst = create?.instance;
    if (!inst) {
      const reg = readRegistry();
      if (reg[name]) return { ok: false, error: "Instance name taken" };
      const dir = instanceDir(name);
      for (const sub of ["mods", "config", "resourcepacks", "saves", "screenshots"]) ensureDir(path.join(dir, sub));
      inst = { name, mcVersion: mc, loader, loaderVersion, createdAt: new Date().toISOString(), lastPlayed: null, ramMb: 2048, javaPath: "java" };
      writeJson(path.join(dir, "instance.json"), inst);
      writeJson(path.join(dir, "installed-mods.json"), {});
      reg[name] = inst; writeRegistry(reg);
    }
    // Copy overrides/
    const overrides = path.join(tmpDir, manifest.overrides || "overrides");
    if (fs.existsSync(overrides)) copyDirSync(overrides, instanceDir(name));
    // Return files-to-fetch so the renderer can resolve & download via CF API
    const files = (manifest.files ?? []).map((f) => ({
      projectID: f.projectID, fileID: f.fileID, required: f.required !== false,
    }));
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch (_e) { /* ignore */ }
    return { ok: true, instance: name, mcVersion: mc, loader, loaderVersion, files };
  } catch (err) {
    return { ok: false, error: String(err?.message || err) };
  }
});

// ---------- IPC: launch ----------
// Strategy: locate the official Minecraft Launcher and open it with the
// instance directory as a game directory profile hint. If not found, open
// the instance folder and surface guidance to the user.
ipcMain.handle("mc:launch", async (_e, { name }) => {
  const reg = readRegistry();
  const inst = reg[name];
  if (!inst) return { ok: false, error: "Instance not found" };
  const dir = instanceDir(name);
  const launcher = findMinecraftLauncher();
  if (!launcher) {
    await shell.openPath(dir);
    return {
      ok: false,
      error: "Minecraft Launcher not found. Open the instance folder, then point your launcher's Game Directory at it.",
      openedFolder: true,
    };
  }
  try {
    const child = spawn(launcher.path, launcher.args, { detached: true, stdio: "ignore" });
    child.unref();
    reg[name] = { ...inst, lastPlayed: new Date().toISOString() };
    writeRegistry(reg);
    return { ok: true, launched: launcher.path, gameDir: dir };
  } catch (err) {
    return { ok: false, error: String(err?.message || err) };
  }
});

function findMinecraftLauncher() {
  const candidates = [];
  if (process.platform === "win32") {
    candidates.push("C:\\Program Files (x86)\\Minecraft Launcher\\MinecraftLauncher.exe");
    candidates.push("C:\\Program Files\\Minecraft Launcher\\MinecraftLauncher.exe");
    candidates.push(path.join(app.getPath("appData"), "..", "Local", "Packages", "Microsoft.4297127D64EC6_8wekyb3d8bbwe", "LocalCache", "Local", "runtime"));
    // Xbox app version
    candidates.push("C:\\XboxGames\\Minecraft Launcher\\Content\\Minecraft.exe");
  } else if (process.platform === "darwin") {
    candidates.push("/Applications/Minecraft.app/Contents/MacOS/launcher");
    candidates.push("/Applications/Minecraft.app");
  } else {
    candidates.push("/usr/bin/minecraft-launcher");
    candidates.push("/usr/local/bin/minecraft-launcher");
    candidates.push("/snap/bin/mc-installer");
  }
  for (const c of candidates) {
    try { if (fs.existsSync(c)) return { path: c, args: [] }; } catch (_e) { /* ignore */ }
  }
  return null;
}

module.exports = {};
