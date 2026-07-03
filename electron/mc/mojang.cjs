// Mojang piston-meta / piston-data asset pipeline.
// Ensures a Minecraft version's client jar, libraries, natives, asset index,
// and every asset object is present in the shared cache dirs. Emits progress
// via a caller-supplied callback so we can update the UI.

const fs = require("fs");
const path = require("path");
const AdmZip = require("adm-zip");
const { getJson, download, pool, sha1Of } = require("./http.cjs");
const {
  VERSIONS_DIR,
  VERSION_DIR,
  LIBRARIES_DIR,
  ASSETS_INDEXES_DIR,
  ASSETS_OBJECTS_DIR,
  ensureDir,
} = require("./paths.cjs");

const MANIFEST_URL = "https://launchermeta.mojang.com/mc/game/version_manifest_v2.json";
const RESOURCES_URL = "https://resources.download.minecraft.net";

// Fetch (and cache) the version manifest and pick a single version entry.
async function getVersionEntry(mcVersion) {
  const manifest = await getJson(MANIFEST_URL);
  const entry = manifest.versions.find((v) => v.id === mcVersion);
  if (!entry) throw new Error(`Unknown Minecraft version: ${mcVersion}`);
  return entry;
}

// Fetch (and cache) the per-version JSON.
async function getVersionJson(entry) {
  const localPath = path.join(VERSION_DIR(entry.id), `${entry.id}.json`);
  if (fs.existsSync(localPath)) {
    try {
      const json = JSON.parse(fs.readFileSync(localPath, "utf-8"));
      if (json.id) return json;
    } catch { /* re-download */ }
  }
  ensureDir(path.dirname(localPath));
  await download(entry.url, localPath, entry.sha1);
  return JSON.parse(fs.readFileSync(localPath, "utf-8"));
}

function platformName() {
  if (process.platform === "win32") return "windows";
  if (process.platform === "darwin") return "osx";
  return "linux";
}

function ruleApplies(rule) {
  // This returns whether the rule CONDITIONS match the current launcher state;
  // rulesAllow() applies the action. The previous implementation mixed action
  // and condition logic, so a macOS-only disallow rule could disallow Windows,
  // and feature-gated allow rules could leak empty args.
  const os = rule.os;
  if (os) {
    if (os.name && os.name !== platformName()) return false;
    if (os.arch) {
      const wantArch = os.arch === "x86" ? "ia32" : os.arch;
      if (process.arch !== wantArch) return false;
    }
  }

  // We do not currently enable optional launcher features (demo user, custom
  // resolution, quick-play, etc.). Treat all feature flags as false and only
  // match rules whose requested feature values equal that state.
  const features = rule.features || null;
  if (features && Object.keys(features).length > 0) {
    for (const [key, expected] of Object.entries(features)) {
      const actual = false;
      if (actual !== !!expected) return false;
    }
  }

  return true;
}

function rulesAllow(rules) {
  if (!rules || rules.length === 0) return true;
  let allowed = false;
  for (const r of rules) {
    if (ruleApplies(r)) allowed = r.action === "allow";
  }
  return allowed;
}

function nativeClassifier(lib) {
  const key = process.platform === "win32" ? "natives-windows"
    : process.platform === "darwin" ? "natives-osx"
    : "natives-linux";
  // Some libs use natives-macos or arch-specific classifiers
  if (lib.natives) {
    const map = lib.natives;
    const os = platformName();
    const raw = map[os] || map[os === "osx" ? "macos" : ""] || null;
    if (!raw) return null;
    return raw.replace("${arch}", process.arch === "x64" ? "64" : "32");
  }
  // Modern (1.19+) libs put natives under downloads.classifiers with the
  // key already looking like "natives-linux".
  if (lib.downloads?.classifiers?.[key]) return key;
  return null;
}

