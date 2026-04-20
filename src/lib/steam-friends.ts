import { supabase } from "@/integrations/supabase/client";

export type FriendStatus = "in-game" | "online" | "away" | "offline";

export type SteamFriend = {
  steamId: string;
  personaName: string;
  avatar: string;
  profileUrl: string;
  personaState: number;
  status: FriendStatus;
  gameId?: string;
  gameName?: string;
  gameServer?: string;
  lastLogoff?: number;
  friendSince?: number;
};

export const fetchSteamFriends = async (steamId: string): Promise<SteamFriend[]> => {
  const { data, error } = await supabase.functions.invoke("steam-friends", {
    body: { steamId },
  });
  if (error) throw error;
  if (data?.error) throw new Error(data.error);
  return (data?.friends ?? []) as SteamFriend[];
};
