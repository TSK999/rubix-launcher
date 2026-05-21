/**
 * Encoder detection: probes the bundled FFmpeg for the best available
 * H.264 hardware encoder, falling back to libx264.
 *
 * Order of preference:
 *   1. NVENC  (NVIDIA)   — h264_nvenc
 *   2. AMF    (AMD)      — h264_amf
 *   3. QSV    (Intel)    — h264_qsv
 *   4. libx264 (software fallback, always present in a normal ffmpeg build)
 */
const { runFfmpeg } = require("./ffmpeg-manager.cjs");

const CANDIDATES = [
  { name: "h264_nvenc", label: "NVIDIA NVENC", kind: "gpu", vendor: "nvidia",
    extraArgs: ["-preset", "p4", "-tune", "ll", "-rc", "vbr", "-cq", "23"] },
  { name: "h264_amf", label: "AMD AMF", kind: "gpu", vendor: "amd",
    extraArgs: ["-quality", "speed", "-rc", "vbr_peak", "-usage", "ultralowlatency"] },
  { name: "h264_qsv", label: "Intel QuickSync", kind: "gpu", vendor: "intel",
    extraArgs: ["-preset", "veryfast", "-look_ahead", "0"] },
  { name: "libx264", label: "Software (libx264)", kind: "cpu", vendor: "cpu",
    extraArgs: ["-preset", "veryfast", "-tune", "zerolatency", "-crf", "23"] },
];

let cached = null;

async function listAvailableEncoders() {
  // `-encoders` lists everything ffmpeg can write with.
  const { ok, stdout } = await runFfmpeg(["-hide_banner", "-encoders"]);
  if (!ok) return new Set();
  const names = new Set();
  stdout.split(/\r?\n/).forEach((line) => {
    const m = line.trim().match(/^[A-Z.]+\s+(\S+)\s/);
    if (m) names.add(m[1]);
  });
  return names;
}

async function testEncoder(name) {
  // Probe with a 320x240 source — above NVENC's minimum (145x49) and large
  // enough for AMF/QSV to initialise. Explicit pix_fmt avoids auto-scaler
  // surprises. 12s timeout because NVENC cold-start on a fresh driver can
  // take 5-6s on first invocation.
  const args = [
    "-hide_banner", "-loglevel", "error",
    "-f", "lavfi", "-i", "color=c=black:s=320x240:r=30:d=0.2",
    "-frames:v", "3",
    "-pix_fmt", "yuv420p",
    "-c:v", name,
    "-f", "null", "-",
  ];
  const { ok } = await runFfmpeg(args, { timeoutMs: 12000 });
  return ok;
}

async function detectBestEncoder() {
  if (cached) return cached;
  const available = await listAvailableEncoders();
  const result = { selected: null, tested: [] };
  for (const c of CANDIDATES) {
    if (!available.has(c.name)) {
      result.tested.push({ ...c, ok: false, reason: "not in this build" });
      continue;
    }
    const ok = await testEncoder(c.name);
    result.tested.push({ ...c, ok, reason: ok ? "" : "init failed" });
    if (ok && !result.selected) {
      result.selected = c;
    }
  }
  if (!result.selected) {
    // Last-ditch — assume libx264 even if probe failed (older ffmpegs sometimes
    // misreport when invoked via lavfi). The replay buffer will surface real
    // errors at runtime.
    result.selected = CANDIDATES[CANDIDATES.length - 1];
  }
  cached = result;
  return result;
}

function clearCache() {
  cached = null;
}

module.exports = { detectBestEncoder, clearCache, CANDIDATES };
