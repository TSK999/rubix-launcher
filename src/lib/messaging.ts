import { supabase } from "@/integrations/supabase/client";

export type Conversation = {
  id: string;
  is_group: boolean;
  name: string | null;
  avatar_url: string | null;
  created_by: string;
  last_message_at: string;
  updated_at: string;
};

export type ConversationMember = {
  conversation_id: string;
  user_id: string;
  is_admin: boolean;
  joined_at: string;
  last_read_at: string;
};

export type Attachment = {
  id: string;
  message_id: string;
  storage_path: string | null;
  external_url: string | null;
  kind: "image" | "video" | "file" | "gif";
  mime_type: string | null;
  file_name: string | null;
  size_bytes: number | null;
  width: number | null;
  height: number | null;
};

export type Reaction = {
  message_id: string;
  user_id: string;
  emoji: string;
};

export type Message = {
  id: string;
  conversation_id: string;
  sender_id: string;
  content: string | null;
  reply_to_id: string | null;
  edited_at: string | null;
  deleted_at: string | null;
  created_at: string;
  attachments?: Attachment[];
  reactions?: Reaction[];
};

export type ProfileLite = {
  user_id: string;
  username: string;
  display_name: string | null;
  avatar_url: string | null;
};

/** List conversations the current user is a member of. */
export const listConversations = async (): Promise<Conversation[]> => {
  const { data, error } = await supabase
    .from("conversations")
    .select("*")
    .order("last_message_at", { ascending: false });
  if (error) throw error;
  return data ?? [];
};

/** Members of a conversation. */
export const listMembers = async (conversationId: string): Promise<ConversationMember[]> => {
  const { data, error } = await supabase
    .from("conversation_members")
    .select("*")
    .eq("conversation_id", conversationId);
  if (error) throw error;
  return data ?? [];
};

/** Bulk fetch profiles by user_id. */
export const fetchProfiles = async (userIds: string[]): Promise<Map<string, ProfileLite>> => {
  const map = new Map<string, ProfileLite>();
  if (userIds.length === 0) return map;
  const unique = Array.from(new Set(userIds));
  const { data, error } = await supabase
    .from("profiles")
    .select("user_id, username, display_name, avatar_url")
    .in("user_id", unique);
  if (error || !data) return map;
  for (const p of data) map.set(p.user_id, p as ProfileLite);
  return map;
};

/** Search profiles by username or display name. */
export const searchProfiles = async (q: string, limit = 10): Promise<ProfileLite[]> => {
  const term = q.trim();
  if (!term) return [];
  const { data, error } = await supabase
    .from("profiles")
    .select("user_id, username, display_name, avatar_url")
    .or(`username.ilike.%${term}%,display_name.ilike.%${term}%`)
    .limit(limit);
  if (error || !data) return [];
  return data as ProfileLite[];
};

/** Find or create a 1:1 DM with another user. */
export const getOrCreateDm = async (otherUserId: string): Promise<string> => {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");
  if (user.id === otherUserId) throw new Error("Cannot DM yourself");

  // Find an existing 1:1 conversation that contains exactly these two members
  const { data: mine } = await supabase
    .from("conversation_members")
    .select("conversation_id")
    .eq("user_id", user.id);

  const myConvIds = (mine ?? []).map((m) => m.conversation_id as string);

  if (myConvIds.length > 0) {
    // Filter to non-group conversations only
    const { data: convs } = await supabase
      .from("conversations")
      .select("id")
      .in("id", myConvIds)
      .eq("is_group", false);
    const dmIds = (convs ?? []).map((c) => c.id as string);

    if (dmIds.length > 0) {
      const { data: theirs } = await supabase
        .from("conversation_members")
        .select("conversation_id")
        .eq("user_id", otherUserId)
        .in("conversation_id", dmIds);
      const match = theirs?.[0]?.conversation_id;
      if (match) return match;
    }
  }

  // Create new
  const { data: conv, error: convErr } = await supabase
    .from("conversations")
    .insert({ is_group: false, created_by: user.id })
    .select("id")
    .single();
  if (convErr || !conv) throw convErr ?? new Error("Failed to create conversation");

  const { error: memErr } = await supabase.from("conversation_members").insert([
    { conversation_id: conv.id, user_id: user.id, is_admin: true },
    { conversation_id: conv.id, user_id: otherUserId },
  ]);
  if (memErr) throw memErr;

  return conv.id;
};

