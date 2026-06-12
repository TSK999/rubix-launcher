import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useRubixAuth } from "@/hooks/useRubixAuth";
import {
  fetchPlaytime,
  PLAYTIME_UPDATED_EVENT,
  type GamePlaytime,
} from "@/lib/passport";

/**
 * Returns a map of game_key -> GamePlaytime for the current user.
 * Refreshes on the rubix:playtime-updated window event.
 */
export const useGamePlaytimes = () => {
  const { user } = useRubixAuth();
  const [map, setMap] = useState<Map<string, GamePlaytime>>(new Map());

  useEffect(() => {
    if (!user) {
      setMap(new Map());
      return;
    }
    let cancelled = false;
    const load = async () => {
      const rows = await fetchPlaytime(user.id);
      if (cancelled) return;
      setMap(new Map(rows.map((r) => [r.game_key, r])));
    };
    void load();

    const onUpdate = () => void load();
    window.addEventListener(PLAYTIME_UPDATED_EVENT, onUpdate);

    const channel = supabase
      .channel(`playtime:${user.id}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "user_game_playtime",
          filter: `user_id=eq.${user.id}`,
        },
        () => void load(),
      )
      .subscribe();

    return () => {
      cancelled = true;
      window.removeEventListener(PLAYTIME_UPDATED_EVENT, onUpdate);
      void supabase.removeChannel(channel);
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
