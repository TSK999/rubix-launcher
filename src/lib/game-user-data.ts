import { supabase } from "@/integrations/supabase/client";
import type { Game } from "./game-types";
import { getGameSource } from "./game-types";

export type GameUserData = {
  notes: string;
  tags: string[];
};

export type GameScreenshot = {
  id: string;
  storage_path: string;
  caption: string | null;
  width: number | null;
  height: number | null;
  taken_at: string;
  url: string;
};

const EMPTY: GameUserData = { notes: "", tags: [] };

export const fetchGameUserData = async (
  userId: string,
  gameKey: string,
): Promise<GameUserData> => {
  const { data } = await supabase
    .from("game_user_data")
    .select("notes, tags")
    .eq("user_id", userId)
    .eq("game_key", gameKey)
    .maybeSingle();
  if (!data) return EMPTY;
  return { notes: data.notes ?? "", tags: data.tags ?? [] };
};

export const saveGameUserData = async (
  userId: string,
  game: Game,
  patch: Partial<GameUserData>,
) => {
  const { error } = await supabase.from("game_user_data").upsert(
    {
      user_id: userId,
      game_key: game.id,
      title_snapshot: game.title,
      source: getGameSource(game),
      notes: patch.notes,
      tags: patch.tags,
    },
    { onConflict: "user_id,game_key" },
  );
  if (error) throw error;
};

const signedUrlFor = async (path: string) => {
  const { data } = await supabase.storage
    .from("game-screenshots")
    .createSignedUrl(path, 3600);
  return data?.signedUrl ?? "";
};

export const fetchGameScreenshots = async (
  userId: string,
  gameKey: string,
): Promise<GameScreenshot[]> => {
  const { data, error } = await supabase
    .from("game_screenshots_user")
    .select("id, storage_path, caption, width, height, taken_at")
    .eq("user_id", userId)
    .eq("game_key", gameKey)
    .order("taken_at", { ascending: false });
  if (error || !data) return [];
  return Promise.all(
    data.map(async (r) => ({
      ...r,
      url: await signedUrlFor(r.storage_path),
    })),
  );
};

const fileExt = (file: File | { name?: string; type?: string }) => {
  const fromName = "name" in file && file.name ? file.name.split(".").pop() : "";
  if (fromName && fromName.length <= 5) return fromName.toLowerCase();
  const fromMime = file.type?.split("/")[1];
  return (fromMime || "png").toLowerCase();
};

export const uploadScreenshot = async (
  userId: string,
  gameKey: string,
  file: Blob,
  meta?: { width?: number; height?: number; caption?: string; name?: string },
): Promise<GameScreenshot> => {
  const ext = fileExt({ name: meta?.name, type: file.type });
  const safeKey = gameKey.replace(/[^a-zA-Z0-9_-]/g, "_");
  const path = `${userId}/${safeKey}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
  const { error: upErr } = await supabase.storage
    .from("game-screenshots")
    .upload(path, file, { contentType: file.type || "image/png", upsert: false });
  if (upErr) throw upErr;

  const { data, error } = await supabase
    .from("game_screenshots_user")
    .insert({
      user_id: userId,
      game_key: gameKey,
      storage_path: path,
      caption: meta?.caption ?? null,
      width: meta?.width ?? null,
      height: meta?.height ?? null,
    })
    .select("id, storage_path, caption, width, height, taken_at")
    .single();
  if (error || !data) throw error;
  return { ...data, url: await signedUrlFor(path) };
};

export const deleteScreenshot = async (shot: GameScreenshot) => {
  await supabase.storage.from("game-screenshots").remove([shot.storage_path]);
  await supabase.from("game_screenshots_user").delete().eq("id", shot.id);
};
