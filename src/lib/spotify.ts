import { supabase } from "@/integrations/supabase/client";

export type SpotifyTrack = {
  is_playing: boolean;
  name: string;
  artists: string;
  album_art?: string;
  url?: string;
  progress_ms?: number;
  duration_ms?: number;
  played_at?: string;
};

export type SpotifyConnection = {
  id: string;
  user_id: string;
  spotify_id: string;
  spotify_username: string | null;
  display_name: string | null;
  avatar_url: string | null;
};

export type SpotifyLinkedUser = {
  user_id: string;
  spotify_id: string;
  spotify_username: string | null;
  display_name: string | null;
  avatar_url: string | null;
};

/** Returns the current user's Spotify connection (no tokens), or null. */
export const fetchMySpotifyConnection = async (): Promise<SpotifyConnection | null> => {
  const { data, error } = await supabase
    .from("spotify_connections")
    .select("id, user_id, spotify_id, spotify_username, display_name, avatar_url")
    .maybeSingle();
  if (error || !data) return null;
  return data as SpotifyConnection;
};

/** Disconnect Spotify for the current user. */
export const disconnectSpotify = async (userId: string) => {
  await supabase.from("spotify_connections").delete().eq("user_id", userId);
};

/** Begin Spotify OAuth — returns the URL to send the browser to. */
export const startSpotifyOAuth = async (returnTo: string): Promise<string> => {
  const { data, error } = await supabase.functions.invoke("spotify-auth/start", {
    body: { returnTo },
  });
  if (error || !data?.url) {
    throw new Error(error?.message || "Failed to start Spotify OAuth");
  }
  return data.url as string;
};

/** Look up which Rubix users (by user_id) have linked Spotify. */
export const fetchSpotifyLinkedUsers = async (
  userIds: string[],
): Promise<Map<string, SpotifyLinkedUser>> => {
  if (userIds.length === 0) return new Map();
  const { data, error } = await supabase.rpc("get_spotify_linked_users", {
    _user_ids: userIds,
  });
  if (error || !data) return new Map();
  return new Map(
    (data as SpotifyLinkedUser[]).map((row) => [row.user_id, row]),
  );
};

/** Fetch currently-playing tracks for a batch of Rubix user_ids. */
export const fetchNowPlaying = async (
  userIds: string[],
): Promise<Map<string, SpotifyTrack | null>> => {
  if (userIds.length === 0) return new Map();
  const { data, error } = await supabase.functions.invoke("spotify-now-playing", {
    body: { user_ids: userIds },
  });
  if (error || !data?.tracks) return new Map();
  const out = new Map<string, SpotifyTrack | null>();
  for (const [uid, track] of Object.entries(data.tracks as Record<string, SpotifyTrack | null>)) {
    out.set(uid, track);
  }
  return out;
};
