/**
 * Replay buffer powered by FFmpeg's segment muxer.
 *
 * FFmpeg writes rolling MPEG-TS segments to a session directory. We keep the
 * latest N segments (older ones are deleted) and `saveClip()` stitches the
 * tail into a final MP4 via stream copy.
 *
 * Design goals:
 *   - Reliable fullscreen capture (DXGI / gdigrab on Windows; avfoundation on
 *     macOS; x11grab on Linux).
 *   - Mixed desktop + microphone audio via FFmpeg's amix filter.
 *   - Hardware encoding when available (NVENC / AMF / QSV → libx264).
 *   - Bounded disk/RAM use: a circular pool of N small .ts segments.
 *
 * Public API:
 *   start(opts)   -> {ok, encoder, args}
 *   stop()        -> {ok}
 *   saveClip({seconds}) -> {ok, path, durationSeconds, mimeType}
 *   getStatus()   -> {state, encoder, error, segments}
 */
const { app, screen } = require("electron");
const path = require("path");
const fs = require("fs");
const fsp = fs.promises;
const log = require("electron-log");
const { spawnFfmpeg } = require("./ffmpeg-manager.cjs");
const { detectBestEncoder } = require("./encoder-detect.cjs");

const SEGMENT_SECONDS = 2;
const SEGMENT_PREFIX = "seg";
const STATE = {
  IDLE: "idle",
  STARTING: "starting",
  RECORDING: "recording",
  ERROR: "error",
};

const listeners = new Set();
let proc = null;
let state = STATE.IDLE;
let lastError = "";
let activeEncoder = null;
let sessionDir = null;
let recentSegments = [];
let pruneTimer = null;
let lastOptions = null;

function emit() {
  const snap = getStatus();
  for (const l of listeners) {
    try { l(snap); } catch { /* noop */ }
  }
}

function getStatus() {
  return {
    state,
    encoder: activeEncoder
      ? { name: activeEncoder.name, label: activeEncoder.label, kind: activeEncoder.kind }
      : null,
    error: lastError,
    segments: recentSegments.length,
    sessionDir,
  };
}

function subscribe(cb) {
  listeners.add(cb);
  cb(getStatus());
  return () => listeners.delete(cb);
}

function setState(next, err = "") {
  state = next;
  lastError = err;
  emit();
}

async function ensureSessionDir() {
  const base = path.join(app.getPath("userData"), "clip-buffer");
  await fsp.mkdir(base, { recursive: true });
  // Clear stale sessions older than 1 hour.
  try {
    const now = Date.now();
    for (const entry of await fsp.readdir(base)) {
      const full = path.join(base, entry);
      const st = await fsp.stat(full).catch(() => null);
      if (st && now - st.mtimeMs > 60 * 60 * 1000) {
        await fsp.rm(full, { recursive: true, force: true }).catch(() => {});
      }
    }
  } catch { /* noop */ }
  const dir = path.join(base, `session-${Date.now()}`);
  await fsp.mkdir(dir, { recursive: true });
  return dir;
}

function pickDisplay(displayId) {
  const all = screen.getAllDisplays();
  if (displayId) {
    const m = all.find((d) => String(d.id) === String(displayId));
    if (m) return m;
  }
  const cursor = screen.getCursorScreenPoint();
  return screen.getDisplayNearestPoint(cursor);
}

function buildVideoInput(display, framerate) {
  const { x, y, width, height } = display.bounds;
  const scale = display.scaleFactor || 1;
  const w = Math.round(width * scale);
  const h = Math.round(height * scale);

  if (process.platform === "win32") {
    return {
      args: [
        "-f", "gdigrab",
        "-framerate", String(framerate),
        "-offset_x", String(x),
        "-offset_y", String(y),
        "-video_size", `${w}x${h}`,
        "-draw_mouse", "0",
        "-i", "desktop",
      ],
      width: w,
      height: h,
    };
  }
  if (process.platform === "darwin") {
    return {
      args: [
        "-f", "avfoundation",
        "-framerate", String(framerate),
        "-capture_cursor", "0",
        "-i", "1:none",
      ],
      width: w,
      height: h,
    };
  }
  // Linux
  return {
    args: [
      "-f", "x11grab",
      "-framerate", String(framerate),
      "-video_size", `${w}x${h}`,
      "-i", `${process.env.DISPLAY || ":0"}+${x},${y}`,
    ],
    width: w,
    height: h,
  };
}

