import { useEffect, useSyncExternalStore } from "react";
import { supabase } from "@/integrations/supabase/client";

export type PresenceStatus = "online" | "away" | "offline";

const TABLE = "user_presence";
const HEARTBEAT_MS = 20_000;
const ACTIVITY_DEBOUNCE_MS = 5_000;
const TICK_MS = 5_000;
const AWAY_AFTER_MS = 5 * 60 * 1000;
const OFFLINE_AFTER_MS = 90 * 1000;

type Row = {
  user_id: string;
  last_seen_at: string;
  last_active_at: string;
  game: string | null;
};

export type PresenceInfo = { status: PresenceStatus; game: string | null };

// ---------- Module state ----------
let trackedUserId: string | null = null;
let currentGame: string | null = null;
let lastActive = Date.now();
let lastActivityWriteAt = 0;
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
    .select("user_id,last_seen_at,last_active_at,game")
    .in("user_id", need);
  if (error) {
    need.forEach((id) => requested.delete(id));
    return;
  }
  for (const row of data ?? []) cache.set(row.user_id, row as Row);
  emit();
};

// ---------- Status derivation ----------
const statusFromRow = (row: Row | undefined): PresenceInfo => {
  if (!row) return { status: "offline", game: null };
  const now = Date.now();
  const seenMs = now - new Date(row.last_seen_at).getTime();
  if (seenMs > OFFLINE_AFTER_MS) return { status: "offline", game: null };
  const idleMs = now - new Date(row.last_active_at).getTime();
  const status: PresenceStatus = idleMs > AWAY_AFTER_MS ? "away" : "online";
  return { status, game: row.game ?? null };
};

export const getPresenceInfo = (userId: string): PresenceInfo =>
  statusFromRow(cache.get(userId));

export const getPresenceStatus = (userId: string): PresenceStatus =>
  getPresenceInfo(userId).status;

// ---------- Writes ----------
const upsert = async (patch: Partial<Row>) => {
  if (!trackedUserId) return;
  const now = new Date().toISOString();
  const row: Row = {
    user_id: trackedUserId,
    last_seen_at: now,
    last_active_at: new Date(lastActive).toISOString(),
    game: currentGame,
    ...patch,
  };
  // Optimistic local update
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
  currentGame = game;
  void upsert({ game });
};

export const getPresenceGame = () => currentGame;

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
    // Push last_seen_at into the past so others see offline immediately.
    const past = new Date(Date.now() - OFFLINE_AFTER_MS - 1000).toISOString();
    await supabase
      .from(TABLE)
      .upsert(
        { user_id: uid, last_seen_at: past, last_active_at: past, game: null },
        { onConflict: "user_id" },
      );
  }
};

// ---------- React hooks ----------
export const usePresenceStatus = (userId: string | null | undefined): PresenceStatus => {
  useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  useEffect(() => {
    if (userId) void fetchMissing([userId]);
  }, [userId]);
  return userId ? getPresenceStatus(userId) : "offline";
};

export const usePresenceInfo = (userId: string | null | undefined): PresenceInfo => {
  useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  useEffect(() => {
    if (userId) void fetchMissing([userId]);
  }, [userId]);
  return userId ? getPresenceInfo(userId) : { status: "offline", game: null };
};

export const usePresenceMap = (userIds: string[]): Map<string, PresenceInfo> => {
  useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  const key = userIds.join(",");
  useEffect(() => {
    if (userIds.length) void fetchMissing(userIds);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  const m = new Map<string, PresenceInfo>();
  for (const id of userIds) m.set(id, getPresenceInfo(id));
  return m;
};
