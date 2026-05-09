import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { startPresence, stopPresence, setPresenceGame } from "@/lib/presence";
import { fetchSteamProfile } from "@/lib/steam-profile";

/** Mount once at app root to broadcast the current user's presence. */
export const PresenceManager = () => {
  useEffect(() => {
    let activeId: string | null = null;
    let gameTimer: number | null = null;
    let cancelled = false;

    const stopGameLoop = () => {
      if (gameTimer != null) {
        window.clearInterval(gameTimer);
        gameTimer = null;
      }
      setPresenceGame(null);
    };

    const startGameLoop = async (uid: string) => {
      stopGameLoop();
      const { data } = await supabase
        .from("profiles")
        .select("steam_id")
        .eq("user_id", uid)
        .maybeSingle();
      const steamId = data?.steam_id;
      if (!steamId || cancelled) return;
      const poll = async () => {
        try {
          const r = await fetchSteamProfile(steamId);
          setPresenceGame(r.profile.gameName ?? null);
        } catch {
          /* ignore */
        }
      };
      void poll();
      gameTimer = window.setInterval(poll, 90_000);
    };

    const apply = (uid: string | null) => {
      if (uid === activeId) return;
      activeId = uid;
      if (uid) {
        startPresence(uid);
        void startGameLoop(uid);
      } else {
        stopGameLoop();
        void stopPresence();
      }
    };

    supabase.auth.getSession().then(({ data }) => apply(data.session?.user?.id ?? null));
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => {
      apply(s?.user?.id ?? null);
    });
    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
      stopGameLoop();
      void stopPresence();
    };
  }, []);
  return null;
};
