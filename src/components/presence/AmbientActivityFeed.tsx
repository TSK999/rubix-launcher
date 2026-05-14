import { useEffect, useState } from "react";
import { Gamepad2, Mic, Search, Sparkles } from "lucide-react";
import { ChevronDown } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";

type FeedItem = {
  id: string;
  kind: "game" | "vc" | "looking";
  user_id: string;
  username: string;
  detail: string;
  at: number;
};

type ProfileLite = { user_id: string; username: string; display_name: string | null };

const MAX = 6;
const TTL_MS = 60_000;

type Props = {
  friendIds: string[];
  profiles: Record<string, ProfileLite>;
};

/**
 * Tiny passive feed of presence transitions across the user's friends.
 * No likes, no scroll, no persistence. Items auto-fade after TTL.
 */
export const AmbientActivityFeed = ({ friendIds, profiles }: Props) => {
  const [items, setItems] = useState<FeedItem[]>([]);
  const [open, setOpen] = useState(true);

  useEffect(() => {
    if (friendIds.length === 0) return;

    // Track previous values to detect transitions
    const prev = new Map<
      string,
      { game: string | null; vc: boolean; manual: string | null }
    >();

    const channel = supabase
      .channel(`ambient-feed-${friendIds.length}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "user_presence" },
        (payload) => {
          const row = (payload.new ?? payload.old) as Record<string, unknown> | undefined;
          if (!row) return;
          const uid = row.user_id as string;
          if (!friendIds.includes(uid)) return;
          const profile = profiles[uid];
          if (!profile) return;

          const game = (row.game as string | null) ?? null;
          const vc = !!row.vc_call_id;
          const manual = (row.manual_status as string | null) ?? null;

          const prevState = prev.get(uid);
          prev.set(uid, { game, vc, manual });
          if (!prevState) return; // first sighting, don't surface

          const username = profile.display_name ?? profile.username;
          const events: Omit<FeedItem, "id" | "at">[] = [];

          if (game && game !== prevState.game) {
            events.push({
              kind: "game",
              user_id: uid,
              username,
              detail: `started playing ${game}`,
            });
          }
          if (vc && !prevState.vc) {
            events.push({ kind: "vc", user_id: uid, username, detail: "joined voice chat" });
          }
          if (manual === "looking_to_play" && prevState.manual !== "looking_to_play") {
            events.push({
              kind: "looking",
              user_id: uid,
              username,
              detail: "is looking to play",
            });
          }

          if (events.length === 0) return;
          setItems((cur) => {
            const at = Date.now();
            const next: FeedItem[] = [
              ...events.map((e) => ({ ...e, id: `${uid}-${at}-${e.kind}`, at })),
              ...cur,
            ];
            return next.slice(0, MAX);
          });
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [friendIds, profiles]);

  // Garbage-collect old items
  useEffect(() => {
    if (items.length === 0) return;
    const t = window.setInterval(() => {
      const cutoff = Date.now() - TTL_MS * 5;
      setItems((cur) => cur.filter((i) => i.at > cutoff));
    }, 30_000);
    return () => window.clearInterval(t);
  }, [items.length]);

  if (friendIds.length === 0) return null;

  return (
    <div className="border-t border-border">
      <Collapsible open={open} onOpenChange={setOpen}>
        <div className="flex items-center justify-between px-4 py-2">
          <CollapsibleTrigger className="flex items-center gap-2 text-[11px] uppercase tracking-wider text-muted-foreground font-medium hover:text-foreground transition-colors">
            <Sparkles className="h-3.5 w-3.5" />
            <span>Activity</span>
            <ChevronDown
              className={cn("h-3 w-3 transition-transform", open && "rotate-180")}
            />
          </CollapsibleTrigger>
        </div>
        <CollapsibleContent>
          <div className="px-3 pb-3 space-y-1">
            {items.length === 0 ? (
              <p className="px-2 py-2 text-[10px] text-muted-foreground/70">
                Quiet right now.
              </p>
            ) : (
              items.map((item) => (
                <div
                  key={item.id}
                  className="presence-feed-in flex items-center gap-2 px-2 py-1.5 rounded-lg text-[11px] text-muted-foreground"
                >
                  <Icon kind={item.kind} />
                  <span className="truncate">
                    <span className="text-foreground/90 font-medium">{item.username}</span>{" "}
                    {item.detail}
                  </span>
                </div>
              ))
            )}
          </div>
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
};

const Icon = ({ kind }: { kind: FeedItem["kind"] }) => {
  if (kind === "game") return <Gamepad2 className="h-3 w-3 text-emerald-400 shrink-0" />;
  if (kind === "vc") return <Mic className="h-3 w-3 text-sky-400 shrink-0" />;
  return <Search className="h-3 w-3 text-sky-400 shrink-0" />;
};
