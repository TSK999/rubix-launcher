// Game source: which storefront/launcher does this game come from
export type GameSource = "steam" | "epic" | "ea" | "xbox" | "riot" | "other";

export type Game = {
  id: string;
  title: string;
  cover?: string;
  path?: string;
  genre?: string;
  description?: string;
  developer?: string;
  favorite?: boolean;
  addedAt: number;
  lastPlayedAt?: number;
  playCount?: number;
  status?: "early-access" | "beta";
  steamAppId?: number;
  // Epic Games Store
  epicAppName?: string;
  epicCatalogNamespace?: string;
  epicCatalogItemId?: string;
  epicLaunchUri?: string;
  // EA app (formerly Origin)
  eaAppId?: string;
  eaContentId?: string;
  eaLaunchUri?: string;
  // Xbox app (Microsoft Store / Gaming Services UWP)
  xboxPackageFamilyName?: string;
  xboxAppUserModelId?: string;
  xboxLaunchUri?: string;
  // Riot Client
  riotProductId?: string;
  riotPatchline?: string;
  riotClientPath?: string;
  riotLaunchUri?: string;
};

export const STORAGE_KEY = "rubix-launcher-games";
export const STEAM_ID_KEY = "rubix-launcher-steam-id";

export const getGameSource = (g: Game): GameSource => {
  if (g.steamAppId) return "steam";
  if (g.epicAppName || g.epicLaunchUri) return "epic";
  if (g.eaAppId || g.eaLaunchUri) return "ea";
  if (g.xboxPackageFamilyName || g.xboxAppUserModelId || g.xboxLaunchUri) return "xbox";
  if (g.riotProductId || g.riotLaunchUri) return "riot";
  return "other";
};
