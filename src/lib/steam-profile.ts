import { supabase } from "@/integrations/supabase/client";
import type { FriendStatus } from "@/lib/steam-friends";

export type SteamProfile = {
  steamId: string;
  personaName: string;
  realName?: string;
  avatar: string;
  profileUrl: string;
  countryCode?: string;
  personaState: number;
  status: FriendStatus;
  gameId?: string;
  gameName?: string;
  lastLogoff?: number;
  timeCreated?: number;
  communityVisibilityState: number;
};

export type SteamRecentGame = {
  appId: number;
  name: string;
  playtime2Weeks: number;
  playtimeForever: number;
  cover: string;
  header: string;
};

export type SteamProfileResponse = {
  profile: SteamProfile;
  recentGames: SteamRecentGame[];
  totalGames?: number;
};

export const fetchSteamProfile = async (steamId: string): Promise<SteamProfileResponse> => {
  const { data, error } = await supabase.functions.invoke("steam-profile", {
    body: { steamId },
  });
  if (error) throw error;
  if (data?.error) throw new Error(data.error);
  return data as SteamProfileResponse;
};
