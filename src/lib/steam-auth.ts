import { STEAM_ID_KEY } from "@/lib/game-types";

export const getStoredSteamId = (): string | null => {
  try {
    return localStorage.getItem(STEAM_ID_KEY);
  } catch {
    return null;
  }
};

export const setStoredSteamId = (id: string) => {
  localStorage.setItem(STEAM_ID_KEY, id);
};

export const clearStoredSteamId = () => {
  localStorage.removeItem(STEAM_ID_KEY);
};

/**
 * Build a Steam OpenID 2.0 authentication URL and redirect the browser to it.
 * After Steam approves, it redirects back to `returnTo` with `openid.*` query params.
 */
export const redirectToSteamLogin = (returnTo: string) => {
  const realm = `${window.location.protocol}//${window.location.host}`;
  const params = new URLSearchParams({
    "openid.ns": "http://specs.openid.net/auth/2.0",
    "openid.mode": "checkid_setup",
    "openid.return_to": returnTo,
    "openid.realm": realm,
    "openid.identity": "http://specs.openid.net/auth/2.0/identifier_select",
    "openid.claimed_id": "http://specs.openid.net/auth/2.0/identifier_select",
  });
  window.location.href = `https://steamcommunity.com/openid/login?${params.toString()}`;
};
