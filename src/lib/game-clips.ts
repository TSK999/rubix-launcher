import { supabase } from "@/integrations/supabase/client";

export type GameClip = {
  id: string;
  storage_path: string;
  caption: string | null;
  duration_seconds: number | null;
  width: number | null;
  height: number | null;
  size_bytes: number | null;
  taken_at: string;
  url: string;
};

const signedUrlFor = async (path: string) => {
  const { data } = await supabase.storage
    .from("game-clips")
    .createSignedUrl(path, 3600);
  return data?.signedUrl ?? "";
};

export const fetchGameClips = async (
  userId: string,
  gameKey: string,
): Promise<GameClip[]> => {
  const { data, error } = await supabase
    .from("game_clips_user")
    .select("id, storage_path, caption, duration_seconds, width, height, size_bytes, taken_at")
    .eq("user_id", userId)
    .eq("game_key", gameKey)
    .order("taken_at", { ascending: false });
  if (error || !data) return [];
  return Promise.all(
    data.map(async (r) => ({ ...r, url: await signedUrlFor(r.storage_path) })),
  );
};

export const uploadClip = async (
  userId: string,
  gameKey: string,
  file: Blob,
  meta?: {
    duration_seconds?: number;
    width?: number;
    height?: number;
    caption?: string;
  },
): Promise<GameClip> => {
  const ext = (file.type.split("/")[1] || "webm").split(";")[0];
  const safeKey = gameKey.replace(/[^a-zA-Z0-9_-]/g, "_");
  const path = `${userId}/${safeKey}/${Date.now()}-${Math.random()
    .toString(36)
    .slice(2, 8)}.${ext}`;
  const { error: upErr } = await supabase.storage
    .from("game-clips")
    .upload(path, file, {
      contentType: file.type || "video/webm",
      upsert: false,
    });
  if (upErr) throw upErr;

  const { data, error } = await supabase
    .from("game_clips_user")
    .insert({
      user_id: userId,
      game_key: gameKey,
      storage_path: path,
      caption: meta?.caption ?? null,
      duration_seconds: meta?.duration_seconds ?? null,
      width: meta?.width ?? null,
      height: meta?.height ?? null,
      size_bytes: file.size,
    })
    .select("id, storage_path, caption, duration_seconds, width, height, size_bytes, taken_at")
    .single();
  if (error || !data) throw error;
  return { ...data, url: await signedUrlFor(path) };
};

export const deleteClip = async (clip: GameClip) => {
  await supabase.storage.from("game-clips").remove([clip.storage_path]);
  await supabase.from("game_clips_user").delete().eq("id", clip.id);
};
