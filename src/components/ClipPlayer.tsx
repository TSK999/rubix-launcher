import { useEffect, useRef, useState } from "react";
import { Maximize2, Pause, Play, Volume2, VolumeX } from "lucide-react";
import { cn } from "@/lib/utils";

type Props = {
  src: string;
  className?: string;
  poster?: string;
};

const fmt = (s: number) => {
  if (!isFinite(s) || s < 0) s = 0;
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${sec.toString().padStart(2, "0")}`;
};

export const ClipPlayer = ({ src, className, poster }: Props) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const [playing, setPlaying] = useState(false);
  const [muted, setMuted] = useState(true);
  const [current, setCurrent] = useState(0);
  const [duration, setDuration] = useState(0);
  const [hover, setHover] = useState(false);

  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    const onTime = () => setCurrent(v.currentTime);
    const onMeta = () => setDuration(v.duration || 0);
    const onPlay = () => setPlaying(true);
    const onPause = () => setPlaying(false);
    const onEnd = () => setPlaying(false);
    v.addEventListener("timeupdate", onTime);
    v.addEventListener("loadedmetadata", onMeta);
    v.addEventListener("play", onPlay);
    v.addEventListener("pause", onPause);
    v.addEventListener("ended", onEnd);
    return () => {
      v.removeEventListener("timeupdate", onTime);
      v.removeEventListener("loadedmetadata", onMeta);
      v.removeEventListener("play", onPlay);
      v.removeEventListener("pause", onPause);
      v.removeEventListener("ended", onEnd);
    };
  }, [src]);

  // Keyboard shortcuts while hovering: Space=play/pause, ←/→ seek 5s, M=mute
  useEffect(() => {
    if (!hover) return;
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable)) {
        return;
      }
      const v = videoRef.current;
      if (!v) return;
      if (e.code === "Space") {
        e.preventDefault();
        if (v.paused) void v.play();
        else v.pause();
      } else if (e.code === "ArrowRight") {
        e.preventDefault();
        v.currentTime = Math.min((v.duration || 0), v.currentTime + 5);
      } else if (e.code === "ArrowLeft") {
        e.preventDefault();
        v.currentTime = Math.max(0, v.currentTime - 5);
      } else if (e.key === "m" || e.key === "M") {
        e.preventDefault();
        v.muted = !v.muted;
        setMuted(v.muted);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [hover]);

  const toggle = () => {
    const v = videoRef.current;
    if (!v) return;
    if (v.paused) void v.play();
    else v.pause();
  };

  const seek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = videoRef.current;
    if (!v) return;
    const t = (Number(e.target.value) / 1000) * (duration || 0);
    v.currentTime = t;
    setCurrent(t);
  };

  const toggleMute = () => {
    const v = videoRef.current;
    if (!v) return;
    v.muted = !v.muted;
    setMuted(v.muted);
  };

  const toggleFullscreen = async () => {
    const el = wrapRef.current;
    if (!el) return;
    if (document.fullscreenElement) {
      await document.exitFullscreen();
    } else {
      await el.requestFullscreen?.();
    }
  };

  const progress = duration ? (current / duration) * 1000 : 0;

  return (
    <div
      ref={wrapRef}
      className={cn(
        "group relative overflow-hidden rounded-xl bg-black ring-1 ring-border",
        className,
      )}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
    >
      <video
        ref={videoRef}
        src={src}
        poster={poster}
        className="h-full w-full object-contain"
        preload="metadata"
        muted={muted}
        playsInline
        onClick={toggle}
      />

      {/* Center play overlay when paused */}
      {!playing && (
        <button
          type="button"
          onClick={toggle}
          className="absolute inset-0 grid place-items-center bg-black/30 transition-opacity"
          aria-label="Play"
        >
          <span className="grid h-14 w-14 place-items-center rounded-full bg-background/80 backdrop-blur">
            <Play className="h-6 w-6 fill-foreground text-foreground" />
          </span>
        </button>
      )}

      {/* Controls bar */}
      <div
        className={cn(
          "absolute inset-x-0 bottom-0 flex flex-col gap-1 bg-gradient-to-t from-black/85 via-black/40 to-transparent px-2.5 pb-2 pt-6 text-white transition-opacity",
          hover || !playing ? "opacity-100" : "opacity-0",
        )}
        onClick={(e) => e.stopPropagation()}
      >
        <input
          type="range"
          min={0}
          max={1000}
          value={progress}
          onChange={seek}
          aria-label="Scrub"
          className="h-1 w-full cursor-pointer appearance-none rounded-full bg-white/25 accent-primary [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-primary"
        />
        <div className="flex items-center gap-2 text-[11px]">
          <button
            type="button"
            onClick={toggle}
            aria-label={playing ? "Pause" : "Play"}
            className="grid h-7 w-7 place-items-center rounded-full hover:bg-white/15"
          >
            {playing ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
          </button>
          <button
            type="button"
            onClick={toggleMute}
            aria-label={muted ? "Unmute" : "Mute"}
            className="grid h-7 w-7 place-items-center rounded-full hover:bg-white/15"
          >
            {muted ? <VolumeX className="h-3.5 w-3.5" /> : <Volume2 className="h-3.5 w-3.5" />}
          </button>
          <span className="tabular-nums text-white/90">
            {fmt(current)} / {fmt(duration)}
          </span>
          <button
            type="button"
            onClick={toggleFullscreen}
            aria-label="Fullscreen"
            className="ml-auto grid h-7 w-7 place-items-center rounded-full hover:bg-white/15"
          >
            <Maximize2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
};
