import { supabase } from "@/integrations/supabase/client";

export type CallSession = {
  id: string;
  conversation_id: string | null;
  channel_id: string | null;
  started_by: string;
  started_at: string;
  ended_at: string | null;
};

export type CallParticipant = {
  call_id: string;
  user_id: string;
  peer_id: string;
  joined_at: string;
  left_at: string | null;
};

export const MESH_LIMIT = 4;

/** Find an active (not-ended) call for a DM conversation. */
export const findActiveDmCall = async (conversationId: string): Promise<CallSession | null> => {
  const { data } = await supabase
    .from("call_sessions")
    .select("*")
    .eq("conversation_id", conversationId)
    .is("ended_at", null)
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return (data as CallSession) ?? null;
};

/** Find an active call for a community voice channel. */
export const findActiveChannelCall = async (channelId: string): Promise<CallSession | null> => {
  const { data } = await supabase
    .from("call_sessions")
    .select("*")
    .eq("channel_id", channelId)
    .is("ended_at", null)
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return (data as CallSession) ?? null;
};

export const startDmCall = async (conversationId: string): Promise<CallSession> => {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");
  const existing = await findActiveDmCall(conversationId);
  if (existing) return existing;
  const { data, error } = await supabase
    .from("call_sessions")
    .insert({ conversation_id: conversationId, started_by: user.id })
    .select("*")
    .single();
  if (error || !data) throw error ?? new Error("Failed to start call");
  return data as CallSession;
};

export const startChannelCall = async (channelId: string): Promise<CallSession> => {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");
  const existing = await findActiveChannelCall(channelId);
  if (existing) return existing;
  const { data, error } = await supabase
    .from("call_sessions")
    .insert({ channel_id: channelId, started_by: user.id })
    .select("*")
    .single();
  if (error || !data) throw error ?? new Error("Failed to start call");
  return data as CallSession;
};

export const listActiveParticipants = async (callId: string): Promise<CallParticipant[]> => {
  const { data } = await supabase
    .from("call_participants")
    .select("*")
    .eq("call_id", callId)
    .is("left_at", null);
  return (data ?? []) as CallParticipant[];
};

export const joinCall = async (callId: string, peerId: string) => {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");
  // Upsert so re-joining works
  const { error } = await supabase
    .from("call_participants")
    .upsert(
      { call_id: callId, user_id: user.id, peer_id: peerId, joined_at: new Date().toISOString(), left_at: null },
      { onConflict: "call_id,user_id" },
    );
  if (error) throw error;
};

export const leaveCall = async (callId: string) => {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;
  await supabase
    .from("call_participants")
    .update({ left_at: new Date().toISOString() })
    .eq("call_id", callId)
    .eq("user_id", user.id);

  // If no one else remains active, end the session
  const remaining = await listActiveParticipants(callId);
  if (remaining.length === 0) {
    await supabase.from("call_sessions").update({ ended_at: new Date().toISOString() }).eq("id", callId);
  }
};
