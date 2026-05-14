import { useMemo, useSyncExternalStore } from "react";
import { supabase } from "@/integrations/supabase/client";

export type PresenceStatus = "online" | "away" | "offline";
export type ManualStatus =
  | "online"
  | "available"
  | "gaming"
  | "in_match"
  | "idle"
  | "dnd"
  | "looking_to_play";

export type RichStatus =
  | PresenceStatus
  | "gaming"
  | "in_match"
  | "dnd"
  | "looking_to_play"
  | "available"
  | "idle";

const TABLE = "user_presence";
const HEARTBEAT_MS = 20_000;
const ACTIVITY_DEBOUNCE_MS = 5_000;
const TICK_MS = 5_000;
const AWAY_AFTER_MS = 5 * 60 * 1000;
const OFFLINE_AFTER_MS = 90 * 1000;
const SPEAKING_DEBOUNCE_MS = 1000;

type Row = {
  user_id: string;
  last_seen_at: string;
  last_active_at: string;
  game: string | null;
  game_started_at?: string | null;
  last_game?: string | null;
  last_game_ended_at?: string | null;
  session_seconds_today?: number | null;
  session_day?: string | null;
  manual_status?: ManualStatus | null;
  vc_call_id?: string | null;
  vc_channel_id?: string | null;
  vc_conversation_id?: string | null;
  vc_joined_at?: string | null;
  vc_speaking?: boolean | null;
  spotify_track?: string | null;
  spotify_artist?: string | null;
  spotify_art_url?: string | null;
  spotify_updated_at?: string | null;
};

export type PresenceInfo = {
  status: PresenceStatus;
  game: string | null;
};

export type RichPresence = {
  baseStatus: PresenceStatus;
  status: RichStatus;
  manualStatus: ManualStatus | null;
  game: string | null;
  gameStartedAt: string | null;
  lastGame: string | null;
  sessionSecondsToday: number;
  vc: {
    callId: string | null;
    channelId: string | null;
    conversationId: string | null;
    joinedAt: string | null;
    speaking: boolean;
  } | null;
  spotify: {
    track: string;
    artist: string | null;
    artUrl: string | null;
  } | null;
};

// ---------- Module state ----------
let trackedUserId: string | null = null;
let currentGame: string | null = null;
let lastActive = Date.now();
let lastActivityWriteAt = 0;
let lastSpeakingWriteAt = 0;
let pendingSpeaking: boolean | null = null;
let heartbeatTimer: number | null = null;
let activityCleanup: (() => void) | null = null;

const cache = new Map<string, Row>();
const requested = new Set<string>();
const listeners = new Set<() => void>();
let snapshotVersion = 0;
let tickTimer: number | null = null;
let realtimeChannel: ReturnType<typeof supabase.channel> | null = null;

const emit = () => {
  snapshotVersion += 1;
  listeners.forEach((l) => l());
};

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  ensureRealtime();
  if (tickTimer == null && typeof window !== "undefined") {
    tickTimer = window.setInterval(emit, TICK_MS);
  }
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0 && tickTimer != null) {
      window.clearInterval(tickTimer);
      tickTimer = null;
    }
  };
};

const getSnapshot = () => snapshotVersion;

const ensureRealtime = () => {
  if (realtimeChannel) return;
  realtimeChannel = supabase
    .channel("user-presence-stream")
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: TABLE },
      (payload) => {
        const row = (payload.new ?? payload.old) as Row | undefined;
        if (!row?.user_id) return;
        if (payload.eventType === "DELETE") {
          cache.delete(row.user_id);
        } else {
          cache.set(row.user_id, payload.new as Row);
        }
        emit();
      },
    )
    .subscribe();
};

const fetchMissing = async (ids: string[]) => {
  const need = ids.filter((id) => id && !requested.has(id));
  if (need.length === 0) return;
  need.forEach((id) => requested.add(id));
  const { data, error } = await supabase
    .from(TABLE)
    .select(
      "user_id,last_seen_at,last_active_at,game,game_started_at,last_game,last_game_ended_at,session_seconds_today,session_day,manual_status,vc_call_id,vc_channel_id,vc_conversation_id,vc_joined_at,vc_speaking,spotify_track,spotify_artist,spotify_art_url,spotify_updated_at",
    )
    .in("user_id", need);
  if (error) {
    need.forEach((id) => requested.delete(id));
    return;
  }
  for (const row of data ?? []) cache.set(row.user_id, row as Row);
  emit();
};

// ---------- Status derivation ----------
const baseStatusFromRow = (row: Row | undefined): PresenceStatus => {
  if (!row) return "offline";
  const now = Date.now();
  const seenMs = now - new Date(row.last_seen_at).getTime();
  if (seenMs > OFFLINE_AFTER_MS) return "offline";
  const idleMs = now - new Date(row.last_active_at).getTime();
  return idleMs > AWAY_AFTER_MS ? "away" : "online";
};

