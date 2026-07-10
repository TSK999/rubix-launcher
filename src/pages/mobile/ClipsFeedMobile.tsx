import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  ArrowLeft,
  Eye,
  Film,
  Flame,
  Gamepad2,
  Heart,
  MessageCircle,
  Pause,
  Play,
  Share2,
  Sparkles,
  TrendingUp,
  Volume2,
  VolumeX,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useRubixAuth } from "@/hooks/useRubixAuth";
import { signedClipUrl, useClipUrl, type SharedClip } from "@/lib/clip-share";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

type Profile = { user_id: string; username: string; display_name: string | null; avatar_url: string | null };
type Tab = "for-you" | "trending" | "recent";

type FeedClip = SharedClip & {
  reaction_count: number;
  comment_count: number;
  in_library: boolean;
};

const normalize = (s: string | null | undefined) =>
  (s ?? "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

const timeAgo = (iso: string) => {
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  return `${Math.floor(s / 86400)}d`;
};

const ClipsFeedMobile = () => {
  const { user } = useRubixAuth();
  const nav = useNavigate();
  const [tab, setTab] = useState<Tab>("for-you");
  const [clips, setClips] = useState<FeedClip[]>([]);
  const [uploaders, setUploaders] = useState<Map<string, Profile>>(new Map());
  const [loading, setLoading] = useState(true);
  const [libraryTitles, setLibraryTitles] = useState<Set<string>>(new Set());
  const [activeIdx, setActiveIdx] = useState(0);
  const [muted, setMuted] = useState(true);

  const scrollerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    document.title = "Clips — RUBIX";
  }, []);

  useEffect(() => {
    if (!user) return;
    (async () => {
      const { data } = await supabase
        .from("orders")
        .select("game:games(title, slug)")
        .eq("user_id", user.id)
        .eq("status", "completed");
      const titles = new Set<string>();
      (data ?? []).forEach((o: any) => {
        if (o.game?.title) titles.add(normalize(o.game.title));
        if (o.game?.slug) titles.add(normalize(o.game.slug));
      });
      setLibraryTitles(titles);
    })();
  }, [user]);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    (async () => {
      const { data: rows } = await supabase
        .from("shared_clips")
        .select("*")
        .neq("visibility", "private")
        .eq("processing_status", "ready")
        .order("created_at", { ascending: false })
        .limit(120);

      const base = (rows ?? []) as SharedClip[];
      if (base.length === 0) {
        if (alive) { setClips([]); setLoading(false); }
        return;
      }

      const ids = base.map((c) => c.id);
      const userIds = Array.from(new Set(base.map((c) => c.user_id)));

      const [rxRes, cmRes, profRes] = await Promise.all([
        supabase.from("clip_reactions").select("clip_id").in("clip_id", ids),
        supabase.from("clip_comments").select("clip_id").in("clip_id", ids),
        supabase
          .from("profiles")
          .select("user_id, username, display_name, avatar_url")
          .in("user_id", userIds),
      ]);

      const rxMap = new Map<string, number>();
      (rxRes.data ?? []).forEach((r: any) => rxMap.set(r.clip_id, (rxMap.get(r.clip_id) ?? 0) + 1));
      const cmMap = new Map<string, number>();
      (cmRes.data ?? []).forEach((r: any) => cmMap.set(r.clip_id, (cmMap.get(r.clip_id) ?? 0) + 1));

      const enriched: FeedClip[] = base.map((c) => ({
        ...c,
        reaction_count: rxMap.get(c.id) ?? 0,
        comment_count: cmMap.get(c.id) ?? 0,
        in_library: libraryTitles.has(normalize(c.game_title)) || libraryTitles.has(normalize(c.game_key)),
      }));

      if (alive) {
        setClips(enriched);
        setUploaders(new Map(((profRes.data as Profile[]) ?? []).map((p) => [p.user_id, p])));
        setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [libraryTitles]);

  const sorted = useMemo(() => {
    const arr = [...clips];
    if (tab === "trending") {
      arr.sort((a, b) => {
        const score = (c: FeedClip) =>
          c.view_count + c.reaction_count * 4 + c.comment_count * 6 + c.share_count * 5;
        return score(b) - score(a);
      });
    } else if (tab === "recent") {
      arr.sort((a, b) => +new Date(b.created_at) - +new Date(a.created_at));
    } else {
      arr.sort((a, b) => {
        if (a.in_library !== b.in_library) return a.in_library ? -1 : 1;
        const score = (c: FeedClip) =>
          c.reaction_count * 3 + c.comment_count * 4 + c.view_count + +new Date(c.created_at) / 1e10;
        return score(b) - score(a);
      });
    }
    return arr;
  }, [clips, tab]);

  // Track which slide is visible with IntersectionObserver
  useEffect(() => {
    const root = scrollerRef.current;
    if (!root || sorted.length === 0) return;
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.intersectionRatio >= 0.65) {
            const idx = Number((e.target as HTMLElement).dataset.idx);
            if (!Number.isNaN(idx)) setActiveIdx(idx);
          }
        }
      },
      { root, threshold: [0.65] },
    );
    root.querySelectorAll<HTMLElement>("[data-idx]").forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, [sorted.length]);

  // Reset scroll when tab changes
  useEffect(() => {
    scrollerRef.current?.scrollTo({ top: 0 });
    setActiveIdx(0);
  }, [tab]);

  const tabs: { id: Tab; label: string; icon: typeof Flame }[] = [
    { id: "for-you", label: "For you", icon: Sparkles },
    { id: "trending", label: "Trending", icon: TrendingUp },
    { id: "recent", label: "Recent", icon: Flame },
  ];

  return (
    <div className="fixed inset-0 bg-black text-white overflow-hidden">
      {/* Top overlay chrome */}
      <div className="absolute top-0 inset-x-0 z-30 pt-[env(safe-area-inset-top)] bg-gradient-to-b from-black/70 to-transparent">
        <div className="flex items-center gap-2 px-3 pt-2 pb-3">
          <button
            onClick={() => nav(-1)}
            className="h-9 w-9 grid place-items-center rounded-full bg-white/10 backdrop-blur-md active:scale-95"
            aria-label="Back"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
          <div className="flex-1 flex justify-center gap-4">
            {tabs.map(({ id, label }) => (
              <button
                key={id}
                onClick={() => setTab(id)}
                className={cn(
                  "relative text-sm font-semibold tracking-tight transition-colors",
                  tab === id ? "text-white" : "text-white/60",
                )}
              >
                {label}
                {tab === id && (
                  <span className="absolute -bottom-1.5 left-1/2 -translate-x-1/2 h-0.5 w-6 rounded-full bg-white" />
                )}
              </button>
            ))}
          </div>
          <button
            onClick={() => setMuted((m) => !m)}
            className="h-9 w-9 grid place-items-center rounded-full bg-white/10 backdrop-blur-md active:scale-95"
            aria-label="Toggle sound"
          >
            {muted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
          </button>
        </div>
      </div>

      {/* Feed */}
      {loading ? (
        <div className="h-full grid place-items-center">
          <Skeleton className="h-full w-full rounded-none bg-white/5" />
        </div>
      ) : sorted.length === 0 ? (
        <div className="h-full grid place-items-center px-8 text-center">
          <div>
            <Film className="h-10 w-10 mx-auto text-white/40" />
            <p className="mt-4 text-lg font-semibold">No clips yet</p>
            <p className="mt-1 text-sm text-white/60">
              Be the first — press your clip hotkey in-game.
            </p>
          </div>
        </div>
      ) : (
        <div
          ref={scrollerRef}
          className="h-full w-full overflow-y-scroll snap-y snap-mandatory scrollbar-none"
          style={{ scrollbarWidth: "none" }}
        >
          {sorted.map((c, i) => (
            <ClipSlide
              key={c.id}
              idx={i}
              clip={c}
              uploader={uploaders.get(c.user_id)}
              active={i === activeIdx}
              muted={muted}
              onToggleMute={() => setMuted((m) => !m)}
            />
          ))}
        </div>
      )}
    </div>
  );
};

