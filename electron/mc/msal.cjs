// Microsoft OAuth device-code flow → Xbox Live → XSTS → Minecraft services.
// Persists refresh token encrypted via Electron safeStorage.
//
// Client ID 00000000402b5328 is the public Xbox Live app used by all major
// community Minecraft launchers (PrismLauncher, MultiMC, GDLauncher, etc.).
// No Azure registration needed.

const { safeStorage, shell } = require("electron");
const fs = require("fs");
const { postForm, postJson, getJson, requestRaw } = require("./http.cjs");
const { ACCOUNT_FILE, ensureDir, ROOT } = require("./paths.cjs");
const path = require("path");

// PrismLauncher's registered Azure app. Public client, multi-tenant, and
// enabled for device-code on /consumers. Verified working; the older
// "00000000402b5328" and "389b1b32-..." IDs both return AADSTS700016.
const CLIENT_ID = "c36a9fb6-4f2a-41ff-90bd-ae7cc92031eb";
const SCOPE = "XboxLive.signin offline_access";

async function startDeviceCode() {
  return postForm(
    "https://login.microsoftonline.com/consumers/oauth2/v2.0/devicecode",
    { client_id: CLIENT_ID, scope: SCOPE },
  );
}

async function pollForMsToken(deviceCode, intervalSec, expiresInSec) {
  const start = Date.now();
  let interval = Math.max(1, intervalSec || 5);
  while (Date.now() - start < expiresInSec * 1000) {
    await new Promise((r) => setTimeout(r, interval * 1000));
    try {
      const res = await requestRaw(
        "https://login.microsoftonline.com/consumers/oauth2/v2.0/token",
        {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({
            grant_type: "urn:ietf:params:oauth:grant-type:device_code",
            client_id: CLIENT_ID,
            device_code: deviceCode,
          }).toString(),
        },
      );
      const body = JSON.parse(res.body.toString("utf-8"));
      if (res.status >= 200 && res.status < 300) return body;
      if (body.error === "authorization_pending") continue;
      if (body.error === "slow_down") { interval += 5; continue; }
      if (body.error === "authorization_declined") throw new Error("Sign-in was declined.");
      if (body.error === "expired_token") throw new Error("Sign-in code expired. Please try again.");
      throw new Error(body.error_description || body.error || "Token exchange failed");
    } catch (e) {
      if (e.message?.includes("authorization_pending")) continue;
      // For unknown errors, keep polling until expiry rather than dying immediately.
      if (String(e.message).startsWith("HTTP 4")) throw e;
    }
  }
  throw new Error("Sign-in timed out. Please try again.");
}

async function refreshMsToken(refreshToken) {
  return postForm(
    "https://login.microsoftonline.com/consumers/oauth2/v2.0/token",
    {
      grant_type: "refresh_token",
      client_id: CLIENT_ID,
      scope: SCOPE,
      refresh_token: refreshToken,
    },
  );
}

async function xboxLiveAuth(msAccessToken) {
  return postJson("https://user.auth.xboxlive.com/user/authenticate", {
    Properties: {
      AuthMethod: "RPS",
      SiteName: "user.auth.xboxlive.com",
      RpsTicket: `d=${msAccessToken}`,
    },
    RelyingParty: "http://auth.xboxlive.com",
    TokenType: "JWT",
  });
}

async function xstsAuth(xblToken) {
  const res = await requestRaw("https://xsts.auth.xboxlive.com/xsts/authorize", {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({
      Properties: { SandboxId: "RETAIL", UserTokens: [xblToken] },
      RelyingParty: "rp://api.minecraftservices.com/",
      TokenType: "JWT",
    }),
  });
  const body = JSON.parse(res.body.toString("utf-8"));
  if (res.status === 401) {
    const xerr = body?.XErr;
    const msg = {
      2148916233: "This Microsoft account has no Xbox profile. Sign in at xbox.com to create one, then try again.",
      2148916235: "Xbox Live is not available in your country/region.",
      2148916236: "Adult verification required (South Korea).",
      2148916237: "Adult verification required (South Korea).",
      2148916238: "This account is a child account. It must be added to a Microsoft Family to use Xbox Live.",
    }[xerr] || `Xbox authentication failed (XErr ${xerr}).`;
    throw new Error(msg);
  }
  if (res.status < 200 || res.status >= 300) {
    throw new Error(`XSTS auth failed (HTTP ${res.status})`);
  }
  return body;
}