const statusFromRow = (row: Row | undefined): PresenceInfo => {
  const base = baseStatusFromRow(row);
  if (base === "offline" || !row) return { status: "offline", game: null };
  return { status: base, game: row.game ?? null };
};

const richFromRow = (row: Row | undefined): RichPresence => {
  const base = baseStatusFromRow(row);
  const empty: RichPresence = {
    baseStatus: base,
    status: base,
    manualStatus: null,
    game: null,
    gameStartedAt: null,
    lastGame: null,
    sessionSecondsToday: 0,
    vc: null,
    spotify: null,
  };
  if (!row || base === "offline") return { ...empty, baseStatus: "offline", status: "offline" };

  const manual = row.manual_status ?? null;
  const inVc = !!row.vc_call_id;
  const inGame = !!row.game;

  let derived: RichStatus = base;
  if (manual === "dnd") derived = "dnd";
  else if (manual === "looking_to_play") derived = "looking_to_play";
  else if (manual) derived = manual;
  else if (inGame) derived = "gaming";
  else if (inVc) derived = base === "away" ? "away" : "available";

  return {
    baseStatus: base,
    status: derived,
    manualStatus: manual,
    game: row.game ?? null,
    gameStartedAt: row.game_started_at ?? null,
    lastGame: row.last_game ?? null,
    sessionSecondsToday: row.session_seconds_today ?? 0,
    vc: inVc
      ? {
          callId: row.vc_call_id ?? null,
          channelId: row.vc_channel_id ?? null,
          conversationId: row.vc_conversation_id ?? null,
          joinedAt: row.vc_joined_at ?? null,
          speaking: !!row.vc_speaking,
        }
      : null,
    spotify: row.spotify_track
      ? {
          track: row.spotify_track,
          artist: row.spotify_artist ?? null,
          artUrl: row.spotify_art_url ?? null,
        }
      : null,
  };
};

export const getPresenceInfo = (userId: string): PresenceInfo =>
  statusFromRow(cache.get(userId));

export const getPresenceStatus = (userId: string): PresenceStatus =>
  getPresenceInfo(userId).status;

export const getRichPresence = (userId: string): RichPresence =>
  richFromRow(cache.get(userId));

// ---------- Writes ----------
const todayUtcDate = () => new Date().toISOString().slice(0, 10);

const upsert = async (patch: Partial<Row>) => {
  if (!trackedUserId) return;
  const now = new Date().toISOString();
  const existing = cache.get(trackedUserId);
  const row: Row = {
    user_id: trackedUserId,
    last_seen_at: now,
    last_active_at: new Date(lastActive).toISOString(),
    game: currentGame,
    ...(existing ?? {}),
    ...patch,
  };
  // ensure these always reflect "now" for our heartbeat
  row.last_seen_at = now;
  row.last_active_at = new Date(lastActive).toISOString();
  if (patch.game !== undefined) row.game = patch.game;
  cache.set(trackedUserId, row);
  emit();
  await supabase.from(TABLE).upsert(row, { onConflict: "user_id" });
};

const onActivity = () => {
  lastActive = Date.now();
  if (Date.now() - lastActivityWriteAt > ACTIVITY_DEBOUNCE_MS) {
    lastActivityWriteAt = Date.now();
    void upsert({});
  }
};

export const resyncPresence = () => {
  lastActive = Date.now();
  void upsert({});
};

export const setPresenceGame = (game: string | null) => {
  if (currentGame === game) return;
  const prev = currentGame;
  currentGame = game;

  if (game) {
    // game start: stamp game_started_at
    void upsert({
      game,
      game_started_at: new Date().toISOString(),
    });
  } else {
    // game end: accumulate session, set last_game
    const existing = cache.get(trackedUserId ?? "");
    let addSeconds = 0;
    if (existing?.game_started_at) {
      addSeconds = Math.max(
        0,
        Math.floor((Date.now() - new Date(existing.game_started_at).getTime()) / 1000),
      );
    }
    const today = todayUtcDate();
    const sameDay = existing?.session_day === today;
    const newTotal = (sameDay ? existing?.session_seconds_today ?? 0 : 0) + addSeconds;
    void upsert({
      game: null,
      game_started_at: null,
      last_game: prev ?? existing?.game ?? null,
      last_game_ended_at: new Date().toISOString(),
      session_seconds_today: newTotal,
      session_day: today,
    });
  }
};

export const getPresenceGame = () => currentGame;

export const setManualStatus = (status: ManualStatus | null) => {
  void upsert({ manual_status: status });
};

export type VcContext = {
  callId: string;
  channelId?: string | null;
  conversationId?: string | null;
} | null;

export const setPresenceVC = (vc: VcContext) => {
  if (vc) {
    void upsert({
      vc_call_id: vc.callId,
      vc_channel_id: vc.channelId ?? null,
      vc_conversation_id: vc.conversationId ?? null,
      vc_joined_at: new Date().toISOString(),
      vc_speaking: false,
    });
  } else {
    void upsert({
      vc_call_id: null,
      vc_channel_id: null,
      vc_conversation_id: null,
      vc_joined_at: null,
      vc_speaking: false,
    });
  }
};

