import { supabase } from "@/integrations/supabase/client";

export type Visibility = "public" | "unlisted" | "private";

export type SharedClip = {
  id: string;
  user_id: string;
  share_slug: string;
  title: string;
  game_key: string | null;
  game_title: string | null;
  original_path: string | null;
  stream_path: string | null;
  thumbnail_path: string | null;
  duration_seconds: number | null;
  size_bytes: number | null;
  width: number | null;
  height: number | null;
  mime_type: string | null;
  visibility: Visibility;
  processing_status: "pending" | "ready" | "failed";
  view_count: number;
  share_count: number;
  created_at: string;
};

export const publicUrl = (path: string | null | undefined): string => {
  if (!path) return "";
  const { data } = supabase.storage.from("shared-clips").getPublicUrl(path);
  return data.publicUrl;
};

export const shareLinkFor = (slug: string): string => {
  if (typeof window === "undefined") return `/clip/${slug}`;
  const isElectron = !!(window as any).rubix?.isElectron;
  // For Electron HashRouter, use the public web preview URL when copying so links work for friends
  const origin = isElectron
    ? "https://id-preview--43bf2027-f815-467f-a3e9-d693dac162bc.lovable.app"
    : window.location.origin;
  return `${origin}/clip/${slug}`;
};

/** Extract a JPEG thumbnail from a video Blob at ~25% mark. */
export const extractThumbnail = (blob: Blob, atRatio = 0.15): Promise<Blob | null> =>
  new Promise((resolve) => {
    const url = URL.createObjectURL(blob);
    const video = document.createElement("video");
    video.preload = "auto";
    video.muted = true;
    video.playsInline = true;
    video.crossOrigin = "anonymous";
    let done = false;
    const finish = (b: Blob | null) => {
      if (done) return;
      done = true;
      URL.revokeObjectURL(url);
      resolve(b);
    };
    video.onerror = () => finish(null);
    video.onloadedmetadata = () => {
      const t = Math.min(Math.max(0.1, (video.duration || 1) * atRatio), 3);
      video.currentTime = t;
    };
    video.onseeked = () => {
      try {
        const w = video.videoWidth || 1280;
        const h = video.videoHeight || 720;
        const maxW = 960;
        const scale = Math.min(1, maxW / w);
        const cw = Math.round(w * scale);
        const ch = Math.round(h * scale);
        const canvas = document.createElement("canvas");
        canvas.width = cw;
        canvas.height = ch;
        const ctx = canvas.getContext("2d");
        if (!ctx) return finish(null);
        ctx.drawImage(video, 0, 0, cw, ch);
        canvas.toBlob((b) => finish(b), "image/jpeg", 0.82);
      } catch {
        finish(null);
      }
    };
    setTimeout(() => finish(null), 8000);
    video.src = url;
  });

export const fetchSharedClipBySlug = async (slug: string): Promise<SharedClip | null> => {
  const { data, error } = await supabase
    .from("shared_clips")
    .select("*")
    .eq("share_slug", slug)
    .maybeSingle();
  if (error || !data) return null;
  return data as SharedClip;
};

export const fetchSharedClipById = async (id: string): Promise<SharedClip | null> => {
  const { data } = await supabase.from("shared_clips").select("*").eq("id", id).maybeSingle();
  return (data as SharedClip) ?? null;
};

export const listMySharedClips = async (userId: string): Promise<SharedClip[]> => {
  const { data } = await supabase
    .from("shared_clips")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });
  return (data as SharedClip[]) ?? [];
};

export const updateSharedClip = async (
  id: string,
  patch: Partial<Pick<SharedClip, "title" | "visibility">>,
) => {
  const { error } = await supabase.from("shared_clips").update(patch).eq("id", id);
  if (error) throw error;
};

export const deleteSharedClip = async (clip: SharedClip) => {
  const paths = [clip.original_path, clip.stream_path, clip.thumbnail_path].filter(
    (p): p is string => !!p,
  );
  if (paths.length) {
    await supabase.storage.from("shared-clips").remove(paths);
  }
  await supabase.from("shared_clips").delete().eq("id", clip.id);
};

export const trackClipView = async (clipId: string) => {
  await supabase.rpc("increment_clip_view", { _clip_id: clipId } as never);
};

export const trackClipShare = async (clipId: string) => {
  await supabase.rpc("increment_clip_share", { _clip_id: clipId } as never);
};
