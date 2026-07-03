// HTTP helpers: JSON GET/POST, streaming download with sha1 verify + retries.
// Uses Node's built-in https (no new deps).

const https = require("https");
const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { URL } = require("url");
const { ensureDir } = require("./paths.cjs");

const UA = "RUBIX-Launcher/1.0";

function pickClient(url) {
  return url.startsWith("http://") ? http : https;
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function requestRaw(url, opts = {}, redirects = 5) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const client = pickClient(url);
    const req = client.request(
      {
        method: opts.method || "GET",
        hostname: u.hostname,
        port: u.port || (u.protocol === "http:" ? 80 : 443),
        path: u.pathname + u.search,
        headers: { "User-Agent": UA, ...(opts.headers || {}) },
      },
      (res) => {
        if (
          res.statusCode >= 300 &&
          res.statusCode < 400 &&
          res.headers.location &&
          redirects > 0
        ) {
          res.resume();
          const next = new URL(res.headers.location, url).toString();
          return resolve(requestRaw(next, opts, redirects - 1));
        }
        const chunks = [];
        res.on("data", (c) => chunks.push(c));
        res.on("end", () =>
          resolve({
            status: res.statusCode || 0,
            headers: res.headers,
            body: Buffer.concat(chunks),
          }),
        );
      },
    );
    req.on("error", reject);
    if (opts.body) req.write(opts.body);
    req.end();
  });
}

async function getJson(url, opts = {}, retries = 3) {
  let lastErr;
  for (let i = 0; i < retries; i++) {
    try {
      const res = await requestRaw(url, opts);
      if (res.status < 200 || res.status >= 300) {
        throw new Error(`HTTP ${res.status} ${url}: ${res.body.toString("utf-8").slice(0, 300)}`);
      }
      return JSON.parse(res.body.toString("utf-8"));
    } catch (e) {
      lastErr = e;
      await sleep(400 * (i + 1));
    }
  }
  throw lastErr;
}

async function postJson(url, body, headers = {}, retries = 3) {
  const payload = typeof body === "string" ? body : JSON.stringify(body);
  return getJson(
    url,
    {
      method: "POST",
      body: payload,
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        ...headers,
      },
    },
    retries,
  );
}

async function postForm(url, form, headers = {}, retries = 3) {
  const body = new URLSearchParams(form).toString();
  return getJson(
    url,
    {
      method: "POST",
      body,
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Accept: "application/json",
        ...headers,
      },
    },
    retries,
  );
}

function sha1Of(filePath) {
  return new Promise((resolve, reject) => {
    const h = crypto.createHash("sha1");
    const s = fs.createReadStream(filePath);
    s.on("data", (c) => h.update(c));
    s.on("end", () => resolve(h.digest("hex")));
    s.on("error", reject);
  });
}

// Download to destPath. If expectedSha1 is provided and the existing file
// already matches, we skip. Retries with exponential backoff.
async function download(url, destPath, expectedSha1 = null, retries = 3) {
  ensureDir(path.dirname(destPath));
  if (expectedSha1 && fs.existsSync(destPath)) {
    try {
      const have = await sha1Of(destPath);
      if (have === expectedSha1) return { skipped: true, path: destPath };
    } catch { /* fall through and re-download */ }
  } else if (!expectedSha1 && fs.existsSync(destPath)) {
    // No hash → trust prior download.
    return { skipped: true, path: destPath };
  }

  let lastErr;
  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      await streamDownload(url, destPath);
      if (expectedSha1) {
        const got = await sha1Of(destPath);
        if (got !== expectedSha1) {
          try { fs.unlinkSync(destPath); } catch { /* ignore */ }
          throw new Error(`sha1 mismatch for ${url} (want ${expectedSha1} got ${got})`);
        }
      }
      return { skipped: false, path: destPath };
    } catch (e) {
      lastErr = e;
      await sleep(500 * (attempt + 1));
    }
  }
  throw lastErr;
}

function streamDownload(url, destPath, redirects = 5) {
  return new Promise((resolve, reject) => {
    const tmp = destPath + ".part";
    ensureDir(path.dirname(destPath));
    const client = pickClient(url);
    const u = new URL(url);
    const req = client.get(
      {
        hostname: u.hostname,
        port: u.port || (u.protocol === "http:" ? 80 : 443),
        path: u.pathname + u.search,
        headers: { "User-Agent": UA },
      },
      (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          res.resume();
          if (redirects <= 0) return reject(new Error("too many redirects"));
          const next = new URL(res.headers.location, url).toString();
          return resolve(streamDownload(next, destPath, redirects - 1));
        }
        if (res.statusCode < 200 || res.statusCode >= 300) {
          res.resume();
          return reject(new Error(`HTTP ${res.statusCode} ${url}`));
        }
        const out = fs.createWriteStream(tmp);
        res.pipe(out);
        out.on("finish", () =>
          out.close(() => {
            try { fs.renameSync(tmp, destPath); resolve(destPath); }
            catch (e) { reject(e); }
          }),
        );
        out.on("error", (e) => { try { fs.unlinkSync(tmp); } catch { /* ignore */ } reject(e); });
      },
    );
    req.on("error", reject);
  });
}

// Bounded parallel worker pool.
async function pool(items, workerCount, worker) {
  const queue = items.slice();
  let done = 0;
  const workers = [];
  for (let i = 0; i < Math.min(workerCount, queue.length); i++) {
    workers.push((async () => {
      while (queue.length) {
        const item = queue.shift();
        try { await worker(item, done); } catch (e) { /* swallow, caller checks */ throw e; }
        done++;
      }
    })());
  }
  await Promise.all(workers);
}

module.exports = { getJson, postJson, postForm, download, sha1Of, pool, requestRaw };