/** Create a group conversation with given members (current user added automatically). */
export const createGroup = async (
  name: string,
  memberIds: string[],
  avatarUrl?: string | null,
): Promise<string> => {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  const { data: conv, error } = await supabase
    .from("conversations")
    .insert({
      is_group: true,
      name: name.trim() || "New group",
      avatar_url: avatarUrl ?? null,
      created_by: user.id,
    })
    .select("id")
    .single();
  if (error || !conv) throw error ?? new Error("Failed to create group");

  const rows = [
    { conversation_id: conv.id, user_id: user.id, is_admin: true },
    ...memberIds
      .filter((id) => id !== user.id)
      .map((id) => ({ conversation_id: conv.id, user_id: id, is_admin: false })),
  ];
  const { error: memErr } = await supabase.from("conversation_members").insert(rows);
  if (memErr) throw memErr;

  return conv.id;
};

/** List messages with attachments and reactions. */
export const listMessages = async (conversationId: string, limit = 100): Promise<Message[]> => {
  const { data, error } = await supabase
    .from("messages")
    .select("*, attachments:message_attachments(*), reactions:message_reactions(*)")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: true })
    .limit(limit);
  if (error) throw error;
  return (data ?? []) as Message[];
};

export type SendMessageInput = {
  conversationId: string;
  content?: string | null;
  replyToId?: string | null;
  attachments?: Array<Omit<Attachment, "id" | "message_id">>;
};

export const sendMessage = async (input: SendMessageInput): Promise<Message> => {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  const { data: msg, error } = await supabase
    .from("messages")
    .insert({
      conversation_id: input.conversationId,
      sender_id: user.id,
      content: input.content ?? null,
      reply_to_id: input.replyToId ?? null,
    })
    .select("*")
    .single();
  if (error || !msg) throw error ?? new Error("Failed to send");

  if (input.attachments && input.attachments.length > 0) {
    const { error: attErr } = await supabase.from("message_attachments").insert(
      input.attachments.map((a) => ({ ...a, message_id: msg.id })),
    );
    if (attErr) throw attErr;
  }

  return msg as Message;
};

export const editMessage = async (id: string, content: string) => {
  const { error } = await supabase
    .from("messages")
    .update({ content })
    .eq("id", id);
  if (error) throw error;
};

export const deleteMessage = async (id: string) => {
  const { error } = await supabase
    .from("messages")
    .update({ deleted_at: new Date().toISOString(), content: null })
    .eq("id", id);
  if (error) throw error;
};

export const toggleReaction = async (messageId: string, emoji: string) => {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;
  // Try delete first; if zero rows affected, insert.
  const { data: existing } = await supabase
    .from("message_reactions")
    .select("emoji")
    .eq("message_id", messageId)
    .eq("user_id", user.id)
    .eq("emoji", emoji)
    .maybeSingle();
  if (existing) {
    await supabase
      .from("message_reactions")
      .delete()
      .eq("message_id", messageId)
      .eq("user_id", user.id)
      .eq("emoji", emoji);
  } else {
    await supabase
      .from("message_reactions")
      .insert({ message_id: messageId, user_id: user.id, emoji });
  }
};

export const markRead = async (conversationId: string) => {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;
  await supabase
    .from("conversation_members")
    .update({ last_read_at: new Date().toISOString() })
    .eq("conversation_id", conversationId)
    .eq("user_id", user.id);
};

export const setTyping = async (conversationId: string) => {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;
  await supabase
    .from("typing_indicators")
    .upsert({
      conversation_id: conversationId,
      user_id: user.id,
      updated_at: new Date().toISOString(),
    });
};

export const clearTyping = async (conversationId: string) => {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;
  await supabase
    .from("typing_indicators")
    .delete()
    .eq("conversation_id", conversationId)
    .eq("user_id", user.id);
};

