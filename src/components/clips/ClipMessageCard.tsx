import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { ExternalLink, Film, Play } from "lucide-react";
import { fetchSharedClipBySlug, publicUrl, type SharedClip } from "@/lib/clip-share";
import { cn } from "@/lib/utils";

const fmtTime = (s: number | null | undefined) => {
  if (!s) return "0:00";
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${r.toString().padStart(2, "0")}`;
};

export const ClipMessageCard = ({ slug }: { slug: string }) => {
  const [clip, setClip] = useState<SharedClip | null>(null);
  const [hover, setHover] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    let alive = true;
    void fetchSharedClipBySlug(slug).then((c) => alive && setClip(c));
    return () => { alive = false; };
  }, [slug]);

  useEffect(() => {
    const v = videoRef.current;
    if (!v || expanded) return;
    if (hover) {
      v.currentTime = 0;
      v.muted = true;
      void v.play().catch(() => {});
    } else {
      v.pause();
      v.currentTime = 0;
    }
  }, [hover, expanded]);

  if (!clip) {
    return (
      <div className="w-72 h-40 rounded-xl bg-secondary animate-pulse" />
    );
  }

  const stream = publicUrl(clip.stream_path);
  const thumb = publicUrl(clip.thumbnail_path);

  return (
    <div
      className="relative w-72 max-w-full overflow-hidden rounded-xl border border-border bg-card shadow-sm"
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
    >
      <div className="relative aspect-video bg-black">
        {expanded ? (
          <video src={stream} controls autoPlay className="absolute inset-0 h-full w-full" />
        ) : (
          <>
            {thumb && (
              <img
                src={thumb}
                alt={clip.title}
                className={cn("absolute inset-0 h-full w-full object-cover transition-opacity", hover && "opacity-0")}
                loading="lazy"
              />
            )}
            <video
              ref={videoRef}
              src={stream}
              muted
              playsInline
              preload="metadata"
              className="absolute inset-0 h-full w-full object-cover"
            />
            <button
              type="button"
              onClick={() => setExpanded(true)}
              className="absolute inset-0 grid place-items-center bg-black/20 hover:bg-black/30 transition-colors"
              aria-label="Play clip"
            >
              <span className="grid h-12 w-12 place-items-center rounded-full bg-white/95 text-black shadow-lg">
                <Play className="h-5 w-5 fill-current" />
              </span>
            </button>
            <span className="absolute bottom-1.5 right-1.5 rounded-md bg-black/70 px-1.5 py-0.5 text-[10px] font-medium text-white tabular-nums">
              {fmtTime(clip.duration_seconds)}
            </span>
          </>
        )}
      </div>
      <div className="flex items-center gap-2 p-2.5">
        <Film className="h-3.5 w-3.5 text-primary shrink-0" />
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-medium leading-tight">{clip.title}</div>
          <div className="truncate text-[11px] text-muted-foreground">
            {clip.game_title || "Clip"}{clip.view_count ? ` · ${clip.view_count} view${clip.view_count === 1 ? "" : "s"}` : ""}
          </div>
        </div>
        <Link
          to={`/clip/${clip.share_slug}`}
          className="h-7 w-7 grid place-items-center rounded-md text-muted-foreground hover:bg-secondary hover:text-foreground"
          aria-label="Open clip page"
        >
          <ExternalLink className="h-3.5 w-3.5" />
        </Link>
      </div>
    </div>
  );
};
