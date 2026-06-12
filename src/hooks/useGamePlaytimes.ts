import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useRubixAuth } from "@/hooks/useRubixAuth";
import {
  fetchPlaytime,
  PLAYTIME_UPDATED_EVENT,
  type GamePlaytime,
} from "@/lib/passport";

type Store = {
  userId: string;
  map: Map<string, GamePlaytime>;
  listeners: Set<(m: Map<string, GamePlaytime>) => void>;
  channel: ReturnType<typeof supabase.channel> | null;
  onUpdate: () => void;
};

let store: Store | null = null;

const loadInto = async (s: Store) => {
  const rows = await fetchPlaytime(s.userId);
  s.map = new Map(rows.map((r) => [r.game_key, r]));
  s.listeners.forEach((cb) => cb(s.map));
};

const ensureStore = (userId: string): Store => {
  if (store && store.userId === userId) return store;
  if (store) teardownStore();
  const s: Store = {
    userId,
    map: new Map(),
    listeners: new Set(),
    channel: null,
    onUpdate: () => void loadInto(s),
  };
  s.channel = supabase
    .channel(`playtime:${userId}`)
    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "user_game_playtime",
        filter: `user_id=eq.${userId}`,
      },
      () => void loadInto(s),
    )
    .subscribe();
  window.addEventListener(PLAYTIME_UPDATED_EVENT, s.onUpdate);
  store = s;
  void loadInto(s);
  return s;
};

const teardownStore = () => {
  if (!store) return;
  window.removeEventListener(PLAYTIME_UPDATED_EVENT, store.onUpdate);
  if (store.channel) void supabase.removeChannel(store.channel);
  store = null;
};

export const useGamePlaytimes = () => {
  const { user } = useRubixAuth();
  const [map, setMap] = useState<Map<string, GamePlaytime>>(new Map());

  useEffect(() => {
    if (!user) {
      setMap(new Map());
      return;
    }
    const s = ensureStore(user.id);
    setMap(s.map);
    const cb = (m: Map<string, GamePlaytime>) => setMap(new Map(m));
    s.listeners.add(cb);
    return () => {
      s.listeners.delete(cb);
      if (s.listeners.size === 0 && store === s) teardownStore();
    };
  }, [user]);

  return map;
};

export const formatPlaytime = (totalSeconds: number): string => {
  if (totalSeconds < 60) return "<1m";
  const hours = Math.floor(totalSeconds / 3600);
  const mins = Math.floor((totalSeconds % 3600) / 60);
  if (hours === 0) return `${mins}m`;
  if (hours < 10) return `${hours}h ${mins}m`;
  return `${hours}h`;
};