export const setPresenceSpeaking = (speaking: boolean) => {
  pendingSpeaking = speaking;
  const now = Date.now();
  if (now - lastSpeakingWriteAt < SPEAKING_DEBOUNCE_MS) return;
  lastSpeakingWriteAt = now;
  const v = pendingSpeaking;
  pendingSpeaking = null;
  void upsert({ vc_speaking: !!v });
};

export const setPresenceSpotify = (
  data: { track: string; artist: string | null; artUrl: string | null } | null,
) => {
  void upsert({
    spotify_track: data?.track ?? null,
    spotify_artist: data?.artist ?? null,
    spotify_art_url: data?.artUrl ?? null,
    spotify_updated_at: new Date().toISOString(),
  });
};

export const startPresence = async (userId: string) => {
  if (trackedUserId === userId) {
    resyncPresence();
    return;
  }
  await stopPresence();
  trackedUserId = userId;
  lastActive = Date.now();
  lastActivityWriteAt = Date.now();
  ensureRealtime();
  await upsert({});

  const onVisibility = () => {
    if (document.visibilityState === "visible") onActivity();
  };
  window.addEventListener("mousemove", onActivity, { passive: true });
  window.addEventListener("keydown", onActivity);
  window.addEventListener("focus", onActivity);
  document.addEventListener("visibilitychange", onVisibility);
  heartbeatTimer = window.setInterval(() => {
    void upsert({});
  }, HEARTBEAT_MS);

  activityCleanup = () => {
    window.removeEventListener("mousemove", onActivity);
    window.removeEventListener("keydown", onActivity);
    window.removeEventListener("focus", onActivity);
    document.removeEventListener("visibilitychange", onVisibility);
    if (heartbeatTimer != null) {
      window.clearInterval(heartbeatTimer);
      heartbeatTimer = null;
    }
  };
};

export const stopPresence = async () => {
  if (activityCleanup) {
    activityCleanup();
    activityCleanup = null;
  }
  const uid = trackedUserId;
  trackedUserId = null;
  currentGame = null;
  if (uid) {
    const past = new Date(Date.now() - OFFLINE_AFTER_MS - 1000).toISOString();
    await supabase
      .from(TABLE)
      .upsert(
        {
          user_id: uid,
          last_seen_at: past,
          last_active_at: past,
          game: null,
          vc_call_id: null,
          vc_channel_id: null,
          vc_conversation_id: null,
          vc_joined_at: null,
          vc_speaking: false,
        },
        { onConflict: "user_id" },
      );
  }
};

// ---------- React hooks ----------
export const usePresenceStatus = (userId: string | null | undefined): PresenceStatus => {
  useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  if (userId) void fetchMissing([userId]);
  return userId ? getPresenceStatus(userId) : "offline";
};

export const usePresenceInfo = (userId: string | null | undefined): PresenceInfo => {
  useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  if (userId) void fetchMissing([userId]);
  return userId ? getPresenceInfo(userId) : { status: "offline", game: null };
};

export const usePresenceMap = (userIds: string[]): Map<string, PresenceInfo> => {
  useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  if (userIds.length) void fetchMissing(userIds);
  const m = new Map<string, PresenceInfo>();
  for (const id of userIds) m.set(id, getPresenceInfo(id));
  return m;
};

export const useRichPresence = (userId: string | null | undefined): RichPresence => {
  const v = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  if (userId) void fetchMissing([userId]);
  return useMemo(() => (userId ? getRichPresence(userId) : richFromRow(undefined)), [userId, v]);
};

export const useRichPresenceMap = (userIds: string[]): Map<string, RichPresence> => {
  const v = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  if (userIds.length) void fetchMissing(userIds);
  return useMemo(() => {
    const m = new Map<string, RichPresence>();
    for (const id of userIds) m.set(id, getRichPresence(id));
    return m;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userIds.join("|"), v]);
};

// ---------- Status display helpers ----------
export const STATUS_LABEL: Record<RichStatus, string> = {
  online: "Online",
  away: "Away",
  offline: "Offline",
  available: "Available",
  gaming: "Gaming",
  in_match: "In Match",
  idle: "Idle",
  dnd: "Do Not Disturb",
  looking_to_play: "Looking to Play",
};

export const formatSessionDuration = (startIso: string | null): string => {
  if (!startIso) return "";
  const ms = Date.now() - new Date(startIso).getTime();
  if (ms < 0) return "";
  const mins = Math.floor(ms / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
};

export const formatTotalToday = (seconds: number): string => {
  if (!seconds || seconds < 60) return "";
  const mins = Math.floor(seconds / 60);
  if (mins < 60) return `${mins}m today`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m === 0 ? `${h}h today` : `${h}h ${m}m today`;
};
