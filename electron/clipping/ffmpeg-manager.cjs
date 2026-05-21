/**
 * FFmpeg manager: locates the ffmpeg/ffprobe binaries (bundled under
 * resources/bin/ or on the system PATH) and exposes a small spawn helper.
 *
 * Bundled layout (production):
 *   <appResources>/bin/ffmpeg(.exe)
 *   <appResources>/bin/ffprobe(.exe)
 *
 * In dev we also check <repo>/resources/bin/ and finally fall back to PATH.
 */
const { app } = require("electron");
const path = require("path");
const fs = require("fs");
const { spawn, execFile } = require("child_process");
const log = require("electron-log");

const exeName = (name) => (process.platform === "win32" ? `${name}.exe` : name);

function candidateDirs() {
  const dirs = [];
  // Packaged: extraResources writes here.
  if (process.resourcesPath) {
    dirs.push(path.join(process.resourcesPath, "bin"));
  }
  // Dev: <repo>/resources/bin
  try {
    dirs.push(path.join(app.getAppPath(), "resources", "bin"));
  } catch {
    /* noop */
  }
  dirs.push(path.join(__dirname, "..", "..", "resources", "bin"));
  return dirs;
}

function findBinary(name) {
  const fname = exeName(name);
  for (const dir of candidateDirs()) {
    const full = path.join(dir, fname);
    try {
      if (fs.existsSync(full)) return full;
    } catch {
      /* noop */
    }
  }
  // PATH fallback — let spawn resolve it.
  return fname;
}

let cachedFfmpeg = null;
let cachedFfprobe = null;
let cachedAvailable = null;

function ffmpegPath() {
  if (!cachedFfmpeg) cachedFfmpeg = findBinary("ffmpeg");
  return cachedFfmpeg;
}

function ffprobePath() {
  if (!cachedFfprobe) cachedFfprobe = findBinary("ffprobe");
  return cachedFfprobe;
}

function probe(timeoutMs = 4000) {
  return new Promise((resolve) => {
    if (cachedAvailable !== null) return resolve(cachedAvailable);
    try {
      execFile(
        ffmpegPath(),
        ["-hide_banner", "-version"],
        { timeout: timeoutMs, windowsHide: true },
        (err, stdout) => {
          if (err) {
            cachedAvailable = { ok: false, path: ffmpegPath(), error: String(err.message || err) };
          } else {
            const first = String(stdout || "").split("\n")[0].trim();
            cachedAvailable = { ok: true, path: ffmpegPath(), version: first };
          }
          resolve(cachedAvailable);
        },
      );
    } catch (err) {
      cachedAvailable = { ok: false, path: ffmpegPath(), error: String(err && err.message) };
      resolve(cachedAvailable);
    }
  });
}

function spawnFfmpeg(args, opts = {}) {
  log.info("[ffmpeg] spawn", ffmpegPath(), args.join(" "));
  const child = spawn(ffmpegPath(), args, {
    stdio: ["pipe", "pipe", "pipe"],
    windowsHide: true,
    ...opts,
  });
  // FFmpeg may exit before we can send `q` during stop/retry. Without this,
  // an async EPIPE on stdin can bubble as an unhandled stream error and take
  // down the Electron main process.
  child.stdin?.on("error", () => {});
  return child;
}

function runFfmpeg(args, { timeoutMs = 10000 } = {}) {
  return new Promise((resolve) => {
    let stderr = "";
    let stdout = "";
    let done = false;
    const child = spawnFfmpeg(args);
    const timer = setTimeout(() => {
      if (done) return;
      done = true;
      try { child.kill("SIGKILL"); } catch { /* noop */ }
      resolve({ ok: false, code: null, stdout, stderr: stderr + "\n[timeout]" });
    }, timeoutMs);
    child.stdout.on("data", (d) => (stdout += d.toString()));
    child.stderr.on("data", (d) => (stderr += d.toString()));
    child.on("error", (err) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      resolve({ ok: false, code: null, stdout, stderr: stderr + "\n" + String(err.message || err) });
    });
    child.on("close", (code) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      resolve({ ok: code === 0, code, stdout, stderr });
    });
  });
}

module.exports = {
  ffmpegPath,
  ffprobePath,
  probe,
  spawnFfmpeg,
  runFfmpeg,
};
