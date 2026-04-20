import { useEffect, useState } from "react";
import { ChevronDown, Loader2, RefreshCw, Users, Gamepad2 } from "lucide-react";
import { toast } from "sonner";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";
import { fetchSteamFriends, type FriendStatus, type SteamFriend } from "@/lib/steam-friends";
import { fetchRubixSteamIds } from "@/lib/rubix-friends";
import rubixIcon from "@/assets/rubix-friends-icon.png";

type Props = {
  steamId: string | null;
};

const STATUS_META: Record<FriendStatus, { label: string; dot: string; order: number }> = {
  "in-game": { label: "In game", dot: "bg-emerald-400", order: 0 },
  online: { label: "Online", dot: "bg-sky-400", order: 1 },
  away: { label: "Away", dot: "bg-amber-400", order: 2 },
  offline: { label: "Offline", dot: "bg-muted-foreground/40", order: 3 },
};

export const SteamFriendsPanel = ({ steamId }: Props) => {
  const [open, setOpen] = useState(true);
  const [loading, setLoading] = useState(false);
  const [friends, setFriends] = useState<SteamFriend[]>([]);
  const [rubixIds, setRubixIds] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    if (!steamId) return;
    setLoading(true);
    setError(null);
    try {
      const list = await fetchSteamFriends(steamId);
      setFriends(list);
      // Cross-reference Rubix accounts (silent on failure)
      try {
        const ids = await fetchRubixSteamIds(list.map((f) => f.steamId));
        setRubixIds(ids);
      } catch {
        setRubixIds(new Set());
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Failed to load friends";
      setError(msg);
      toast.error("Couldn't load friends", { description: msg });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!steamId) return;
    load();
    // Auto-refresh every 90s
    const id = window.setInterval(load, 90_000);
    return () => window.clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [steamId]);

  if (!steamId) return null;

  const grouped = (["in-game", "online", "away", "offline"] as FriendStatus[]).map(
    (status) => ({
      status,
      list: friends.filter((f) => f.status === status),
    }),
  );

  const onlineCount = friends.filter((f) => f.status !== "offline").length;

  return (
    <div className="p-3 border-t border-border">
      <Collapsible open={open} onOpenChange={setOpen}>
        <div className="flex items-center justify-between px-3 pt-2 pb-1">
          <CollapsibleTrigger className="flex items-center gap-2 text-[11px] uppercase tracking-wider text-muted-foreground font-medium hover:text-foreground transition-colors">
            <Users className="h-3 w-3" />
            <span>Friends</span>
            <span className="text-foreground/70">{onlineCount}</span>
            <ChevronDown
              className={cn(
                "h-3 w-3 transition-transform",
                open ? "rotate-0" : "-rotate-90",
              )}
            />
          </CollapsibleTrigger>
          <button
            onClick={load}
            disabled={loading}
            className="text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
            title="Refresh friends"
          >
            {loading ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <RefreshCw className="h-3 w-3" />
            )}
          </button>
        </div>

        <CollapsibleContent>
          {error ? (
            <p className="px-3 py-2 text-xs text-muted-foreground">
              {error}
            </p>
          ) : friends.length === 0 && !loading ? (
            <p className="px-3 py-2 text-xs text-muted-foreground">
              No friends found.
            </p>
          ) : (
            <div className="max-h-[40vh] overflow-y-auto space-y-3 pr-1">
              {grouped.map(({ status, list }) => {
                if (list.length === 0) return null;
                const meta = STATUS_META[status];
                return (
                  <div key={status}>
                    <div className="flex items-center gap-2 px-3 pt-1 pb-1">
                      <span className={cn("h-1.5 w-1.5 rounded-full", meta.dot)} />
                      <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">
                        {meta.label}
                      </span>
                      <span className="text-[10px] text-muted-foreground/70">
                        {list.length}
                      </span>
                    </div>
                    <ul className="space-y-0.5">
                      {list.map((f) => (
                        <li key={f.steamId}>
                          <a
                            href={f.profileUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="flex items-center gap-2 px-3 py-1.5 rounded-lg hover:bg-secondary/50 transition-colors group"
                            title={
                              f.gameName
                                ? `${f.personaName} — ${f.gameName}`
                                : f.personaName
                            }
                          >
                            <div className="relative shrink-0">
                              {f.avatar ? (
                                <img
                                  src={f.avatar}
                                  alt=""
                                  className={cn(
                                    "h-7 w-7 rounded-md object-cover",
                                    status === "offline" && "opacity-50 grayscale",
                                  )}
                                  loading="lazy"
                                />
                              ) : (
                                <div className="h-7 w-7 rounded-md bg-secondary" />
                              )}
                              <span
                                className={cn(
                                  "absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-card",
                                  meta.dot,
                                )}
                              />
                            </div>
                            <div className="flex-1 min-w-0">
                              <div
                                className={cn(
                                  "text-xs font-medium truncate flex items-center gap-1.5",
                                  status === "offline"
                                    ? "text-muted-foreground"
                                    : "text-foreground",
                                )}
                              >
                                <span className="truncate">{f.personaName}</span>
                                {rubixIds.has(f.steamId) && (
                                  <img
                                    src={rubixIcon}
                                    alt="Rubix user"
                                    title="Has a Rubix account"
                                    className="h-3.5 w-3.5 shrink-0"
                                  />
                                )}
                              </div>
                              {f.gameName && (
                                <div className="text-[10px] text-emerald-400/90 truncate flex items-center gap-1">
                                  <Gamepad2 className="h-2.5 w-2.5" />
                                  {f.gameName}
                                </div>
                              )}
                            </div>
                          </a>
                        </li>
                      ))}
                    </ul>
                  </div>
                );
              })}
            </div>
          )}
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
};
