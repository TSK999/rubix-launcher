export type GameSource = "steam" | "epic" | "other";

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
};

export const STORAGE_KEY = "rubix-launcher-games";
export const STEAM_ID_KEY = "rubix-launcher-steam-id";

export const getGameSource = (g: Game): GameSource => {
  if (g.steamAppId) return "steam";
  if (g.epicAppName || g.epicLaunchUri) return "epic";
  return "other";
};
