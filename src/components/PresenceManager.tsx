import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { startPresence, stopPresence } from "@/lib/presence";

/** Mount once at app root to broadcast the current user's presence. */
export const PresenceManager = () => {
  useEffect(() => {
    let activeId: string | null = null;
    const apply = (uid: string | null) => {
      if (uid === activeId) return;
      activeId = uid;
      if (uid) startPresence(uid);
      else void stopPresence();
    };
    supabase.auth.getSession().then(({ data }) => apply(data.session?.user?.id ?? null));
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => {
      apply(s?.user?.id ?? null);
    });
    return () => {
      sub.subscription.unsubscribe();
      void stopPresence();
    };
  }, []);
  return null;
};
