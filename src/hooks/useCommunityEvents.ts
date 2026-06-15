import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export type RsvpStatus = "going" | "maybe" | "declined";

export type CommunityEvent = {
  id: string;
  community_id: string;
  creator_id: string;
  title: string;
  description: string | null;
  game_title: string | null;
  game_cover: string | null;
  starts_at: string;
  ends_at: string | null;
  channel_id: string | null;
  max_attendees: number | null;
  created_at: string;
};

export type EventRsvp = {
  event_id: string;
  user_id: string;
  status: RsvpStatus;
};

export type EventWithRsvps = CommunityEvent & {
  rsvps: EventRsvp[];
  goingCount: number;
  myStatus: RsvpStatus | null;
};

export const useCommunityEvents = (communityId: string | null, meId: string | null) => {
  const [events, setEvents] = useState<EventWithRsvps[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!communityId) {
      setEvents([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const cutoff = new Date(Date.now() - 3600 * 1000).toISOString(); // include events that just started
    const { data: rows, error } = await supabase
      .from("community_events")
      .select("*")
      .eq("community_id", communityId)
      .gte("starts_at", cutoff)
      .order("starts_at", { ascending: true });

    if (error || !rows) {
      setEvents([]);
      setLoading(false);
      return;
    }

    if (rows.length === 0) {
      setEvents([]);
      setLoading(false);
      return;
    }

    const ids = rows.map((r) => r.id);
    const { data: rsvps } = await supabase
      .from("community_event_rsvps")
      .select("event_id, user_id, status")
      .in("event_id", ids);

    const rsvpList = (rsvps ?? []) as EventRsvp[];

    setEvents(
      rows.map((r) => {
        const my = meId ? rsvpList.find((x) => x.event_id === r.id && x.user_id === meId) : null;
        const eventRsvps = rsvpList.filter((x) => x.event_id === r.id);
        return {
          ...(r as CommunityEvent),
          rsvps: eventRsvps,
          goingCount: eventRsvps.filter((x) => x.status === "going").length,
          myStatus: (my?.status as RsvpStatus | undefined) ?? null,
        };
      })
    );
    setLoading(false);
  }, [communityId, meId]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!communityId) return;
    const channel = supabase
      .channel(`events:${communityId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "community_events", filter: `community_id=eq.${communityId}` },
        () => void load()
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "community_event_rsvps" },
        () => void load()
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [communityId, load]);

  return { events, loading, reload: load };
};
