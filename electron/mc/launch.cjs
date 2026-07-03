// Build the java command line from a (possibly loader-merged) version JSON
// and spawn Minecraft. Streams stdout/stderr to <instance>/logs/latest.log,
// resolves when the JVM exits.

const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");
const { rulesAllow } = require("./mojang.cjs");
const { INSTANCE_DIR, ASSETS_DIR, ensureDir } = require("./paths.cjs");

// Expand ${var} placeholders using a values map.
function expand(str, vars) {
  return String(str).replace(/\$\{([^}]+)\}/g, (_m, k) => (k in vars ? vars[k] : ""));
}

// Some entries in arguments.jvm / arguments.game are objects with rules +
// value(s). Filter to values that apply on this platform.
function flattenArgs(list, vars) {
  const out = [];
  for (const item of list || []) {
    if (typeof item === "string") {
      out.push(expand(item, vars));
    } else if (item && typeof item === "object") {
      if (!rulesAllow(item.rules)) continue;
      const vals = Array.isArray(item.value) ? item.value : [item.value];
      for (const v of vals) if (typeof v === "string") out.push(expand(v, vars));
    }
  }
  return out;
}

async function launchGame({
  javaBin,
  versionJson,
  clientJar,
  classpath,
  nativesDir,
  instanceName,
  account,
  ramMb = 2048,
  onExit,
}) {
  const gameDir = INSTANCE_DIR(instanceName);
  ensureDir(path.join(gameDir, "logs"));
  const cpSep = process.platform === "win32" ? ";" : ":";
  const fullCp = [...classpath, clientJar].join(cpSep);

  const vars = {
    auth_player_name: account.name,
    version_name: versionJson.id,
    game_directory: gameDir,
    assets_root: ASSETS_DIR(),
    assets_index_name: versionJson.assets || versionJson.assetIndex?.id || "legacy",
    auth_uuid: account.uuid,
    auth_access_token: account.accessToken,
    auth_xuid: account.uuid,
    clientid: "rubix-launcher",
    user_type: "msa",
    version_type: versionJson.type || "release",
    natives_directory: nativesDir,
    launcher_name: "RUBIX",
    launcher_version: "1.0",
    classpath: fullCp,
    user_properties: "{}",
  };

  const jvmArgs = [];
  jvmArgs.push(`-Xmx${ramMb}M`, `-Xms${Math.min(512, ramMb)}M`);

  if (versionJson.arguments?.jvm) {
    jvmArgs.push(...flattenArgs(versionJson.arguments.jvm, vars));
  } else {
    // Legacy (<= 1.12) — no explicit jvm args, apply sensible defaults
    jvmArgs.push(`-Djava.library.path=${nativesDir}`, "-cp", fullCp);
  }
  // Some loaders (Fabric) don't include -cp in jvm args. Guarantee we have one.
  if (!jvmArgs.includes("-cp") && !jvmArgs.includes("-classpath")) {
    jvmArgs.push("-cp", fullCp);
  }

  const gameArgs = versionJson.arguments?.game
    ? flattenArgs(versionJson.arguments.game, vars)
    : (versionJson.minecraftArguments || "").split(/\s+/).map((s) => expand(s, vars)).filter(Boolean);

  const args = [...jvmArgs, versionJson.mainClass, ...gameArgs];

  const logPath = path.join(gameDir, "logs", "latest.log");
  const logStream = fs.createWriteStream(logPath, { flags: "w" });
  logStream.write(`# RUBIX launch @ ${new Date().toISOString()}\n`);
  logStream.write(`# java=${javaBin}\n# args=${args.join(" ")}\n\n`);

  const child = spawn(javaBin, args, {
    cwd: gameDir,
    stdio: ["ignore", "pipe", "pipe"],
    detached: false,
  });
  child.stdout.pipe(logStream, { end: false });
  child.stderr.pipe(logStream, { end: false });
  child.on("close", (code) => {
    logStream.write(`\n# exited with code ${code}\n`);
    logStream.end();
    if (onExit) onExit(code, logPath);
  });
  return { pid: child.pid, logPath };
}

module.exports = { launchGame };
