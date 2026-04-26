import { supabase } from "@/integrations/supabase/client";
import type { Socials } from "@/lib/socials";
import type { ProfileCustomization } from "@/lib/profile-customization";

export type RubixPublicProfile = {
  id: string;
  user_id: string;
  username: string;
  display_name: string | null;
  avatar_url: string | null;
  bio: string | null;
  background_url: string | null;
  background_kind: "image" | "gif" | "video" | null;
  privacy: "public" | "friends" | "private";
  steam_id: string | null;
  socials: Socials;
  pronouns: string | null;
  location: string | null;
  status_emoji: string | null;
  status_text: string | null;
  customization: ProfileCustomization;
};

const PROFILE_COLS =
  "id, user_id, username, display_name, avatar_url, bio, background_url, background_kind, privacy, steam_id, socials, pronouns, location, status_emoji, status_text, customization";

export type FriendshipRow = {
  id: string;
  user_a: string;
  user_b: string;
  requested_by: string;
  status: "pending" | "accepted" | "blocked";
  created_at: string;
  updated_at: string;
};

export type FriendshipState =
  | { kind: "self" }
  | { kind: "none" }
  | { kind: "outgoing"; row: FriendshipRow }
  | { kind: "incoming"; row: FriendshipRow }
  | { kind: "friends"; row: FriendshipRow }
  | { kind: "blocked"; row: FriendshipRow };

export const fetchProfileByUsername = async (
  username: string,
): Promise<RubixPublicProfile | null> => {
  const { data, error } = await supabase
    .from("profiles")
    .select(PROFILE_COLS)
    .ilike("username", username)
    .maybeSingle();
  if (error || !data) return null;
  return normalize(data);
};

const normalize = (row: Record<string, unknown>): RubixPublicProfile => ({
  ...(row as unknown as Omit<RubixPublicProfile, "socials" | "customization">),
  socials: (row.socials && typeof row.socials === "object" ? row.socials : {}) as Socials,
  customization: (row.customization && typeof row.customization === "object"
    ? row.customization
    : {}) as ProfileCustomization,
});

export const searchProfiles = async (q: string, limit = 8): Promise<RubixPublicProfile[]> => {
  if (!q.trim()) return [];
  const { data, error } = await supabase
    .from("profiles")
    .select(PROFILE_COLS)
    .or(`username.ilike.%${q}%,display_name.ilike.%${q}%`)
    .limit(limit * 2);
  if (error || !data) return [];
  const rows = (data as Record<string, unknown>[]).map(normalize);

  // Filter out anyone in a blocked friendship with the current viewer
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return rows.slice(0, limit);
  const otherIds = rows.map((p) => p.user_id);
  const blockedIds = await fetchBlockedUserIds(user.id, otherIds);
  return rows.filter((p) => !blockedIds.has(p.user_id)).slice(0, limit);
};

/**
 * Returns a set of user_ids that the viewer has blocked (or that have blocked the viewer).
 * Scoped to a candidate list to keep queries small.
 */
export const fetchBlockedUserIds = async (
  meId: string,
  candidateIds: string[],
): Promise<Set<string>> => {
  if (candidateIds.length === 0) return new Set();
  const { data, error } = await supabase
    .from("rubix_friendships")
    .select("user_a, user_b, status")
    .eq("status", "blocked")
    .or(`user_a.eq.${meId},user_b.eq.${meId}`);
  if (error || !data) return new Set();
  const blocked = new Set<string>();
  for (const row of data) {
    const other = row.user_a === meId ? row.user_b : row.user_a;
    if (candidateIds.includes(other)) blocked.add(other);
  }
  return blocked;
};

export const blockUser = async (meId: string, otherId: string) => {
  if (meId === otherId) throw new Error("Cannot block yourself");
  const [ua, ub] = orderPair(meId, otherId);
  // Upsert into the unique pair: delete any existing then insert blocked
  await supabase.from("rubix_friendships").delete().eq("user_a", ua).eq("user_b", ub);
  const { error } = await supabase
    .from("rubix_friendships")
    .insert({ user_a: ua, user_b: ub, requested_by: meId, status: "blocked" });
  if (error) throw error;
};

