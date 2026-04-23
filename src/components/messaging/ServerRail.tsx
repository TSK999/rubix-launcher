import { Home, Plus, Users } from "lucide-react";
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
    return () => {
      void supabase.removeChannel(ch);
    };
  }, [meId]);

  return (
    <div className="w-[72px] shrink-0 bg-card/40 border-r border-border flex flex-col items-center py-3 gap-2 overflow-y-auto">
      <RailButton
        active={selected.kind === "dms"}
        onClick={() => onSelect({ kind: "dms" })}
        title="Direct messages"
      >
        <Home className="h-5 w-5" />
      </RailButton>
      <div className="w-8 h-px bg-border my-1" />
      {communities.map((c) => {
        const active = selected.kind === "community" && selected.id === c.id;
        return (
          <RailButton
            key={c.id}
            active={active}
            onClick={() => onSelect({ kind: "community", id: c.id })}
            title={c.name}
          >
            {c.icon_url ? (
              <img src={c.icon_url} alt={c.name} className="h-full w-full object-cover" />
            ) : (
              <span className="text-sm font-bold">{c.name.slice(0, 2).toUpperCase()}</span>
            )}
          </RailButton>
        );
      })}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            className="h-12 w-12 rounded-2xl bg-secondary/60 hover:bg-primary hover:text-primary-foreground transition-all grid place-items-center"
            title="Add a community"
          >
            <Plus className="h-5 w-5" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent side="right" align="start">
          <DropdownMenuItem onClick={onCreate}>
            <Users className="h-4 w-4 mr-2" /> Create a community
          </DropdownMenuItem>
          <DropdownMenuItem onClick={onJoin}>
            <Plus className="h-4 w-4 mr-2" /> Join with invite code
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
};

const RailButton = ({
  active,
  onClick,
  title,
  children,
}: {
  active: boolean;
  onClick: () => void;
  title: string;
  children: React.ReactNode;
}) => (
  <div className="relative">
    <span
      className={cn(
        "absolute -left-3 top-1/2 -translate-y-1/2 w-1 rounded-r-full bg-foreground transition-all",
        active ? "h-8" : "h-0",
      )}
    />
    <button
      onClick={onClick}
      title={title}
      className={cn(
        "h-12 w-12 rounded-2xl overflow-hidden grid place-items-center transition-all",
        active
          ? "bg-primary text-primary-foreground rounded-xl"
          : "bg-secondary/60 hover:bg-primary hover:text-primary-foreground hover:rounded-xl",
      )}
    >
      {children}
    </button>
  </div>
);
