// Java runtime detection + Adoptium Temurin JRE download.
// Determines the required major version from the Minecraft version JSON's
// javaVersion.majorVersion field, falls back to sensible defaults.

const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");
const AdmZip = require("adm-zip");
const { getJson, download } = require("./http.cjs");
const { RUNTIME_MAJOR_DIR, ensureDir } = require("./paths.cjs");

function requiredMajorFor(versionJson) {
  const explicit = versionJson?.javaVersion?.majorVersion;
  if (explicit) return explicit;
  // Fallback heuristic by MC version
  const id = String(versionJson?.id || "");
  const m = id.match(/^1\.(\d+)/);
  const minor = m ? parseInt(m[1], 10) : 21;
  if (minor >= 21) return 21;
  if (minor >= 18) return 17;
  return 8;
}

function detectSystemJava(javaBin = "java") {
  try {
    const r = spawnSync(javaBin, ["-version"], { encoding: "utf-8" });
    const out = ((r.stderr || "") + (r.stdout || "")).trim();
    const m = out.match(/version "([^"]+)"/);
    if (!m) return null;
    const v = m[1];
    const major = parseMajor(v);
    return { path: javaBin, version: v, major };
  } catch { return null; }
}

function parseMajor(v) {
  // "1.8.0_351" → 8; "17.0.2" → 17
  const parts = v.split(/[._-]/).map((n) => parseInt(n, 10)).filter((n) => !isNaN(n));
  if (parts[0] === 1 && parts.length > 1) return parts[1];
  return parts[0] || 0;
}

function adoptiumOs() {
  if (process.platform === "win32") return "windows";
  if (process.platform === "darwin") return "mac";
  return "linux";
}
function adoptiumArch() {
  if (process.arch === "arm64") return "aarch64";
  if (process.arch === "arm") return "arm";
  return "x64";
}

// Try to reuse an already-downloaded JRE for this major.
function findExistingRuntime(major) {
  const dir = RUNTIME_MAJOR_DIR(major);
  if (!fs.existsSync(dir)) return null;
  return findJavaBin(dir);
}

function findJavaBin(rootDir) {
  const exe = process.platform === "win32" ? "java.exe" : "java";
  const stack = [rootDir];
  while (stack.length) {
    const p = stack.pop();
    let entries;
    try { entries = fs.readdirSync(p, { withFileTypes: true }); } catch { continue; }
    for (const e of entries) {
      const full = path.join(p, e.name);
      if (e.isDirectory()) { stack.push(full); continue; }
      if (e.isFile() && e.name === exe && /[/\\]bin[/\\]/.test(full)) return full;
    }
  }
  return null;
}

async function downloadAdoptium(major, onProgress) {
  const url =
    `https://api.adoptium.net/v3/assets/latest/${major}/hotspot` +
    `?os=${adoptiumOs()}&architecture=${adoptiumArch()}&image_type=jre` +
    `&vendor=eclipse`;
  if (onProgress) onProgress({ phase: "java", done: 0, total: 1, current: `Fetching Java ${major} info` });
  const list = await getJson(url);
  const asset = list?.[0]?.binary?.package;
  if (!asset?.link) throw new Error(`No Adoptium JRE ${major} available for ${adoptiumOs()}/${adoptiumArch()}`);

  const dir = RUNTIME_MAJOR_DIR(major);
  ensureDir(dir);
  const archive = path.join(dir, path.basename(asset.link));
  if (onProgress) onProgress({ phase: "java", done: 0, total: 1, current: `Downloading Java ${major}` });
  // Adoptium's `checksum` is SHA-256, not SHA-1 — download without hash and verify manually.
  await download(asset.link, archive, null);
  if (asset.checksum) {
    const crypto = require("crypto");
    const buf = fs.readFileSync(archive);
    const got = crypto.createHash("sha256").update(buf).digest("hex");
    if (got !== asset.checksum) {
      try { fs.unlinkSync(archive); } catch { /* ignore */ }
      throw new Error(`sha256 mismatch for JRE ${major} (want ${asset.checksum} got ${got})`);
    }
  }

  if (onProgress) onProgress({ phase: "java", done: 0, total: 1, current: `Extracting Java ${major}` });
  if (archive.endsWith(".zip")) {
    const zip = new AdmZip(archive);
    zip.extractAllTo(dir, true);
  } else if (archive.endsWith(".tar.gz") || archive.endsWith(".tgz")) {
    const r = spawnSync("tar", ["-xzf", archive, "-C", dir], { encoding: "utf-8" });
    if (r.status !== 0) throw new Error("Failed to extract JRE tarball: " + (r.stderr || r.stdout || "unknown"));
  } else {
    throw new Error("Unknown JRE archive type: " + archive);
  }
  try { fs.unlinkSync(archive); } catch { /* ignore */ }

  const bin = findJavaBin(dir);
  if (!bin) throw new Error("JRE downloaded but java binary not found");
  if (onProgress) onProgress({ phase: "java", done: 1, total: 1, current: `Java ${major} ready` });
  return { path: bin, major };
}

// Public: get a java binary that satisfies this version. Prefer user-chosen
// javaPath if it already matches. Otherwise reuse or download.
async function ensureRuntime(versionJson, userJavaPath, onProgress) {
  const need = requiredMajorFor(versionJson);

  if (userJavaPath && userJavaPath !== "java") {
    const j = detectSystemJava(userJavaPath);
    if (j && j.major === need) return j;
  }

  const sys = detectSystemJava("java");
  if (sys && sys.major === need) return sys;

  const existing = findExistingRuntime(need);
  if (existing) return { path: existing, major: need };

  return downloadAdoptium(need, onProgress);
}

module.exports = { ensureRuntime, detectSystemJava, requiredMajorFor };
