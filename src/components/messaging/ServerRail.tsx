import { Inbox, Plus, Users, Compass } from "lucide-react";
import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { listMyCommunities, type Community } from "@/lib/communities";
import { supabase } from "@/integrations/supabase/client";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

type Props = {
  selected: { kind: "dms" } | { kind: "community"; id: string };
  onSelect: (s: Props["selected"]) => void;
  onCreate: () => void;
  onJoin: () => void;
  meId: string;
};

/**
 * Horizontal community switcher bar — distinctly Rubix:
 * - Sits across the top of the messaging area
 * - Uses the brand purple gradient + glow for the active pill
 * - Pill-shaped DM tab with label, circular community badges
 */
export const ServerRail = ({ selected, onSelect, onCreate, onJoin, meId }: Props) => {
  const [communities, setCommunities] = useState<Community[]>([]);

  const refresh = async () => setCommunities(await listMyCommunities());

  useEffect(() => {
    void refresh();
    const ch = supabase
      .channel("server-rail")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "community_members", filter: `user_id=eq.${meId}` },
        () => void refresh(),
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "communities" },
        () => void refresh(),
      )
      .subscribe();
    // Also poll occasionally as a safety net (covers realtime publication gaps)
    const interval = window.setInterval(() => void refresh(), 5000);
    return () => {
      void supabase.removeChannel(ch);
      window.clearInterval(interval);
    };
  }, [meId]);

  // Refresh whenever selection changes (so newly created/joined communities appear instantly)
  useEffect(() => {
    void refresh();
  }, [selected.kind === "community" ? selected.id : "dms"]);

  const dmsActive = selected.kind === "dms";

  return (
    <div className="h-14 shrink-0 border-b border-border bg-card/30 backdrop-blur-sm flex items-center gap-2 px-4 overflow-x-auto">
      {/* DMs pill */}
      <button
        onClick={() => onSelect({ kind: "dms" })}
        className={cn(
          "h-9 px-3 rounded-full flex items-center gap-2 text-xs font-semibold transition-all shrink-0",
          dmsActive
            ? "bg-[image:var(--gradient-primary)] text-primary-foreground shadow-[var(--glow-primary)]"
            : "bg-secondary/60 text-muted-foreground hover:text-foreground hover:bg-secondary",
        )}
      >
        <Inbox className="h-3.5 w-3.5" />
        Inbox
      </button>

      <span className="h-6 w-px bg-border shrink-0 mx-1" />

      {/* Community circles */}
      <div className="flex items-center gap-2 min-w-0">
        {communities.length === 0 && (
          <span className="text-[11px] text-muted-foreground px-2 inline-flex items-center gap-1.5 shrink-0">
            <Compass className="h-3 w-3" /> No communities yet
          </span>
        )}
        {communities.map((c) => {
          const active = selected.kind === "community" && selected.id === c.id;
          return (
            <button
              key={c.id}
              onClick={() => onSelect({ kind: "community", id: c.id })}
              title={c.name}
              className={cn(
                "h-9 w-9 rounded-full overflow-hidden grid place-items-center transition-all shrink-0 ring-2",
                active
                  ? "ring-primary shadow-[var(--glow-primary)] scale-105"
                  : "ring-transparent bg-secondary/60 hover:ring-primary/50 hover:scale-105",
              )}
            >
              {c.icon_url ? (
                <img src={c.icon_url} alt={c.name} className="h-full w-full object-cover" />
              ) : (
                <span className="text-[10px] font-bold">{c.name.slice(0, 2).toUpperCase()}</span>
              )}
            </button>
          );
        })}
      </div>

      <div className="ml-auto shrink-0">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              className="h-9 px-3 rounded-full bg-secondary/60 hover:bg-primary/15 hover:text-primary transition-all flex items-center gap-1.5 text-xs font-semibold border border-dashed border-border hover:border-primary/40"
              title="Add a community"
            >
              <Plus className="h-3.5 w-3.5" />
              Community
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent side="bottom" align="end">
            <DropdownMenuItem onClick={onCreate}>
              <Users className="h-4 w-4 mr-2" /> Create a community
            </DropdownMenuItem>
            <DropdownMenuItem onClick={onJoin}>
              <Plus className="h-4 w-4 mr-2" /> Join with invite code
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
};
