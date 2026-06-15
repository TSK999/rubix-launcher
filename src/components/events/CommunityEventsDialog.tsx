import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Calendar, Plus, Trash2, Users, Volume2, Clock } from "lucide-react";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useCommunityEvents, type EventWithRsvps, type RsvpStatus } from "@/hooks/useCommunityEvents";
import { CreateEventDialog } from "./CreateEventDialog";

type Props = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  communityId: string;
  meId: string;
  isAdmin: boolean;
};

const formatStart = (iso: string) => {
  const d = new Date(iso);
  const now = Date.now();
  const diff = d.getTime() - now;
  const opts: Intl.DateTimeFormatOptions = { weekday: "short", hour: "numeric", minute: "2-digit" };
  if (Math.abs(diff) < 24 * 3600 * 1000) {
    return d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  }
  if (diff < 7 * 24 * 3600 * 1000) return d.toLocaleString([], opts);
  return d.toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
};

const countdown = (iso: string) => {
  const diff = new Date(iso).getTime() - Date.now();
  if (diff <= 0) return "Live now";
  const mins = Math.round(diff / 60000);
  if (mins < 60) return `in ${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `in ${hrs}h ${mins % 60}m`;
  const days = Math.floor(hrs / 24);
  return `in ${days}d ${hrs % 24}h`;
};

export const CommunityEventsDialog = ({ open, onOpenChange, communityId, meId, isAdmin }: Props) => {
  const [createOpen, setCreateOpen] = useState(false);
  const { events, loading } = useCommunityEvents(open ? communityId : null, meId);

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Calendar className="h-4 w-4" />
              Community events
            </DialogTitle>
            <DialogDescription>Scheduled play sessions for this community.</DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            {isAdmin && (
              <Button
                onClick={() => setCreateOpen(true)}
                className="w-full"
                size="sm"
              >
                <Plus className="h-4 w-4 mr-1" />
                New event
              </Button>
            )}

            {loading ? (
              <p className="text-xs text-muted-foreground text-center py-6">Loading…</p>
            ) : events.length === 0 ? (
              <div className="text-center py-8 space-y-2">
                <Calendar className="h-8 w-8 text-muted-foreground/40 mx-auto" />
                <p className="text-xs text-muted-foreground">
                  No upcoming events.{isAdmin ? " Schedule one above." : ""}
                </p>
              </div>
            ) : (
              <ul className="space-y-2 max-h-[60vh] overflow-y-auto">
                {events.map((ev) => (
                  <EventCard key={ev.id} event={ev} meId={meId} canManage={isAdmin || ev.creator_id === meId} />
                ))}
              </ul>
            )}
          </div>
        </DialogContent>
      </Dialog>

      <CreateEventDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        communityId={communityId}
        creatorId={meId}
      />
    </>
  );
};

const EventCard = ({
  event,
  meId,
  canManage,
}: {
  event: EventWithRsvps;
  meId: string;
  canManage: boolean;
}) => {
  const [busy, setBusy] = useState(false);
  const full = event.max_attendees != null && event.goingCount >= event.max_attendees && event.myStatus !== "going";

  const setRsvp = async (status: RsvpStatus) => {
    if (full && status === "going") return;
    setBusy(true);
    const { error } = await supabase
      .from("community_event_rsvps")
      .upsert(
        { event_id: event.id, user_id: meId, status },
        { onConflict: "event_id,user_id" }
      );
    setBusy(false);
    if (error) toast.error("Couldn't RSVP", { description: error.message });
  };

  const remove = async () => {
    if (!confirm(`Delete "${event.title}"?`)) return;
    setBusy(true);
    const { error } = await supabase.from("community_events").delete().eq("id", event.id);
    setBusy(false);
    if (error) toast.error("Couldn't delete");
    else toast("Event deleted");
  };

  return (
    <li className="rounded-xl border border-border/60 bg-card/50 p-3 space-y-2 hover:border-border transition-colors">
      <div className="flex gap-3">
        {event.game_cover ? (
          <img src={event.game_cover} alt="" className="h-14 w-14 rounded-lg object-cover shrink-0" />
        ) : (
          <div className="h-14 w-14 rounded-lg bg-secondary grid place-items-center shrink-0">
            <Calendar className="h-5 w-5 text-muted-foreground" />
          </div>
        )}
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <p className="text-sm font-semibold truncate">{event.title}</p>
            {canManage && (
              <button
                onClick={remove}
                disabled={busy}
                className="text-muted-foreground hover:text-destructive transition-colors shrink-0"
                title="Delete event"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
          {event.game_title && (
            <p className="text-[11px] text-muted-foreground truncate">{event.game_title}</p>
          )}
          <div className="flex items-center gap-2 mt-1 text-[11px] text-muted-foreground flex-wrap">
            <span className="flex items-center gap-1">
              <Clock className="h-3 w-3" />
              {formatStart(event.starts_at)}
            </span>
            <span className="text-primary font-medium">{countdown(event.starts_at)}</span>
            {event.channel_id && (
              <span className="flex items-center gap-1">
                <Volume2 className="h-3 w-3" />
                voice
              </span>
            )}
            <span className="flex items-center gap-1">
              <Users className="h-3 w-3" />
              {event.goingCount}{event.max_attendees ? `/${event.max_attendees}` : ""} going
            </span>
          </div>
        </div>
      </div>

      {event.description && (
        <p className="text-[11px] text-muted-foreground leading-snug">{event.description}</p>
      )}

      <div className="flex items-center gap-1.5">
        {(["going", "maybe", "declined"] as RsvpStatus[]).map((s) => {
          const active = event.myStatus === s;
          const disabled = busy || (s === "going" && full);
          return (
            <button
              key={s}
              onClick={() => setRsvp(s)}
              disabled={disabled}
              className={cn(
                "flex-1 text-[11px] py-1.5 rounded-md font-medium transition-colors capitalize",
                active
                  ? s === "going"
                    ? "bg-primary text-primary-foreground"
                    : s === "maybe"
                      ? "bg-secondary text-foreground"
                      : "bg-muted text-muted-foreground"
                  : "bg-secondary/40 text-muted-foreground hover:bg-secondary/70 hover:text-foreground",
                disabled && "opacity-50 cursor-not-allowed"
              )}
            >
              {s === "going" && full && !active ? "Full" : s}
            </button>
          );
        })}
      </div>
    </li>
  );
};
