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
