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

/**
 * Given a list of Steam IDs, return a map of steam_id → Rubix user_id.
 */
export const fetchRubixSteamMap = async (
  steamIds: string[],
): Promise<Map<string, string>> => {
  if (steamIds.length === 0) return new Map();
  const { data, error } = await supabase
    .from("profiles")
    .select("user_id, steam_id")
    .in("steam_id", steamIds);
  if (error || !data) return new Map();
  const map = new Map<string, string>();
  for (const row of data) {
    if (row.steam_id) map.set(row.steam_id, row.user_id);
  }
  return map;
};

