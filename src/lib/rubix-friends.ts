import { supabase } from "@/integrations/supabase/client";

/**
 * Given a list of Steam IDs, return the set of those that belong to a Rubix user.
 */
export const fetchRubixSteamIds = async (steamIds: string[]): Promise<Set<string>> => {
  if (steamIds.length === 0) return new Set();
  const { data, error } = await supabase
    .from("profiles")
    .select("steam_id")
    .in("steam_id", steamIds);
  if (error || !data) return new Set();
  return new Set(data.map((r) => r.steam_id).filter((s): s is string => !!s));
};

export type RubixSteamMatch = {
  user_id: string;
  username: string;
  avatar_url: string | null;
};

/**
 * Given a list of Steam IDs, return a map of steam_id → { user_id, username, avatar_url }.
 */
export const fetchRubixSteamMap = async (
  steamIds: string[],
): Promise<Map<string, RubixSteamMatch>> => {
  if (steamIds.length === 0) return new Map();
  const { data, error } = await supabase
    .from("profiles")
    .select("user_id, username, avatar_url, steam_id")
    .in("steam_id", steamIds);
  if (error || !data) return new Map();
  const map = new Map<string, RubixSteamMatch>();
  for (const row of data) {
    if (row.steam_id)
      map.set(row.steam_id, {
        user_id: row.user_id,
        username: row.username,
        avatar_url: row.avatar_url ?? null,
      });
  }
  return map;
};
