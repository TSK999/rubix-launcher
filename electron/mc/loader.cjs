// Headless install of a modloader (Fabric / Quilt / NeoForge / Forge) into
// the shared versions/ directory, then merge the resulting version JSON with
// the vanilla one so launch.cjs has a single set of libraries + mainClass +
// arguments to work with.

const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");
const { download, requestRaw } = require("./http.cjs");
const {
  VERSIONS_DIR,
  VERSION_DIR,
  ROOT,
  INSTALLER_CACHE,
  ensureDir,
} = require("./paths.cjs");

function installerUrl(loader, mc, lv) {
  const L = String(loader).toLowerCase();
  if (L === "fabric") {
    // Pinned fabric-installer release. The loader version (`lv`) is passed to
    // the installer via `-loader` separately — it is NOT the installer version.
    const v = "1.0.1";
    return {
      url: `https://maven.fabricmc.net/net/fabricmc/fabric-installer/${v}/fabric-installer-${v}.jar`,
      file: `fabric-installer-${v}.jar`,
    };
  }
  if (L === "quilt") {
    const v = "0.9.2";
    return {
      url: `https://maven.quiltmc.org/repository/release/org/quiltmc/quilt-installer/${v}/quilt-installer-${v}.jar`,
      file: `quilt-installer-${v}.jar`,
    };
  }
  if (L === "neoforge") {
    if (!lv) return null;
    return {
      url: `https://maven.neoforged.net/releases/net/neoforged/neoforge/${lv}/neoforge-${lv}-installer.jar`,
      file: `neoforge-${lv}-installer.jar`,
    };
  }
  if (L === "forge") {
    if (!lv) return null;
    return {
      url: `https://maven.minecraftforge.net/net/minecraftforge/forge/${mc}-${lv}/forge-${mc}-${lv}-installer.jar`,
      file: `forge-${mc}-${lv}-installer.jar`,
    };
  }
  return null;
}

async function verifyInstallerUrl(loader, spec) {
  // HEAD-style probe (GET; requestRaw handles redirects). Gives a clear
  // "installer not found" message instead of a low-level 404 from download().
  try {
    const res = await requestRaw(spec.url, { method: "GET" });
    if (res.status === 404) {
      throw new Error(
        `${loader} installer not found at ${spec.url}. The version may not exist or was removed upstream.`
      );
    }
    if (res.status < 200 || res.status >= 400) {
      throw new Error(`${loader} installer URL returned HTTP ${res.status}: ${spec.url}`);
    }
  } catch (e) {
    if (e && e.message && e.message.startsWith(`${loader} installer`)) throw e;
    throw new Error(`Could not reach ${loader} installer URL (${spec.url}): ${e.message || e}`);
  }
}

async function cacheInstaller(loader, mc, lv) {
  const spec = installerUrl(loader, mc, lv);
  if (!spec) return null;
  ensureDir(INSTALLER_CACHE());
  const dest = path.join(INSTALLER_CACHE(), spec.file);
  if (!fs.existsSync(dest)) await verifyInstallerUrl(loader, spec);
  await download(spec.url, dest);
  return dest;
}

function runJava(javaBin, args, cwd) {
  return new Promise((resolve) => {
    const child = spawn(javaBin, args, { cwd, stdio: ["ignore", "pipe", "pipe"] });
    let out = "", err = "";
    child.stdout.on("data", (c) => { out += c.toString("utf-8"); });
    child.stderr.on("data", (c) => { err += c.toString("utf-8"); });
    child.on("error", (e) => resolve({ status: -1, out, err: err + "\n" + e.message }));
    child.on("close", (status) => resolve({ status, out, err }));
  });
}

// Names of the profile/version dir the installers write under versions/.
function loaderVersionId(loader, mc, lv) {
  const L = String(loader).toLowerCase();
  if (L === "fabric") return `fabric-loader-${lv}-${mc}`;
  if (L === "quilt") return `quilt-loader-${lv}-${mc}`;
  if (L === "neoforge") return `neoforge-${lv}`;
  if (L === "forge") return `${mc}-forge-${lv}`;
  return null;
}

