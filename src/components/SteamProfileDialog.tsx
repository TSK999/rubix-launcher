import { useEffect, useState } from "react";
import { Loader2, Globe, Gamepad2, Clock, Calendar, ExternalLink, Play } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { fetchSteamProfile, type SteamProfileResponse } from "@/lib/steam-profile";

type Props = {
  steamId: string | null;
  viewerSteamId?: string | null;
  onClose: () => void;
};

const STATUS_LABEL: Record<string, { label: string; dot: string }> = {
  "in-game": { label: "In game", dot: "bg-emerald-400" },
  online: { label: "Online", dot: "bg-sky-400" },
  away: { label: "Away", dot: "bg-amber-400" },
  offline: { label: "Offline", dot: "bg-muted-foreground/40" },
};

const formatPlaytime = (mins: number) => {
  if (mins < 60) return `${mins}m`;
  const h = Math.floor(mins / 60);
  return `${h}h`;
};

const formatDate = (unix?: number) =>
  unix ? new Date(unix * 1000).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" }) : "—";

const launchSteamApp = async (appId: number) => {
  const target = `steam://rungameid/${appId}`;
  if (window.rubix?.isElectron) {
    const res = await window.rubix.launchGame(target);
    if (!res.ok) toast.error("Couldn't launch", { description: res.error });
  } else {
    window.location.href = target;
  }
};

export const SteamProfileDialog = ({ steamId, viewerSteamId, onClose }: Props) => {
  const [data, setData] = useState<SteamProfileResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!steamId) {
      setData(null);
      setError(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    setData(null);
    fetchSteamProfile(steamId, viewerSteamId)
      .then((res) => {
        if (!cancelled) setData(res);
      })
      .catch((e) => {
        if (cancelled) return;
        const msg = e instanceof Error ? e.message : "Failed to load profile";
        setError(msg);
        toast.error("Couldn't load profile", { description: msg });
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [steamId, viewerSteamId]);

  const open = !!steamId;
  const meta = data ? STATUS_LABEL[data.profile.status] : null;

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl p-0 overflow-hidden">
        <DialogHeader className="sr-only">
          <DialogTitle>Steam profile</DialogTitle>
        </DialogHeader>

        {loading && (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        )}

        {error && !loading && (
          <div className="px-6 py-12 text-center">
            <p className="text-sm text-muted-foreground">{error}</p>
          </div>
        )}

        {data && !loading && (
          <>
            {/* Header banner */}
            <div className="relative bg-gradient-to-br from-secondary/60 to-background px-6 pt-6 pb-5 border-b border-border overflow-hidden">
              {(data.profileBackground?.movie || data.profileBackground?.image) && (
                <>
                  {data.profileBackground.movie ? (
                    <video
                      src={data.profileBackground.movie}
                      autoPlay
                      loop
                      muted
                      playsInline
                      poster={data.profileBackground.image}
                      className="absolute inset-0 w-full h-full object-cover"
                    />
                  ) : (
                    <img
                      src={data.profileBackground.image}
                      alt=""
                      className="absolute inset-0 w-full h-full object-cover"
                    />
                  )}
                  <div className="absolute inset-0 bg-background/70 backdrop-blur-[2px]" />
                </>
              )}
              <div className="relative flex items-start gap-4">
                {data.profile.avatar ? (
                  <img
                    src={data.profile.avatar}
                    alt=""
                    className="h-20 w-20 rounded-lg object-cover ring-2 ring-border shrink-0"
                  />
                ) : (
                  <div className="h-20 w-20 rounded-lg bg-secondary shrink-0" />
                )}

                <div className="flex-1 min-w-0">
                  <h2 className="text-xl font-semibold truncate">{data.profile.personaName}</h2>
                  {data.profile.realName && (
                    <p className="text-sm text-muted-foreground truncate">{data.profile.realName}</p>
                  )}
                  <div className="flex items-center gap-2 mt-2">
                    {meta && (
                      <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                        <span className={cn("h-2 w-2 rounded-full", meta.dot)} />
                        {meta.label}
                      </span>
                    )}
                    {data.profile.countryCode && (
                      <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                        <Globe className="h-3 w-3" />
                        {data.profile.countryCode}
                      </span>
                    )}
                    {data.profile.timeCreated && (
                      <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                        <Calendar className="h-3 w-3" />
                        Joined {formatDate(data.profile.timeCreated)}
                      </span>
                    )}
                  </div>

                  {data.profile.gameName && data.profile.gameId && (
                    <div className="mt-3 flex items-center gap-2">
                      <div className="flex-1 min-w-0 inline-flex items-center gap-2 px-2.5 py-1.5 rounded-md bg-emerald-500/10 border border-emerald-500/20">
                        <Gamepad2 className="h-3.5 w-3.5 text-emerald-400 shrink-0" />
                        <span className="text-xs text-emerald-300 truncate">
                          Playing <strong className="font-semibold">{data.profile.gameName}</strong>
                        </span>
                      </div>
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => launchSteamApp(Number(data.profile.gameId))}
                        className="shrink-0 h-8"
                      >
                        <Play className="h-3 w-3 mr-1" />
                        Join
                      </Button>
                    </div>
                  )}
                </div>
              </div>

              <div className="relative flex items-center gap-3 mt-4 text-xs text-muted-foreground">
                {data.totalGames !== undefined && (
                  <span>
                    <strong className="text-foreground">{data.totalGames.toLocaleString()}</strong> games owned
                  </span>
                )}
                {data.profile.lastLogoff && data.profile.status === "offline" && (
                  <span className="inline-flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    Last online {formatDate(data.profile.lastLogoff)}
                  </span>
                )}
                <a
                  href={data.profile.profileUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="ml-auto inline-flex items-center gap-1 hover:text-foreground transition-colors"
                >
                  Open on Steam <ExternalLink className="h-3 w-3" />
                </a>
              </div>
            </div>

            {/* Recently played */}
            <div className="px-6 py-5 max-h-[55vh] overflow-y-auto">
              <h3 className="text-[11px] uppercase tracking-wider text-muted-foreground font-medium mb-3">
                Recently played
              </h3>
              {data.recentGames.length === 0 ? (
                <p className="text-xs text-muted-foreground py-6 text-center">
                  {data.profile.communityVisibilityState !== 3
                    ? "Game activity is private."
                    : "No games played in the last 2 weeks."}
                </p>
              ) : (
                <ul className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {data.recentGames.map((g) => (
                    <li
                      key={g.appId}
                      className="group flex items-center gap-3 p-2 rounded-lg hover:bg-secondary/50 transition-colors"
                    >
                      <img
                        src={g.header}
                        alt=""
                        className="h-12 w-24 rounded object-cover shrink-0 bg-secondary"
                        loading="lazy"
                      />
                      <div className="flex-1 min-w-0">
                        <div className="text-xs font-medium truncate">{g.name}</div>
                        <div className="text-[10px] text-muted-foreground">
                          {formatPlaytime(g.playtime2Weeks)} past 2 weeks · {formatPlaytime(g.playtimeForever)} total
                        </div>
                      </div>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-7 w-7 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity"
                        onClick={() => launchSteamApp(g.appId)}
                        title="Launch via Steam"
                      >
                        <Play className="h-3 w-3" />
                      </Button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
};
