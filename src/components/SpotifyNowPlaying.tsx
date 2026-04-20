import { useEffect, useState } from "react";
import {
  Loader2,
  Music,
  Pause,
  Play,
  SkipBack,
  SkipForward,
  Unlink,
  Volume2,
  VolumeX,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Slider } from "@/components/ui/slider";
import {
  controlSpotify,
  disconnectSpotify,
  fetchMySpotifyConnection,
  fetchNowPlaying,
  startSpotifyOAuth,
  type SpotifyConnection,
  type SpotifyTrack,
} from "@/lib/spotify";
import spotifyIcon from "@/assets/spotify-icon.png";

type Props = {
  userId: string | null;
};

export const SpotifyNowPlaying = ({ userId }: Props) => {
  const [connection, setConnection] = useState<SpotifyConnection | null>(null);
  const [track, setTrack] = useState<SpotifyTrack | null>(null);
  const [loading, setLoading] = useState(false);
  const [linking, setLinking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [volume, setVolume] = useState(70);
  const [muted, setMuted] = useState(false);

  // Handle OAuth callback toast
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const status = params.get("spotify");
    if (status === "linked") {
      toast.success("Spotify connected");
      params.delete("spotify");
      const q = params.toString();
      window.history.replaceState(
        {},
        "",
        window.location.pathname + (q ? `?${q}` : ""),
      );
    } else if (status === "error") {
      toast.error("Couldn't connect Spotify");
      params.delete("spotify");
      const q = params.toString();
      window.history.replaceState(
        {},
        "",
        window.location.pathname + (q ? `?${q}` : ""),
      );
    }
  }, []);

  const loadConnection = async () => {
    if (!userId) return;
    const conn = await fetchMySpotifyConnection();
    setConnection(conn);
  };

  const loadTrack = async () => {
    if (!userId || !connection) return;
    setLoading(true);
    try {
      const map = await fetchNowPlaying([userId]);
      setTrack(map.get(userId) ?? null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadConnection();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  useEffect(() => {
    if (!connection) {
      setTrack(null);
      return;
    }
    loadTrack();
    const id = window.setInterval(loadTrack, 30_000);
    return () => window.clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connection?.user_id]);

  const handleLink = async () => {
    setLinking(true);
    try {
      const url = await startSpotifyOAuth(window.location.pathname);
      window.location.href = url;
    } catch (e) {
      toast.error("Couldn't start Spotify login", {
        description: e instanceof Error ? e.message : undefined,
      });
      setLinking(false);
    }
  };

  const handleUnlink = async () => {
    if (!userId) return;
    await disconnectSpotify(userId);
    setConnection(null);
    setTrack(null);
    toast("Spotify disconnected");
  };

  if (!userId) return null;

  return (
    <div className="p-3 border-t border-border">
      <div className="flex items-center justify-between px-3 pt-2 pb-2">
        <div className="flex items-center gap-2 text-[11px] uppercase tracking-wider text-muted-foreground font-medium">
          <Music className="h-3 w-3" />
          <span>Spotify</span>
        </div>
        {connection && (
          <button
            onClick={handleUnlink}
            className="text-muted-foreground hover:text-foreground transition-colors"
            title="Disconnect Spotify"
          >
            <Unlink className="h-3 w-3" />
          </button>
        )}
      </div>

      {!connection ? (
        <button
          onClick={handleLink}
          disabled={linking}
          className="w-full flex items-center gap-3 px-3 py-2 rounded-xl text-sm text-muted-foreground hover:text-foreground hover:bg-secondary/50 transition-colors disabled:opacity-50"
        >
          {linking ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <img src={spotifyIcon} alt="" className="h-4 w-4" width={16} height={16} loading="lazy" />
          )}
          <span>Link Spotify</span>
        </button>
      ) : (
        <a
          href={track?.url ?? `https://open.spotify.com/user/${connection.spotify_id}`}
          target="_blank"
          rel="noreferrer"
          className="block px-3 py-2 rounded-xl hover:bg-secondary/50 transition-colors group"
        >
          <div className="flex items-center gap-2.5">
            {track?.album_art ? (
              <img
                src={track.album_art}
                alt=""
                className="h-10 w-10 rounded-md object-cover shrink-0"
                loading="lazy"
              />
            ) : (
              <div className="h-10 w-10 rounded-md bg-secondary flex items-center justify-center shrink-0">
                <img src={spotifyIcon} alt="" className="h-5 w-5" width={20} height={20} loading="lazy" />
              </div>
            )}
            <div className="flex-1 min-w-0">
              {loading && !track ? (
                <p className="text-[11px] text-muted-foreground">Loading…</p>
              ) : track ? (
                <>
                  <div className="flex items-center gap-1.5">
                    <span
                      className={cn(
                        "h-1.5 w-1.5 rounded-full shrink-0",
                        track.is_playing ? "bg-primary animate-pulse" : "bg-muted-foreground/40",
                      )}
                    />
                    <p className="text-xs font-medium text-foreground truncate">
                      {track.name}
                    </p>
                  </div>
                  <p className="text-[10px] text-muted-foreground truncate">
                    {track.artists}
                    {!track.is_playing && " · recently played"}
                  </p>
                </>
              ) : (
                <>
                  <p className="text-xs font-medium text-foreground truncate">
                    Nothing playing
                  </p>
                  <p className="text-[10px] text-muted-foreground truncate">
                    @{connection.spotify_username ?? connection.spotify_id}
                  </p>
                </>
              )}
            </div>
          </div>
        </a>
      )}

      {connection && (
        <div className="px-3 pt-2 space-y-2">
          <div className="flex items-center justify-center gap-1">
            <button
              onClick={() => runControl({ action: "previous" })}
              disabled={busy}
              className="h-8 w-8 flex items-center justify-center rounded-full text-muted-foreground hover:text-foreground hover:bg-secondary/60 transition-colors disabled:opacity-40"
              title="Previous"
              aria-label="Previous track"
            >
              <SkipBack className="h-4 w-4" />
            </button>
            <button
              onClick={() =>
                runControl({ action: track?.is_playing ? "pause" : "play" })
              }
              disabled={busy}
              className="h-9 w-9 flex items-center justify-center rounded-full bg-primary text-primary-foreground hover:opacity-90 transition disabled:opacity-40"
              title={track?.is_playing ? "Pause" : "Play"}
              aria-label={track?.is_playing ? "Pause" : "Play"}
            >
              {busy ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : track?.is_playing ? (
                <Pause className="h-4 w-4" />
              ) : (
                <Play className="h-4 w-4 ml-0.5" />
              )}
            </button>
            <button
              onClick={() => runControl({ action: "next" })}
              disabled={busy}
              className="h-8 w-8 flex items-center justify-center rounded-full text-muted-foreground hover:text-foreground hover:bg-secondary/60 transition-colors disabled:opacity-40"
              title="Next"
              aria-label="Next track"
            >
              <SkipForward className="h-4 w-4" />
            </button>
          </div>
          <div className="flex items-center gap-2 px-1">
            <button
              onClick={handleMute}
              className="text-muted-foreground hover:text-foreground transition-colors shrink-0"
              title={muted ? "Unmute" : "Mute"}
              aria-label={muted ? "Unmute" : "Mute"}
            >
              {muted || volume === 0 ? (
                <VolumeX className="h-3.5 w-3.5" />
              ) : (
                <Volume2 className="h-3.5 w-3.5" />
              )}
            </button>
            <Slider
              value={[muted ? 0 : volume]}
              max={100}
              step={1}
              onValueChange={(v) => setVolume(v[0])}
              onValueCommit={(v) => {
                setMuted(false);
                runControl({ action: "volume", volume_percent: v[0] });
              }}
              className="flex-1"
            />
          </div>
        </div>
      )}
    </div>
  );
};