// Browser-side deviceIds are 64-char hex hashes — useless to FFmpeg's dshow,
// which wants the human-readable device name. Treat anything that looks like
// a hash as "use default".
function sanitizeDeviceLabel(v) {
  if (!v || typeof v !== "string") return null;
  const trimmed = v.trim();
  if (!trimmed || trimmed === "default") return null;
  if (/^[a-f0-9]{32,}$/i.test(trimmed)) return null;
  return trimmed;
}

function buildAudioInputs({ includeDesktopAudio, includeMic, desktopAudioDeviceLabel, micDeviceLabel }) {
  const args = [];
  let inputCount = 0;
  const desktopDev = sanitizeDeviceLabel(desktopAudioDeviceLabel);
  const micDev = sanitizeDeviceLabel(micDeviceLabel);
  if (process.platform === "win32") {
    if (includeDesktopAudio) {
      const dev = desktopDev || "virtual-audio-capturer";
      args.push("-f", "dshow", "-rtbufsize", "256M", "-i", `audio=${dev}`);
      inputCount += 1;
    }
    if (includeMic && micDev) {
      args.push("-f", "dshow", "-rtbufsize", "256M", "-i", `audio=${micDev}`);
      inputCount += 1;
    }
  } else if (process.platform === "darwin") {
    if (includeDesktopAudio || includeMic) {
      args.push("-f", "avfoundation", "-i", ":0");
      inputCount += 1;
    }
  } else {
    if (includeDesktopAudio) {
      args.push("-f", "pulse", "-i", "default");
      inputCount += 1;
    }
    if (includeMic) {
      args.push("-f", "pulse", "-i", micDev || "default");
      inputCount += 1;
    }
  }
  return { args, inputCount };
}

function resolutionToHeight(r) {
  if (!r || r === "source") return null;
  const n = Number(r);
  return Number.isFinite(n) && n > 0 ? n : null;
}

async function start(options = {}) {
  if (state === STATE.RECORDING || state === STATE.STARTING) {
    if (!options.restart) return { ok: true, alreadyRunning: true, encoder: activeEncoder };
    await stop();
  }
  lastOptions = options;
  setState(STATE.STARTING);

  const display = pickDisplay(options.displayId);
  const framerate = Math.max(15, Math.min(120, Number(options.framerate) || 60));
  const targetHeight = resolutionToHeight(options.resolution);
  const replayDuration = Math.max(10, Math.min(180, Number(options.durationSeconds) || 30));
  // Always keep a couple of spare segments so the tail of the clip is intact.
  const segmentCount = Math.ceil(replayDuration / SEGMENT_SECONDS) + 3;

  let encoderInfo;
  try {
    encoderInfo = await detectBestEncoder();
  } catch (err) {
    setState(STATE.ERROR, "Encoder detection failed: " + (err && err.message));
    return { ok: false, error: lastError };
  }
  activeEncoder = encoderInfo.selected;

  sessionDir = await ensureSessionDir();
  recentSegments = [];

  const video = buildVideoInput(display, framerate);
  const audio = buildAudioInputs(options);

  const args = [
    "-hide_banner",
    "-loglevel", "warning",
    ...video.args,
    ...audio.args,
  ];

  // Audio mix when both desktop + mic are present (Windows path).
  let mapAudio = [];
  if (audio.inputCount >= 2) {
    args.push(
      "-filter_complex",
      `[1:a][2:a]amix=inputs=2:duration=longest:normalize=0[aout]`,
    );
    mapAudio = ["-map", "[aout]"];
  } else if (audio.inputCount === 1) {
    mapAudio = ["-map", "1:a"];
  }

  // Video map + scaling.
  const vf = [];
  if (targetHeight && targetHeight < video.height) {
    vf.push(`scale=-2:${targetHeight}:flags=fast_bilinear`);
  }
  args.push("-map", "0:v:0");
  if (vf.length) args.push("-vf", vf.join(","));
  args.push(...mapAudio);

  // Encoder.
  args.push("-c:v", activeEncoder.name, ...activeEncoder.extraArgs);
  args.push("-pix_fmt", "yuv420p");
  args.push("-g", String(framerate)); // 1s keyframe interval → clean cuts
  args.push("-b:v", "6M", "-maxrate", "8M", "-bufsize", "12M");
  if (audio.inputCount > 0) {
    args.push("-c:a", "aac", "-b:a", "160k", "-ar", "48000");
  }

  // Segment muxer — circular buffer.
  args.push(
    "-f", "segment",
    "-segment_time", String(SEGMENT_SECONDS),
    "-segment_format", "mpegts",
    "-reset_timestamps", "1",
    "-segment_wrap", String(segmentCount),
    "-segment_list", path.join(sessionDir, "playlist.m3u"),
    "-segment_list_type", "m3u8",
    path.join(sessionDir, `${SEGMENT_PREFIX}_%03d.ts`),
  );

  try {
    proc = spawnFfmpeg(args);
  } catch (err) {
    setState(STATE.ERROR, String(err && err.message));
    return { ok: false, error: lastError };
  }

  proc.stderr.on("data", (d) => {
    const text = d.toString();
    if (/error|failed|invalid/i.test(text)) log.warn("[ffmpeg]", text.trim());
  });
  proc.on("error", (err) => {
    log.error("[ffmpeg] error", err);
    setState(STATE.ERROR, String(err && err.message));
  });
  proc.on("close", (code) => {
    log.info("[ffmpeg] closed", code);
    proc = null;
    if (state !== STATE.IDLE) {
      setState(STATE.ERROR, `ffmpeg exited (code ${code})`);
    }
  });

  // Poll segment dir to update recentSegments.
  if (pruneTimer) clearInterval(pruneTimer);
  pruneTimer = setInterval(() => refreshSegments().catch(() => {}), 1000);

  setState(STATE.RECORDING);
  return { ok: true, encoder: activeEncoder, sessionDir, args };
}

