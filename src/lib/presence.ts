import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export type PresenceStatus = "online" | "away" | "offline";

const CHANNEL_NAME = "call-rubix-presence";
const AWAY_AFTER_MS = 5 * 60 * 1000; // 5 min idle => away
const OFFLINE_AFTER_MS = 90 * 1000; // missed heartbeats => offline

type PresenceMeta = {
  user_id: string;
  last_active: number;
  updated_at: number;
  game?: string | null;
};

export type PresenceInfo = { status: PresenceStatus; game: string | null };

let channel: ReturnType<typeof supabase.channel> | null = null;
let trackedUserId: string | null = null;
let lastActive = Date.now();
let currentGame: string | null = null;
let sessionVersion = 0;
const listeners = new Set<() => void>();
let stateCache: Map<string, PresenceMeta> = new Map();

const emit = () => listeners.forEach((l) => l());

const refreshState = () => {
  if (!channel) return;
  const raw = channel.presenceState() as Record<string, PresenceMeta[]>;
  const next = new Map<string, PresenceMeta>();
  for (const arr of Object.values(raw)) {
    for (const m of arr) {
      const prev = next.get(m.user_id);
      if (!prev || m.last_active > prev.last_active) next.set(m.user_id, m);
    }
  }
  stateCache = next;
  emit();
};

const updateTrack = async () => {
  if (!channel || !trackedUserId) return;
  await channel.track({
    user_id: trackedUserId,
    last_active: lastActive,
    updated_at: Date.now(),
    game: currentGame,
  });
};

export const setPresenceGame = (game: string | null) => {
  if (currentGame === game) return;
  currentGame = game;
  void updateTrack();
};

export const startPresence = (userId: string) => {
  if (trackedUserId === userId && channel) return;
  void stopPresence();
  sessionVersion += 1;
  trackedUserId = userId;
  lastActive = Date.now();
  currentGame = null;
  channel = supabase.channel(CHANNEL_NAME, {
    config: { presence: { key: userId } },
  });
  channel
    .on("presence", { event: "sync" }, refreshState)
    .on("presence", { event: "join" }, refreshState)
    .on("presence", { event: "leave" }, refreshState)
    .subscribe(async (status) => {
      if (status === "SUBSCRIBED") await updateTrack();
    });

  const onActivity = () => {
    lastActive = Date.now();
    void updateTrack();
  };
  const onVisibility = () => {
    if (document.visibilityState === "visible") onActivity();
  };
  window.addEventListener("mousemove", onActivity, { passive: true });
  window.addEventListener("keydown", onActivity);
  window.addEventListener("focus", onActivity);
  document.addEventListener("visibilitychange", onVisibility);
  const heartbeat = window.setInterval(() => {
    // Re-broadcast a fresh heartbeat while preserving true idle time.
    void updateTrack();
    emit();
  }, 20_000);

  cleanup = () => {
    window.removeEventListener("mousemove", onActivity);
    window.removeEventListener("keydown", onActivity);
    window.removeEventListener("focus", onActivity);
    document.removeEventListener("visibilitychange", onVisibility);
    window.clearInterval(heartbeat);
  };
};

let cleanup: (() => void) | null = null;

export const stopPresence = async () => {
  const version = sessionVersion;
  const oldChannel = channel;
  channel = null;
  if (cleanup) {
    cleanup();
    cleanup = null;
  }
  if (oldChannel) {
    try {
      await oldChannel.untrack();
    } catch {
      /* ignore */
    }
    await supabase.removeChannel(oldChannel);
  }
  if (version !== sessionVersion) return;
  trackedUserId = null;
  stateCache = new Map();
  emit();
};

export const getPresenceStatus = (userId: string): PresenceStatus => {
  const meta = stateCache.get(userId);
  if (!meta) return "offline";
  const staleMs = Date.now() - (meta.updated_at ?? meta.last_active);
  if (staleMs > OFFLINE_AFTER_MS) return "offline";
  const idleMs = Date.now() - meta.last_active;
  if (idleMs > AWAY_AFTER_MS) return "away";
  return "online";
};

export const getPresenceInfo = (userId: string): PresenceInfo => {
  const meta = stateCache.get(userId);
  if (!meta) return { status: "offline", game: null };
  const staleMs = Date.now() - (meta.updated_at ?? meta.last_active);
  if (staleMs > OFFLINE_AFTER_MS) return { status: "offline", game: null };
  const idleMs = Date.now() - meta.last_active;
  const status: PresenceStatus = idleMs > AWAY_AFTER_MS ? "away" : "online";
  return { status, game: meta.game ?? null };
};

export const usePresenceStatus = (userId: string | null | undefined): PresenceStatus => {
  const [status, setStatus] = useState<PresenceStatus>(() =>
    userId ? getPresenceStatus(userId) : "offline",
  );
  useEffect(() => {
    if (!userId) {
      setStatus("offline");
      return;
    }
    const update = () => setStatus(getPresenceStatus(userId));
    update();
    listeners.add(update);
    const tick = window.setInterval(update, 30_000);
    return () => {
      listeners.delete(update);
      window.clearInterval(tick);
    };
  }, [userId]);
  return status;
};

export const usePresenceMap = (
  userIds: string[],
): Map<string, PresenceInfo> => {
  const key = userIds.join(",");
  const compute = () => {
    const m = new Map<string, PresenceInfo>();
    for (const id of userIds) m.set(id, getPresenceInfo(id));
    return m;
  };
  const [map, setMap] = useState<Map<string, PresenceInfo>>(compute);
  useEffect(() => {
    const update = () => setMap(compute());
    update();
    listeners.add(update);
    const tick = window.setInterval(update, 30_000);
    return () => {
      listeners.delete(update);
      window.clearInterval(tick);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return map;
};