// Merge a loader's version JSON with its parent (vanilla). Handles the common
// `inheritsFrom` case + Fabric-style libraries/arguments arrays.
function mergeVersionJson(child, parent) {
  const merged = { ...parent };
  merged.id = child.id;
  merged.mainClass = child.mainClass || parent.mainClass;
  merged.type = child.type || parent.type;
  merged.releaseTime = child.releaseTime || parent.releaseTime;
  merged.time = child.time || parent.time;

  // Libraries: loader libs go FIRST so their versions take precedence.
  const parentLibs = parent.libraries || [];
  const childLibs = child.libraries || [];
  merged.libraries = [...childLibs, ...parentLibs];

  // Arguments merge (Mojang 1.13+ arguments.game / arguments.jvm arrays)
  if (parent.arguments || child.arguments) {
    merged.arguments = {
      game: [...(parent.arguments?.game || []), ...(child.arguments?.game || [])],
      jvm: [...(parent.arguments?.jvm || []), ...(child.arguments?.jvm || [])],
    };
  }
  // Legacy minecraftArguments (pre-1.13)
  if (child.minecraftArguments || parent.minecraftArguments) {
    merged.minecraftArguments = child.minecraftArguments || parent.minecraftArguments;
  }

  return merged;
}

// Ensure the loader version JSON exists. Returns the merged version JSON.
async function ensureLoader({ loader, mc, loaderVersion, javaBin, vanillaJson, onProgress }) {
  const L = String(loader).toLowerCase();
  if (!L || L === "vanilla") return vanillaJson;

  const lvId = loaderVersionId(L, mc, loaderVersion);
  if (!lvId) throw new Error(`Unsupported loader: ${loader}`);
  const versionJsonPath = path.join(VERSION_DIR(lvId), `${lvId}.json`);

  if (!fs.existsSync(versionJsonPath)) {
    if (onProgress) onProgress({ phase: "loader", done: 0, total: 1, current: `Installing ${loader} ${loaderVersion || ""}` });
    const installer = await cacheInstaller(L, mc, loaderVersion);
    if (!installer) throw new Error(`Cannot locate ${loader} installer for MC ${mc} / ${loaderVersion}`);
    const mcRoot = ROOT();
    ensureDir(mcRoot);

    // Forge/NeoForge installers refuse to run without a launcher_profiles.json
    // in the target directory ("you need to run the launcher first!"). Write
    // a stub so the headless install proceeds.
    if (L === "forge" || L === "neoforge") {
      const profilesPath = path.join(mcRoot, "launcher_profiles.json");
      if (!fs.existsSync(profilesPath)) {
        fs.writeFileSync(
          profilesPath,
          JSON.stringify({ profiles: {}, settings: {}, version: 3 }, null, 2)
        );
      }
    }

    let args;
    if (L === "fabric" || L === "quilt") {
      args = ["-jar", installer,
        "client",
        "-dir", mcRoot,
        "-mcversion", mc,
        "-loader", loaderVersion || "",
        "-noprofile",
      ];
    } else {
      // Forge / NeoForge legacy CLI
      args = ["-jar", installer, "--installClient", mcRoot];
    }
    const r = await runJava(javaBin, args, mcRoot);
    if (r.status !== 0) {
      throw new Error(`${loader} installer failed (${r.status}): ${(r.err || r.out).slice(-400)}`);
    }
  }

  if (!fs.existsSync(versionJsonPath)) {
    throw new Error(`${loader} installer ran but did not create ${versionJsonPath}`);
  }
  const child = JSON.parse(fs.readFileSync(versionJsonPath, "utf-8"));
  const merged = mergeVersionJson(child, vanillaJson);
  if (onProgress) onProgress({ phase: "loader", done: 1, total: 1, current: `${loader} ready` });
  return merged;
}

module.exports = { ensureLoader, cacheInstaller, loaderVersionId, mergeVersionJson };