async function loginToMinecraft(userHash, xstsToken) {
  return postJson("https://api.minecraftservices.com/authentication/login_with_xbox", {
    identityToken: `XBL3.0 x=${userHash};${xstsToken}`,
  });
}

async function fetchProfile(mcAccessToken) {
  const res = await requestRaw("https://api.minecraftservices.com/minecraft/profile", {
    headers: { Authorization: `Bearer ${mcAccessToken}` },
  });
  if (res.status === 404) {
    const err = new Error(
      "This Microsoft account does not own Minecraft: Java Edition.",
    );
    err.code = "NO_GAME_OWNED";
    throw err;
  }
  if (res.status < 200 || res.status >= 300) {
    throw new Error(`Profile fetch failed (HTTP ${res.status})`);
  }
  return JSON.parse(res.body.toString("utf-8"));
}

// Full: MS access + refresh → XBL → XSTS → MC token → profile
async function finishSignIn(msAccess, msRefresh, msExpiresIn) {
  const xbl = await xboxLiveAuth(msAccess);
  const xblToken = xbl.Token;
  const userHash = xbl.DisplayClaims.xui[0].uhs;
  const xsts = await xstsAuth(xblToken);
  const mc = await loginToMinecraft(userHash, xsts.Token);
  const profile = await fetchProfile(mc.access_token);
  const account = {
    uuid: profile.id,
    name: profile.name,
    accessToken: mc.access_token,
    expiresAt: Date.now() + (mc.expires_in * 1000),
    msRefresh,
    msExpiresAt: Date.now() + (msExpiresIn * 1000),
    savedAt: Date.now(),
  };
  saveAccount(account);
  return account;
}

// ---------- Persistence (Electron safeStorage) ----------
function saveAccount(account) {
  ensureDir(ROOT());
  const json = JSON.stringify(account);
  try {
    if (safeStorage.isEncryptionAvailable()) {
      const enc = safeStorage.encryptString(json);
      fs.writeFileSync(ACCOUNT_FILE(), enc);
      return;
    }
  } catch { /* fall through */ }
  // Plaintext fallback — mark file so we know on load.
  fs.writeFileSync(ACCOUNT_FILE(), "PLAIN:" + json, "utf-8");
}

function loadAccount() {
  try {
    if (!fs.existsSync(ACCOUNT_FILE())) return null;
    const buf = fs.readFileSync(ACCOUNT_FILE());
    if (buf.slice(0, 6).toString("utf-8") === "PLAIN:") {
      return JSON.parse(buf.slice(6).toString("utf-8"));
    }
    if (safeStorage.isEncryptionAvailable()) {
      return JSON.parse(safeStorage.decryptString(buf));
    }
    return null;
  } catch {
    return null;
  }
}

function clearAccount() {
  try { fs.unlinkSync(ACCOUNT_FILE()); } catch { /* ignore */ }
}

// Ensure we have a fresh, valid Minecraft access token. Refreshes silently
// when possible; returns null if the user must sign in again.
async function ensureValidAccount() {
  const acc = loadAccount();
  if (!acc) return null;

  // MC token still fresh?
  if (acc.expiresAt - Date.now() > 5 * 60 * 1000) return acc;

  // MS refresh expired? Nothing we can do.
  if (!acc.msRefresh || acc.msExpiresAt < Date.now()) {
    clearAccount();
    return null;
  }

  try {
    const tok = await refreshMsToken(acc.msRefresh);
    return await finishSignIn(tok.access_token, tok.refresh_token || acc.msRefresh, tok.expires_in);
  } catch (e) {
    // Sign the user out on hard failures so the UI shows a Sign-in prompt.
    if (String(e?.message || "").match(/invalid_grant|AADSTS/i)) clearAccount();
    return null;
  }
}

async function openVerificationUrl(url) {
  try { await shell.openExternal(url); } catch { /* ignore */ }
}

module.exports = {
  startDeviceCode,
  pollForMsToken,
  finishSignIn,
  loadAccount,
  saveAccount,
  clearAccount,
  ensureValidAccount,
  openVerificationUrl,
};
