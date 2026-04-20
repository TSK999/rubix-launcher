import { useEffect, useState } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

export type RubixProfile = {
  id: string;
  user_id: string;
  username: string;
  display_name: string | null;
  avatar_url: string | null;
  steam_id: string | null;
};

export const useRubixAuth = () => {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<RubixProfile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Subscribe FIRST to avoid missing events
    const { data: sub } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession);
      setUser(newSession?.user ?? null);
      if (!newSession?.user) {
        setProfile(null);
        return;
      }
      // Defer profile fetch to avoid deadlocks inside the callback
      setTimeout(() => {
        void fetchProfile(newSession.user.id);
      }, 0);
    });

    // Then load existing session
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setUser(data.session?.user ?? null);
      if (data.session?.user) {
        void fetchProfile(data.session.user.id);
      }
      setLoading(false);
    });

    return () => sub.subscription.unsubscribe();
  }, []);

  const fetchProfile = async (userId: string) => {
    const { data, error } = await supabase
      .from("profiles")
      .select("id, user_id, username, display_name, avatar_url, steam_id")
      .eq("user_id", userId)
      .maybeSingle();
    if (!error && data) setProfile(data as RubixProfile);
  };

  const refreshProfile = async () => {
    if (user) await fetchProfile(user.id);
  };

  return { session, user, profile, loading, refreshProfile };
};