const ClipSlide = ({
  idx,
  clip,
  uploader,
  active,
  muted,
  onToggleMute,
}: {
  idx: number;
  clip: FeedClip;
  uploader: Profile | undefined;
  active: boolean;
  muted: boolean;
  onToggleMute: () => void;
}) => {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [videoUrl, setVideoUrl] = useState<string>("");
  const thumbUrl = useClipUrl(clip.thumbnail_path);
  const [paused, setPaused] = useState(false);
  const [showPauseHint, setShowPauseHint] = useState(false);

  // Lazy: fetch video URL only when near/active
  useEffect(() => {
    if (!active || videoUrl) return;
    let alive = true;
    void signedClipUrl(clip.stream_path ?? clip.original_path).then((u) => {
      if (alive) setVideoUrl(u);
    });
    return () => { alive = false; };
  }, [active, videoUrl, clip.stream_path, clip.original_path]);

  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    if (active && !paused) {
      v.currentTime = 0;
      v.play().catch(() => {});
    } else {
      v.pause();
    }
  }, [active, paused, videoUrl]);

  const togglePause = () => {
    setPaused((p) => !p);
    setShowPauseHint(true);
    window.setTimeout(() => setShowPauseHint(false), 500);
  };

  return (
    <section
      data-idx={idx}
      className="relative h-[100dvh] w-full snap-start snap-always overflow-hidden bg-black"
    >
      {/* Media */}
      <button
        onClick={togglePause}
        className="absolute inset-0 h-full w-full"
        aria-label={paused ? "Play" : "Pause"}
      >
        {thumbUrl && (
          <img
            src={thumbUrl}
            alt=""
            className="absolute inset-0 h-full w-full object-cover"
          />
        )}
        {videoUrl && (
          <video
            ref={videoRef}
            src={videoUrl}
            className="absolute inset-0 h-full w-full object-cover"
            loop
            muted={muted}
            playsInline
            preload="metadata"
          />
        )}
        {/* Gradient scrims */}
        <div className="absolute inset-x-0 bottom-0 h-64 bg-gradient-to-t from-black/85 via-black/40 to-transparent pointer-events-none" />
        {showPauseHint && (
          <div className="absolute inset-0 grid place-items-center pointer-events-none">
            <div className="h-20 w-20 rounded-full bg-black/50 backdrop-blur grid place-items-center animate-in fade-in zoom-in-50">
              {paused ? <Play className="h-9 w-9 fill-white" /> : <Pause className="h-9 w-9 fill-white" />}
            </div>
          </div>
        )}
      </button>

      {/* Right action rail */}
      <div className="absolute right-2 bottom-32 z-20 flex flex-col items-center gap-5">
        <Link
          to={`/clip/${clip.share_slug}`}
          className="flex flex-col items-center gap-1 active:scale-95 transition-transform"
        >
          <div className="h-12 w-12 rounded-full bg-white/10 backdrop-blur-md grid place-items-center">
            <Heart className="h-6 w-6" />
          </div>
          <span className="text-[11px] font-semibold">{clip.reaction_count}</span>
        </Link>
        <Link
          to={`/clip/${clip.share_slug}`}
          className="flex flex-col items-center gap-1 active:scale-95 transition-transform"
        >
          <div className="h-12 w-12 rounded-full bg-white/10 backdrop-blur-md grid place-items-center">
            <MessageCircle className="h-6 w-6" />
          </div>
          <span className="text-[11px] font-semibold">{clip.comment_count}</span>
        </Link>
        <button
          onClick={(e) => {
            e.stopPropagation();
            if (navigator.share) {
              void navigator.share({
                title: clip.title,
                url: `${window.location.origin}/clip/${clip.share_slug}`,
              }).catch(() => {});
            }
          }}
          className="flex flex-col items-center gap-1 active:scale-95 transition-transform"
        >
          <div className="h-12 w-12 rounded-full bg-white/10 backdrop-blur-md grid place-items-center">
            <Share2 className="h-6 w-6" />
          </div>
          <span className="text-[11px] font-semibold">{clip.share_count}</span>
        </button>
        <div className="flex flex-col items-center gap-1 opacity-80">
          <div className="h-10 w-10 rounded-full bg-white/10 backdrop-blur-md grid place-items-center">
            <Eye className="h-5 w-5" />
          </div>
          <span className="text-[10px]">{clip.view_count}</span>
        </div>
      </div>

      {/* Bottom info */}
      <div className="absolute inset-x-0 bottom-0 z-20 p-4 pb-8 space-y-2.5">
        <div className="flex items-center gap-2.5">
          <Link to={uploader ? `/u/${uploader.username}` : "#"} className="flex items-center gap-2.5 min-w-0">
            <Avatar className="h-9 w-9 ring-2 ring-white/60">
              <AvatarImage src={uploader?.avatar_url ?? undefined} />
              <AvatarFallback className="text-[10px] bg-white/10 text-white">
                {(uploader?.display_name || uploader?.username || "?")[0]?.toUpperCase()}
              </AvatarFallback>
            </Avatar>
            <div className="min-w-0">
              <p className="text-sm font-bold truncate">
                @{uploader?.username ?? "unknown"}
              </p>
              <p className="text-[11px] text-white/70">{timeAgo(clip.created_at)}</p>
            </div>
          </Link>
        </div>
        <p className="text-sm font-semibold leading-snug line-clamp-2 pr-16">
          {clip.title}
        </p>
        {(clip.game_title || clip.in_library) && (
          <div className="flex items-center gap-2 pr-16">
            {clip.game_title && (
              <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded-full bg-white/10 backdrop-blur text-[11px] font-medium">
                <Gamepad2 className="h-3 w-3" />
                {clip.game_title}
              </span>
            )}
            {clip.in_library && (
              <span className="px-2 py-1 rounded-full bg-primary/80 text-[10px] font-bold uppercase tracking-wider">
                In library
              </span>
            )}
          </div>
        )}
      </div>

      {/* Tap-anywhere-to-unmute hint on first slide */}
      {active && muted && idx === 0 && (
        <button
          onClick={onToggleMute}
          className="absolute top-20 left-1/2 -translate-x-1/2 z-20 px-3 py-1.5 rounded-full bg-white/15 backdrop-blur-md text-[11px] font-semibold flex items-center gap-1.5 animate-pulse"
        >
          <VolumeX className="h-3.5 w-3.5" />
          Tap for sound
        </button>
      )}
    </section>
  );
};

export default ClipsFeedMobile;
