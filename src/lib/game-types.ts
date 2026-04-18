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
};

export const STORAGE_KEY = "rubix-launcher-games";
export const STEAM_ID_KEY = "rubix-launcher-steam-id";