async function refreshSegments() {
  if (!sessionDir) return;
  try {
    const files = (await fsp.readdir(sessionDir))
      .filter((f) => f.startsWith(SEGMENT_PREFIX) && f.endsWith(".ts"));
    const stats = await Promise.all(files.map(async (f) => {
      const full = path.join(sessionDir, f);
      const st = await fsp.stat(full).catch(() => null);
      return st ? { full, mtime: st.mtimeMs, size: st.size } : null;
    }));
    recentSegments = stats
      .filter(Boolean)
      .sort((a, b) => a.mtime - b.mtime);
    emit();
  } catch { /* noop */ }
}

async function stop() {
  if (pruneTimer) { clearInterval(pruneTimer); pruneTimer = null; }
  if (proc) {
    try {
      // 'q' tells ffmpeg to finish writing the current segment cleanly.
      proc.stdin.write("q\n");
    } catch { /* noop */ }
    const child = proc;
    proc = null;
    await new Promise((resolve) => {
      const t = setTimeout(() => {
        try { child.kill("SIGKILL"); } catch { /* noop */ }
        resolve();
      }, 1500);
      child.once("close", () => { clearTimeout(t); resolve(); });
    });
  }
  setState(STATE.IDLE, "");
  return { ok: true };
}

async function saveClip({ seconds, outPath, mimeType = "video/mp4" } = {}) {
  if (state !== STATE.RECORDING) {
    throw new Error("Recorder is not running");
  }
  await refreshSegments();
  if (recentSegments.length === 0) {
    throw new Error("Replay buffer is warming up — try again in a few seconds");
  }
  const wantSeconds = Math.max(5, Math.min(180, Number(seconds) || 30));
  // Skip the most-recent segment because ffmpeg is still writing into it.
  const closed = recentSegments.slice(0, -1);
  if (closed.length === 0) {
    throw new Error("Replay buffer is warming up — try again in a few seconds");
  }
  const need = Math.ceil(wantSeconds / SEGMENT_SECONDS);
  const slice = closed.slice(-need);

  const concatList = path.join(sessionDir, `concat-${Date.now()}.txt`);
  await fsp.writeFile(
    concatList,
    slice.map((s) => `file '${s.full.replace(/'/g, "'\\''")}'`).join("\n"),
    "utf-8",
  );

  const finalPath = outPath || path.join(
    app.getPath("userData"),
    "clips-out",
    `rubix-clip-${Date.now()}.mp4`,
  );
  await fsp.mkdir(path.dirname(finalPath), { recursive: true });

  const args = [
    "-hide_banner", "-loglevel", "error",
    "-f", "concat", "-safe", "0",
    "-i", concatList,
    "-c", "copy",
    "-movflags", "+faststart",
    "-y", finalPath,
  ];

  await new Promise((resolve, reject) => {
    const child = spawnFfmpeg(args);
    let stderr = "";
    child.stderr.on("data", (d) => (stderr += d.toString()));
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`ffmpeg concat failed (${code}): ${stderr.trim().slice(0, 400)}`));
    });
  });
  await fsp.unlink(concatList).catch(() => {});

  const durationSeconds = Math.min(wantSeconds, slice.length * SEGMENT_SECONDS);
  return { ok: true, path: finalPath, durationSeconds, mimeType };
}

module.exports = {
  start,
  stop,
  saveClip,
  getStatus,
  subscribe,
  restartWithLast: () => (lastOptions ? start({ ...lastOptions, restart: true }) : { ok: false }),
};
