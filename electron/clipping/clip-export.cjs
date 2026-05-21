/**
 * Clip export helper — reads a finalized clip file from disk so the renderer
 * can wrap it in a Blob and hand it to the existing Supabase upload pipeline.
 *
 * Kept in its own module so future features (re-encode, trim, share) can hang
 * off the same surface without bloating the replay buffer.
 */
const fs = require("fs/promises");

async function readClipBuffer(filePath) {
  const buf = await fs.readFile(filePath);
  // Return as ArrayBuffer so structured-clone over IPC stays efficient.
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
}

async function deleteClip(filePath) {
  await fs.unlink(filePath).catch(() => {});
  return { ok: true };
}

module.exports = { readClipBuffer, deleteClip };