/** Upload a chat attachment. Returns the storage_path and public/signed URL helper. */
export const uploadChatFile = async (
  conversationId: string,
  file: File,
): Promise<{ storage_path: string; signed_url: string }> => {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
  const path = `${conversationId}/${user.id}/${Date.now()}_${safeName}`;
  const { error } = await supabase.storage
    .from("chat-attachments")
    .upload(path, file, { contentType: file.type, upsert: false });
  if (error) throw error;
  const { data: signed } = await supabase.storage
    .from("chat-attachments")
    .createSignedUrl(path, 60 * 60 * 24);
  return { storage_path: path, signed_url: signed?.signedUrl ?? "" };
};

/** Get a fresh signed URL for an existing attachment path. */
export const getSignedAttachmentUrl = async (path: string): Promise<string | null> => {
  const { data } = await supabase.storage
    .from("chat-attachments")
    .createSignedUrl(path, 60 * 60 * 6);
  return data?.signedUrl ?? null;
};

/** Custom emojis */
export type CustomEmoji = {
  id: string;
  owner_id: string;
  name: string;
  storage_path: string;
  url: string;
};

export const listMyCustomEmojis = async (): Promise<CustomEmoji[]> => {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];
  const { data, error } = await supabase
    .from("custom_emojis")
    .select("*")
    .eq("owner_id", user.id)
    .order("created_at", { ascending: true });
  if (error || !data) return [];
  return data as CustomEmoji[];
};

export const uploadCustomEmoji = async (file: File, name: string): Promise<CustomEmoji> => {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");
  const slug = name.toLowerCase().replace(/[^a-z0-9_]/g, "_").slice(0, 32) || `emoji_${Date.now()}`;
  const ext = file.name.split(".").pop()?.toLowerCase() || "png";
  const path = `${user.id}/${slug}_${Date.now()}.${ext}`;
  const { error: upErr } = await supabase.storage
    .from("custom-emojis")
    .upload(path, file, { contentType: file.type, upsert: false });
  if (upErr) throw upErr;
  const { data: pub } = supabase.storage.from("custom-emojis").getPublicUrl(path);
  const { data, error } = await supabase
    .from("custom_emojis")
    .insert({ owner_id: user.id, name: slug, storage_path: path, url: pub.publicUrl })
    .select("*")
    .single();
  if (error || !data) throw error ?? new Error("Failed to save emoji");
  return data as CustomEmoji;
};

export const deleteCustomEmoji = async (emoji: CustomEmoji) => {
  await supabase.storage.from("custom-emojis").remove([emoji.storage_path]);
  await supabase.from("custom_emojis").delete().eq("id", emoji.id);
};

/** Tenor GIF search (no key required for limited queries via Google Tenor v2 anonymous endpoint).
 *  We use the public preview endpoint via a small wrapper; if rate-limited, picker shows error. */
export type TenorGif = {
  id: string;
  url: string;        // direct mp4 or gif
  preview: string;
  title: string;
};

export const searchTenor = async (q: string): Promise<TenorGif[]> => {
  // Tenor v2 anonymous: requires a client_key but no API key for limited use is no longer supported.
  // Use the lighter "g.tenor.com" search endpoint (legacy v1) which returns CORS-enabled JSON.
  try {
    const res = await fetch(
      `https://g.tenor.com/v1/search?q=${encodeURIComponent(q)}&limit=24&media_filter=minimal&contentfilter=high`,
    );
    if (!res.ok) return [];
    const json = await res.json();
    return (json.results ?? []).map((r: any) => ({
      id: r.id,
      url: r.media?.[0]?.gif?.url ?? r.media?.[0]?.tinygif?.url ?? "",
      preview: r.media?.[0]?.tinygif?.url ?? r.media?.[0]?.gif?.url ?? "",
      title: r.title || r.content_description || "",
    })).filter((g: TenorGif) => g.url);
  } catch {
    return [];
  }
};

export const trendingTenor = async (): Promise<TenorGif[]> => {
  try {
    const res = await fetch(
      `https://g.tenor.com/v1/trending?limit=24&media_filter=minimal&contentfilter=high`,
    );
    if (!res.ok) return [];
    const json = await res.json();
    return (json.results ?? []).map((r: any) => ({
      id: r.id,
      url: r.media?.[0]?.gif?.url ?? r.media?.[0]?.tinygif?.url ?? "",
      preview: r.media?.[0]?.tinygif?.url ?? r.media?.[0]?.gif?.url ?? "",
      title: r.title || r.content_description || "",
    })).filter((g: TenorGif) => g.url);
  } catch {
    return [];
  }
};
