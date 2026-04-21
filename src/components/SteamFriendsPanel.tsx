import { useEffect, useState } from "react";
import { ChevronDown, Loader2, RefreshCw, Users, Gamepad2, Music, Play, MessageSquare, User } from "lucide-react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";
import { fetchSteamFriends, type FriendStatus, type SteamFriend } from "@/lib/steam-friends";
import { fetchRubixSteamMap, type RubixSteamMatch } from "@/lib/rubix-friends";
import { fetchNowPlaying, fetchSpotifyLinkedUsers, type SpotifyTrack } from "@/lib/spotify";
import { getOrCreateDm } from "@/lib/messaging";
import { SteamProfileDialog } from "@/components/SteamProfileDialog";
import rubixIcon from "@/assets/rubix-friends-icon.png";
import spotifyIcon from "@/assets/spotify-icon.png";

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
  // steam_id → { user_id, username } (for friends with a Rubix account)
  const [rubixMap, setRubixMap] = useState<Map<string, RubixSteamMatch>>(new Map());
  // rubix user_id → spotify username (for friends with linked Spotify)
  const [spotifyUsers, setSpotifyUsers] = useState<Map<string, string>>(new Map());
  // rubix user_id → currently playing track
  const [tracks, setTracks] = useState<Map<string, SpotifyTrack | null>>(new Map());
  const [error, setError] = useState<string | null>(null);
  const [selectedSteamId, setSelectedSteamId] = useState<string | null>(null);

  const launchFriendGame = async (e: React.MouseEvent, gameId: string, gameName: string) => {
    e.preventDefault();
    e.stopPropagation();
    const target = `steam://rungameid/${gameId}`;
    if (window.rubix?.isElectron) {
      const res = await window.rubix.launchGame(target);
      if (res.ok) {
        toast.success(`Launching ${gameName}`);
      } else {
        toast.error("Couldn't launch", { description: res.error });
      }
    } else {
      window.location.href = target;
    }
  };

  const openDm = async (e: React.MouseEvent, rubixUserId: string) => {
    e.preventDefault();
    e.stopPropagation();
    try {
      const conversationId = await getOrCreateDm(rubixUserId);
      window.dispatchEvent(new CustomEvent("rubix:open-dm", { detail: { conversationId } }));
    } catch (err) {
      toast.error("Couldn't open DM", { description: err instanceof Error ? err.message : "" });
    }
  };

  const load = async () => {
    if (!steamId) return;
    setLoading(true);
    setError(null);
    try {
      const list = await fetchSteamFriends(steamId);
      setFriends(list);

      // Cross-reference Rubix accounts (silent on failure)
      let map = new Map<string, RubixSteamMatch>();
      try {
        map = await fetchRubixSteamMap(list.map((f) => f.steamId));
        setRubixMap(map);
      } catch {
        setRubixMap(new Map());
      }

      // Then check which Rubix friends have linked Spotify
      const userIds = Array.from(map.values()).map((m) => m.user_id);
      try {
        const linked = await fetchSpotifyLinkedUsers(userIds);
        const spotMap = new Map<string, string>();
        for (const [uid, info] of linked) {
          spotMap.set(uid, info.spotify_username ?? info.spotify_id);
        }
        setSpotifyUsers(spotMap);

        // Fetch currently-playing for friends with Spotify
        const trackMap = await fetchNowPlaying(Array.from(linked.keys()));
        setTracks(trackMap);
      } catch {
        setSpotifyUsers(new Map());
        setTracks(new Map());
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
                          <button
                            type="button"
                            onClick={() => setSelectedSteamId(f.steamId)}
                            className="w-full text-left flex items-center gap-2 px-3 py-1.5 rounded-lg hover:bg-secondary/50 transition-colors group"
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
                                {(() => {
                                  const match = rubixMap.get(f.steamId);
                                  if (!match) return null;
                                  return (
                                    <>
                                      <img
                                        src={rubixIcon}
                                        alt="Rubix user"
                                        title="Has a Rubix account"
                                        className="h-3.5 w-3.5 shrink-0"
                                      />
                                      {spotifyUsers.has(match.user_id) && (
                                        <img
                                          src={spotifyIcon}
                                          alt="Spotify"
                                          title={`Spotify · @${spotifyUsers.get(match.user_id)}`}
                                          className="h-3.5 w-3.5 shrink-0"
                                          loading="lazy"
                                        />
                                      )}
                                    </>
                                  );
                                })()}
                              </div>
                              {f.gameName && (
                                <div className="text-[10px] text-emerald-400/90 truncate flex items-center gap-1">
                                  <Gamepad2 className="h-2.5 w-2.5" />
                                  {f.gameName}
                                </div>
                              )}
                              {(() => {
                                const match = rubixMap.get(f.steamId);
                                const track = match ? tracks.get(match.user_id) : null;
                                if (!track || !track.is_playing) return null;
                                return (
                                  <div className="text-[10px] text-emerald-400/80 truncate flex items-center gap-1">
                                    <Music className="h-2.5 w-2.5" />
                                    <span className="truncate">
                                      {track.name} · {track.artists}
                                    </span>
                                  </div>
                                );
                              })()}
                            </div>
                            {(() => {
                              const match = rubixMap.get(f.steamId);
                              if (!match) return null;
                              return (
                                <>
                                  <Link
                                    to={`/u/${match.username}`}
                                    onClick={(e) => e.stopPropagation()}
                                    className="shrink-0 h-6 w-6 rounded-md flex items-center justify-center bg-secondary text-muted-foreground hover:text-foreground hover:bg-secondary/80 transition-colors opacity-0 group-hover:opacity-100 focus:opacity-100"
                                    title={`Open @${match.username}'s profile`}
                                  >
                                    <User className="h-3 w-3" />
                                  </Link>
                                  <span
                                    role="button"
                                    tabIndex={0}
                                    onClick={(e) => openDm(e, match.user_id)}
                                    onKeyDown={(e) => {
                                      if (e.key === "Enter" || e.key === " ") openDm(e as unknown as React.MouseEvent, match.user_id);
                                    }}
                                    className="shrink-0 h-6 w-6 rounded-md flex items-center justify-center bg-primary/10 text-primary hover:bg-primary/20 transition-colors opacity-0 group-hover:opacity-100 focus:opacity-100"
                                    title={`Message ${f.personaName}`}
                                  >
                                    <MessageSquare className="h-3 w-3" />
                                  </span>
                                </>
                              );
                            })()}
                            {f.gameId && f.gameName && (
                              <span
                                role="button"
                                tabIndex={0}
                                onClick={(e) => launchFriendGame(e, f.gameId!, f.gameName!)}
                                onKeyDown={(e) => {
                                  if (e.key === "Enter" || e.key === " ") {
                                    launchFriendGame(e as unknown as React.MouseEvent, f.gameId!, f.gameName!);
                                  }
                                }}
                                className="shrink-0 h-6 w-6 rounded-md flex items-center justify-center bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 hover:text-emerald-300 transition-colors opacity-0 group-hover:opacity-100 focus:opacity-100"
                                title={`Launch ${f.gameName}`}
                              >
                                <Play className="h-3 w-3" />
                              </span>
                            )}
                          </button>
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

      <SteamProfileDialog
        steamId={selectedSteamId}
        viewerSteamId={steamId}
        onClose={() => setSelectedSteamId(null)}
      />
    </div>
  );
};
