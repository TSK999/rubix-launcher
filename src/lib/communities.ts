import { supabase } from "@/integrations/supabase/client";
import type { ProfileLite } from "./messaging";

export type Community = {
  id: string;
  name: string;
  icon_url: string | null;
  banner_url: string | null;
  owner_id: string;
  invite_code: string;
  created_at: string;
  updated_at: string;
};

export type CommunityRole = "owner" | "admin" | "member";

export type CommunityMember = {
  community_id: string;
  user_id: string;
  role: CommunityRole;
  joined_at: string;
};

export type CommunityChannel = {
  id: string;
  community_id: string;
  name: string;
  kind: "text" | "voice";
  position: number;
  created_at: string;
};

export type CommunityMessage = {
  id: string;
  channel_id: string;
  sender_id: string;
  content: string | null;
  reply_to_id: string | null;
  edited_at: string | null;
  deleted_at: string | null;
  created_at: string;
  reactions?: { message_id: string; user_id: string; emoji: string }[];
};

/** List communities the current user is a member of. */
export const listMyCommunities = async (): Promise<Community[]> => {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];
  const { data: mems } = await supabase
    .from("community_members")
    .select("community_id")
    .eq("user_id", user.id);
  const ids = (mems ?? []).map((m) => m.community_id);
  if (ids.length === 0) return [];
  const { data } = await supabase
    .from("communities")
    .select("*")
    .in("id", ids)
    .order("created_at", { ascending: true });
  return (data ?? []) as Community[];
};

export const getCommunity = async (id: string): Promise<Community | null> => {
  const { data } = await supabase.from("communities").select("*").eq("id", id).maybeSingle();
  return (data as Community) ?? null;
};

export const createCommunity = async (name: string, iconUrl?: string | null): Promise<string> => {
  const { data, error } = await supabase.rpc("create_community", { _name: name, _icon_url: iconUrl ?? null });
  if (error) throw error;
  return data as string;
};

export const joinCommunityByCode = async (code: string): Promise<string> => {
  const { data, error } = await supabase.rpc("join_community_by_code", { _code: code });
  if (error) throw error;
  return data as string;
};

export const regenerateInviteCode = async (communityId: string): Promise<string> => {
  const { data, error } = await supabase.rpc("regenerate_invite_code", { _cid: communityId });
  if (error) throw error;
  return data as string;
};

export const updateCommunity = async (
  id: string,
  patch: Partial<Pick<Community, "name" | "icon_url" | "banner_url">>,
) => {
  const { error } = await supabase.from("communities").update(patch).eq("id", id);
  if (error) throw error;
};

export const deleteCommunity = async (id: string) => {
  const { error } = await supabase.from("communities").delete().eq("id", id);
  if (error) throw error;
};

export const leaveCommunity = async (id: string) => {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;
  const { error } = await supabase
    .from("community_members")
    .delete()
    .eq("community_id", id)
    .eq("user_id", user.id);
  if (error) throw error;
};

export const listChannels = async (communityId: string): Promise<CommunityChannel[]> => {
  const { data } = await supabase
    .from("community_channels")
    .select("*")
    .eq("community_id", communityId)
    .order("position", { ascending: true })
    .order("created_at", { ascending: true });
  return (data ?? []) as CommunityChannel[];
};

export const createChannel = async (
  communityId: string,
  name: string,
  kind: "text" | "voice",
): Promise<CommunityChannel> => {
  const { data, error } = await supabase
    .from("community_channels")
    .insert({ community_id: communityId, name: name.trim(), kind, position: 0 })
    .select("*")
    .single();
  if (error || !data) throw error ?? new Error("Failed to create channel");
  return data as CommunityChannel;
};

export const deleteChannel = async (id: string) => {
  await supabase.from("community_channels").delete().eq("id", id);
};

export const listCommunityMembers = async (
  communityId: string,
): Promise<Array<CommunityMember & { profile: ProfileLite | null }>> => {
  const { data: mems } = await supabase
    .from("community_members")
    .select("*")
    .eq("community_id", communityId);
  const list = (mems ?? []) as CommunityMember[];
  if (list.length === 0) return [];
  const { data: profs } = await supabase
    .from("profiles")
    .select("user_id, username, display_name, avatar_url")
    .in("user_id", list.map((m) => m.user_id));
  const map = new Map<string, ProfileLite>();
  (profs ?? []).forEach((p) => map.set(p.user_id, p as ProfileLite));
  return list.map((m) => ({ ...m, profile: map.get(m.user_id) ?? null }));
};

export const listChannelMessages = async (
  channelId: string,
  limit = 100,
): Promise<CommunityMessage[]> => {
  const { data, error } = await supabase
    .from("community_messages")
    .select("*, reactions:community_message_reactions(*)")
    .eq("channel_id", channelId)
    .order("created_at", { ascending: true })
    .limit(limit);
  if (error) throw error;
  return (data ?? []) as CommunityMessage[];
};

export const sendChannelMessage = async (
  channelId: string,
  content: string,
  replyToId?: string | null,
): Promise<CommunityMessage> => {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");
  const { data, error } = await supabase
    .from("community_messages")
    .insert({
      channel_id: channelId,
      sender_id: user.id,
      content,
      reply_to_id: replyToId ?? null,
    })
    .select("*")
    .single();
  if (error || !data) throw error ?? new Error("Failed to send");
  return data as CommunityMessage;
};

export const editChannelMessage = async (id: string, content: string) => {
  const { error } = await supabase.from("community_messages").update({ content }).eq("id", id);
  if (error) throw error;
};

export const deleteChannelMessage = async (id: string) => {
  const { error } = await supabase
    .from("community_messages")
    .update({ deleted_at: new Date().toISOString(), content: null })
    .eq("id", id);
  if (error) throw error;
};

export const toggleCommunityReaction = async (messageId: string, emoji: string) => {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;
  const { data: existing } = await supabase
    .from("community_message_reactions")
    .select("emoji")
    .eq("message_id", messageId)
    .eq("user_id", user.id)
    .eq("emoji", emoji)
    .maybeSingle();
  if (existing) {
    await supabase
      .from("community_message_reactions")
      .delete()
      .eq("message_id", messageId)
      .eq("user_id", user.id)
      .eq("emoji", emoji);
  } else {
    await supabase
      .from("community_message_reactions")
      .insert({ message_id: messageId, user_id: user.id, emoji });
  }
};