export const unblockUser = async (rowId: string) => {
  const { error } = await supabase.from("rubix_friendships").delete().eq("id", rowId);
  if (error) throw error;
};

const orderPair = (a: string, b: string): [string, string] =>
  a < b ? [a, b] : [b, a];

export const fetchFriendship = async (
  meId: string,
  otherId: string,
): Promise<FriendshipState> => {
  if (meId === otherId) return { kind: "self" };
  const [ua, ub] = orderPair(meId, otherId);
  const { data, error } = await supabase
    .from("rubix_friendships")
    .select("*")
    .eq("user_a", ua)
    .eq("user_b", ub)
    .maybeSingle();
  if (error || !data) return { kind: "none" };
  const row = data as FriendshipRow;
  if (row.status === "accepted") return { kind: "friends", row };
  if (row.status === "blocked") return { kind: "blocked", row };
  if (row.requested_by === meId) return { kind: "outgoing", row };
  return { kind: "incoming", row };
};

export const sendFriendRequest = async (meId: string, otherId: string) => {
  if (meId === otherId) throw new Error("Cannot friend yourself");
  const [ua, ub] = orderPair(meId, otherId);
  const { error } = await supabase
    .from("rubix_friendships")
    .insert({ user_a: ua, user_b: ub, requested_by: meId, status: "pending" });
  if (error) throw error;
};

export const acceptFriendRequest = async (rowId: string) => {
  const { error } = await supabase
    .from("rubix_friendships")
    .update({ status: "accepted" })
    .eq("id", rowId);
  if (error) throw error;
};

export const removeFriendship = async (rowId: string) => {
  const { error } = await supabase.from("rubix_friendships").delete().eq("id", rowId);
  if (error) throw error;
};

export const updateMyProfile = async (
  userId: string,
  patch: Partial<
    Pick<
      RubixPublicProfile,
      "display_name" | "bio" | "avatar_url" | "background_url" | "background_kind" | "privacy" | "socials"
    >
  >,
) => {
  const { error } = await supabase.from("profiles").update(patch).eq("user_id", userId);
  if (error) throw error;
};

const MAX_BG_BYTES = 25 * 1024 * 1024;

export const uploadProfileBackground = async (
  userId: string,
  file: File,
): Promise<{ url: string; kind: "image" | "gif" | "video" }> => {
  if (file.size > MAX_BG_BYTES) throw new Error("File exceeds 25MB limit");
  const mime = file.type.toLowerCase();
  let kind: "image" | "gif" | "video";
  if (mime === "image/gif") kind = "gif";
  else if (mime.startsWith("video/")) kind = "video";
  else if (mime.startsWith("image/")) kind = "image";
  else throw new Error("Unsupported file type");
  const ext = file.name.split(".").pop()?.toLowerCase() ?? "bin";
  const path = `${userId}/bg-${Date.now()}.${ext}`;
  const { error: upErr } = await supabase.storage
    .from("profile-backgrounds")
    .upload(path, file, { cacheControl: "3600", upsert: true, contentType: file.type });
  if (upErr) throw upErr;
  const { data } = supabase.storage.from("profile-backgrounds").getPublicUrl(path);
  return { url: data.publicUrl, kind };
};

export const uploadProfileAvatar = async (
  userId: string,
  file: File,
): Promise<string> => {
  if (file.size > 5 * 1024 * 1024) throw new Error("Avatar must be under 5MB");
  if (!file.type.startsWith("image/")) throw new Error("Avatar must be an image");
  const ext = file.name.split(".").pop()?.toLowerCase() ?? "png";
  const path = `${userId}/avatar-${Date.now()}.${ext}`;
  const { error: upErr } = await supabase.storage
    .from("profile-backgrounds")
    .upload(path, file, { cacheControl: "3600", upsert: true, contentType: file.type });
  if (upErr) throw upErr;
  const { data } = supabase.storage.from("profile-backgrounds").getPublicUrl(path);
  return data.publicUrl;
};