// Walk lib list, download primary artifact + native jar. Extract natives into
// the shared natives dir for that MC version. Returns list of classpath entries
// (absolute paths to jars, excluding natives which go on -Djava.library.path).
async function ensureLibraries(versionJson, onProgress) {
  const libs = (versionJson.libraries || []).filter((l) => rulesAllow(l.rules));
  const nativesDir = path.join(VERSION_DIR(versionJson.id), "natives");
  ensureDir(nativesDir);
  const classpath = new Array(libs.length).fill(null);
  const total = libs.length;
  let done = 0;

  await pool(libs.map((lib, index) => ({ lib, index })), 8, async ({ lib, index }) => {
    // Main artifact
    const art = lib.downloads?.artifact;
    if (art?.path && art?.url) {
      const dest = path.join(LIBRARIES_DIR(), art.path);
      await download(art.url, dest, art.sha1);
      classpath[index] = dest;
    } else if (lib.name) {
      // Loader libs sometimes provide only name+url (Fabric/Forge style), or
      // omit downloads.artifact while still being resolvable from a Maven repo.
      const cp = mavenPath(lib.name);
      const dest = path.join(LIBRARIES_DIR(), cp);
      const url = (lib.url || "https://libraries.minecraft.net/").replace(/\/?$/, "/") + cp;
      try {
        await download(url, dest);
        classpath[index] = dest;
      } catch { /* skip unresolvable */ }
    }

    // Native jar
    const nk = nativeClassifier(lib);
    if (nk) {
      const nat = lib.downloads?.classifiers?.[nk];
      if (nat?.url) {
        const natJar = path.join(LIBRARIES_DIR(), nat.path);
        await download(nat.url, natJar, nat.sha1);
        try { extractNatives(natJar, nativesDir, lib.extract?.exclude || []); }
        catch { /* ignore native extract errors — game may still start */ }
      }
    }

    done++;
    if (onProgress) onProgress({ phase: "libraries", done, total, current: lib.name });
  });

  return { classpath: classpath.filter(Boolean), nativesDir };
}

function extractNatives(jarPath, destDir, exclude) {
  const zip = new AdmZip(jarPath);
  ensureDir(destDir);
  for (const e of zip.getEntries()) {
    if (e.isDirectory) continue;
    const name = e.entryName;
    if (exclude.some((p) => name.startsWith(p))) continue;
    // Skip META-INF and non-native files
    if (name.startsWith("META-INF/")) continue;
    if (!/\.(dll|so|dylib|jnilib)$/i.test(name)) continue;
    const out = path.join(destDir, path.basename(name));
    fs.writeFileSync(out, e.getData());
  }
}

function mavenPath(coord) {
  // "group:artifact:version" or "group:artifact:version:classifier"
  const parts = coord.split(":");
  const [group, artifact, version, classifier] = parts;
  const cls = classifier ? `-${classifier}` : "";
  return `${group.replace(/\./g, "/")}/${artifact}/${version}/${artifact}-${version}${cls}.jar`;
}

// Client jar
async function ensureClientJar(versionJson, onProgress) {
  const client = versionJson.downloads?.client;
  if (!client?.url) throw new Error("Version JSON missing client download");
  const dest = path.join(VERSION_DIR(versionJson.id), `${versionJson.id}.jar`);
  await download(client.url, dest, client.sha1);
  if (onProgress) onProgress({ phase: "client", done: 1, total: 1, current: versionJson.id });
  return dest;
}

// Asset index + every asset object
async function ensureAssets(versionJson, onProgress) {
  const ai = versionJson.assetIndex;
  if (!ai?.url) throw new Error("Version JSON missing assetIndex");
  const idxPath = path.join(ASSETS_INDEXES_DIR(), `${ai.id}.json`);
  await download(ai.url, idxPath, ai.sha1);
  const idx = JSON.parse(fs.readFileSync(idxPath, "utf-8"));
  const objects = Object.entries(idx.objects || {});
  const total = objects.length;
  let done = 0;

  await pool(objects, 8, async ([_name, obj]) => {
    const hash = obj.hash;
    const sub = hash.substring(0, 2);
    const dest = path.join(ASSETS_OBJECTS_DIR(), sub, hash);
    // Skip if already correct.
    if (fs.existsSync(dest)) {
      try {
        const have = await sha1Of(dest);
        if (have === hash) { done++; if (onProgress) onProgress({ phase: "assets", done, total }); return; }
      } catch { /* re-download */ }
    }
    await download(`${RESOURCES_URL}/${sub}/${hash}`, dest, hash);
    done++;
    if (onProgress && (done % 25 === 0 || done === total)) {
      onProgress({ phase: "assets", done, total });
    }
  });

  return { indexId: ai.id, totalAssets: total };
}

// One-call top-level: ensure everything vanilla we need to launch <mc>.
async function ensureVersion(mcVersion, onProgress) {
  const entry = await getVersionEntry(mcVersion);
  const vj = await getVersionJson(entry);
  const clientJar = await ensureClientJar(vj, onProgress);
  const { classpath, nativesDir } = await ensureLibraries(vj, onProgress);
  const { indexId } = await ensureAssets(vj, onProgress);
  return { versionJson: vj, clientJar, classpath, nativesDir, assetIndexId: indexId };
}

module.exports = {
  getVersionEntry,
  getVersionJson,
  ensureVersion,
  ensureLibraries,
  ensureClientJar,
  ensureAssets,
  rulesAllow,
  mavenPath,
};
