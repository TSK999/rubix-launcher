import { useSyncExternalStore } from "react";
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
let transition: Promise<void> = Promise.resolve();
let snapshotVersion = 0;
let snapshot = { version: snapshotVersion, state: stateCache };
let listenerTick: number | null = null;

const emit = () => {
  snapshotVersion += 1;
  snapshot = { version: snapshotVersion, state: stateCache };
  listeners.forEach((l) => l());
};

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  if (listenerTick == null && typeof window !== "undefined") {
    listenerTick = window.setInterval(emit, 1_000);
  }
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0 && listenerTick != null) {
      window.clearInterval(listenerTick);
      listenerTick = null;
    }
  };
};

const getSnapshot = () => snapshot;

const refreshState = () => {
  if (!channel) return;
  const raw = channel.presenceState() as Record<string, PresenceMeta[]>;
  const next = new Map<string, PresenceMeta>();
  for (const arr of Object.values(raw)) {
    for (const m of arr) {
      const prev = next.get(m.user_id);
      if (!prev) {
        next.set(m.user_id, m);
        continue;
      }
      next.set(m.user_id, {
        user_id: m.user_id,
        last_active: Math.max(prev.last_active, m.last_active),
        updated_at: Math.max(prev.updated_at ?? prev.last_active, m.updated_at ?? m.last_active),
        game: m.game ?? prev.game ?? null,
      });
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
  refreshState();
};

const enqueueTransition = (work: () => Promise<void>) => {
  const next = transition.then(work, work);
  transition = next.catch((error) => {
    console.error("Presence transition failed", error);
  });
  return transition;
};

const teardownActiveChannel = async () => {
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
  stateCache = new Map();
  emit();
};

/**
 * Force a presence re-sync: re-broadcast our own state and re-read the
 * channel's current state. Use on route mounts or visibility changes
 * to make sure freshly-mounted views see up-to-date statuses immediately.
 */
export const resyncPresence = () => {
  lastActive = Date.now();
  void updateTrack();
  refreshState();
};

export const setPresenceGame = (game: string | null) => {
  if (currentGame === game) return;
  currentGame = game;
  void updateTrack();
};

export const getPresenceGame = () => currentGame;

export const startPresence = (userId: string) => {
  const version = ++sessionVersion;
  return enqueueTransition(async () => {
    if (version !== sessionVersion) return;
    if (trackedUserId === userId && channel) {
      lastActive = Date.now();
      await updateTrack();
      return;
    }

    await teardownActiveChannel();
    if (version !== sessionVersion) return;

    trackedUserId = userId;
    lastActive = Date.now();
    currentGame = null;
    const nextChannel = supabase.channel(CHANNEL_NAME, {
      config: { presence: { key: userId } },
    });
    channel = nextChannel;
    nextChannel
      .on("presence", { event: "sync" }, refreshState)
      .on("presence", { event: "join" }, refreshState)
      .on("presence", { event: "leave" }, refreshState)
      .subscribe(async (status) => {
        if (status === "SUBSCRIBED" && channel === nextChannel && trackedUserId === userId) {
          await updateTrack();
        }
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
    }, 10_000);

    cleanup = () => {
      window.removeEventListener("mousemove", onActivity);
      window.removeEventListener("keydown", onActivity);
      window.removeEventListener("focus", onActivity);
      document.removeEventListener("visibilitychange", onVisibility);
      window.clearInterval(heartbeat);
    };
  });
};

let cleanup: (() => void) | null = null;

export const stopPresence = async () => {
  const version = ++sessionVersion;
  await enqueueTransition(async () => {
    if (version !== sessionVersion) return;
    await teardownActiveChannel();
    if (version !== sessionVersion) return;
    trackedUserId = null;
    currentGame = null;
  });
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
  useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  useEffect(() => {
    const tick = window.setInterval(emit, 1_000);
    return () => {
      window.clearInterval(tick);
    };
  }, []);
  return userId ? getPresenceStatus(userId) : "offline";
};

export const usePresenceMap = (
  userIds: string[],
): Map<string, PresenceInfo> => {
  const key = userIds.join(",");
  useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  useEffect(() => {
    const tick = window.setInterval(emit, 1_000);
    return () => {
      window.clearInterval(tick);
    };
  }, []);

  const m = new Map<string, PresenceInfo>();
  for (const id of userIds) m.set(id, getPresenceInfo(id));
  void key;
  return m;
};

export const usePresenceInfo = (userId: string | null | undefined): PresenceInfo => {
  useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  useEffect(() => {
    const tick = window.setInterval(emit, 1_000);
    return () => {
      window.clearInterval(tick);
    };
  }, []);
  return userId ? getPresenceInfo(userId) : { status: "offline", game: null };
};

/*
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
    const tick = window.setInterval(update, 5_000);
    return () => {
      listeners.delete(update);
      window.clearInterval(tick);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return map;
};*/
