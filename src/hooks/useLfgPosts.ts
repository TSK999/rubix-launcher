import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";

export type LfgVisibility = "public" | "friends" | "community";
export type LfgMode = "casual" | "ranked" | "event";

export type LfgPost = {
  id: string;
  host_id: string;
  game_title: string;
  game_cover: string | null;
  slots_total: number;
  mode: LfgMode;
  notes: string | null;
  mic_required: boolean;
  visibility: LfgVisibility;
  community_id: string | null;
  expires_at: string;
  created_at: string;
};

export type LfgParticipant = {
  post_id: string;
  user_id: string;
  joined_at: string;
};

export type LfgHostProfile = {
  user_id: string;
  username: string;
  display_name: string | null;
  avatar_url: string | null;
};

export type LfgPostFull = LfgPost & {
  host: LfgHostProfile | null;
  participants: LfgParticipant[];
  participantProfiles: Record<string, LfgHostProfile>;
};

export const useLfgPosts = (currentUserId: string | null) => {
  const [posts, setPosts] = useState<LfgPostFull[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!currentUserId) {
      setPosts([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const nowIso = new Date().toISOString();

    const { data: rawPosts, error } = await supabase
      .from("lfg_posts")
      .select("*")
      .gt("expires_at", nowIso)
      .order("created_at", { ascending: false })
      .limit(50);

    if (error || !rawPosts) {
      setPosts([]);
      setLoading(false);
      return;
    }

    if (rawPosts.length === 0) {
      setPosts([]);
      setLoading(false);
      return;
    }

    const postIds = rawPosts.map((p) => p.id);
    const hostIds = Array.from(new Set(rawPosts.map((p) => p.host_id)));

    const [{ data: parts }, { data: hostProfiles }] = await Promise.all([
      supabase.from("lfg_participants").select("*").in("post_id", postIds),
      supabase
        .from("profiles")
        .select("user_id, username, display_name, avatar_url")
        .in("user_id", hostIds),
    ]);

    const partList = (parts ?? []) as LfgParticipant[];
    const allUserIds = Array.from(
      new Set([...hostIds, ...partList.map((p) => p.user_id)])
    );
    const { data: allProfiles } = await supabase
      .from("profiles")
      .select("user_id, username, display_name, avatar_url")
      .in("user_id", allUserIds);

    const profileMap: Record<string, LfgHostProfile> = {};
    (allProfiles ?? hostProfiles ?? []).forEach((p: any) => {
      profileMap[p.user_id] = p;
    });

    const full: LfgPostFull[] = rawPosts.map((p) => {
      const myParts = partList.filter((x) => x.post_id === p.id);
      const partProfiles: Record<string, LfgHostProfile> = {};
      myParts.forEach((mp) => {
        if (profileMap[mp.user_id]) partProfiles[mp.user_id] = profileMap[mp.user_id];
      });
      return {
        ...(p as LfgPost),
        host: profileMap[p.host_id] ?? null,
        participants: myParts,
        participantProfiles: partProfiles,
      };
    });

    setPosts(full);
    setLoading(false);
  }, [currentUserId]);

  useEffect(() => {
    void load();
  }, [load]);

  // Realtime: refresh on any change to lfg_posts or lfg_participants
  useEffect(() => {
    if (!currentUserId) return;
    const channel = supabase
      .channel(`lfg:${currentUserId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "lfg_posts" },
        () => void load()
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "lfg_participants" },
        () => void load()
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [currentUserId, load]);

  return { posts, loading, reload: load };
};
