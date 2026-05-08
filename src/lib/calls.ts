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
  last_seen_at?: string | null;
};

export const MESH_LIMIT = 4;
/** Participants whose heartbeat is older than this are considered stale (ghosts). */
export const PARTICIPANT_STALE_MS = 20_000;

const isFresh = (p: CallParticipant) => {
  if (p.left_at) return false;
  const seen = p.last_seen_at ?? p.joined_at;
  return Date.now() - new Date(seen).getTime() < PARTICIPANT_STALE_MS;
};

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
  const all = (data ?? []) as CallParticipant[];
  return all.filter(isFresh);
};

export const joinCall = async (callId: string, peerId: string) => {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");
  const now = new Date().toISOString();
  const { error } = await supabase
    .from("call_participants")
    .upsert(
      {
        call_id: callId,
        user_id: user.id,
        peer_id: peerId,
        joined_at: now,
        last_seen_at: now,
        left_at: null,
      },
      { onConflict: "call_id,user_id" },
    );
  if (error) throw error;
};

/** Heartbeat — call regularly while the user is in the call. */
export const heartbeatCall = async (callId: string) => {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;
  await supabase
    .from("call_participants")
    .update({ last_seen_at: new Date().toISOString() })
    .eq("call_id", callId)
    .eq("user_id", user.id)
    .is("left_at", null);
};

export const leaveCall = async (callId: string) => {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;
  // Only mark ourselves as left if we were actually a participant.
  const { data: existing } = await supabase
    .from("call_participants")
    .select("user_id")
    .eq("call_id", callId)
    .eq("user_id", user.id)
    .is("left_at", null)
    .maybeSingle();
  if (!existing) return;

  await supabase
    .from("call_participants")
    .update({ left_at: new Date().toISOString() })
    .eq("call_id", callId)
    .eq("user_id", user.id);

  // If no fresh peer remains, end the session
  const remaining = await listActiveParticipants(callId);
  if (remaining.length === 0) {
    await supabase.from("call_sessions").update({ ended_at: new Date().toISOString() }).eq("id", callId);
  }
};

export const endCall = async (callId: string) => {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;
  await supabase
    .from("call_participants")
    .update({ left_at: new Date().toISOString() })
    .eq("call_id", callId)
    .eq("user_id", user.id);
  await supabase.from("call_sessions").update({ ended_at: new Date().toISOString() }).eq("id", callId);
};
