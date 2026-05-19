import { useRef, useState, type DragEvent } from "react";
import { Film, Loader2, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { ClipPlayer } from "@/components/ClipPlayer";
import {
  deleteClip,
  uploadClip,
  type GameClip,
} from "@/lib/game-clips";
import type { Game } from "@/lib/game-types";
import { cn } from "@/lib/utils";

type Props = {
  game: Game;
  userId: string | null;
  clips: GameClip[];
  setClips: (next: GameClip[] | ((p: GameClip[]) => GameClip[])) => void;
};

const readVideoMeta = (
  file: Blob,
): Promise<{ width: number; height: number; duration: number }> =>
  new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const v = document.createElement("video");
    v.preload = "metadata";
    v.onloadedmetadata = () => {
      resolve({
        width: v.videoWidth,
        height: v.videoHeight,
        duration: Math.round(v.duration || 0),
      });
      URL.revokeObjectURL(url);
    };
    v.onerror = () => {
      resolve({ width: 0, height: 0, duration: 0 });
      URL.revokeObjectURL(url);
    };
    v.src = url;
  });

const formatSize = (b?: number | null) => {
  if (!b) return "";
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(0)} KB`;
  return `${(b / 1024 / 1024).toFixed(1)} MB`;
};

export const GameClipsTab = ({ game, userId, clips, setClips }: Props) => {
  const [busy, setBusy] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFiles = async (files: FileList | File[]) => {
    if (!userId) {
      toast.error("Sign in to save clips");
      return;
    }
    const arr = Array.from(files).filter((f) => f.type.startsWith("video/"));
    if (!arr.length) return;
    setBusy(true);
    try {
      for (const f of arr) {
        const meta = await readVideoMeta(f);
        const clip = await uploadClip(userId, game.id, f, {
          width: meta.width,
          height: meta.height,
          duration_seconds: meta.duration,
        });
        setClips((prev) => [clip, ...prev]);
      }
      toast.success(`${arr.length} clip${arr.length === 1 ? "" : "s"} added`);
    } catch (e) {
      toast.error("Upload failed", {
        description: e instanceof Error ? e.message : undefined,
      });
    } finally {
      setBusy(false);
    }
  };

  const onDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragOver(false);
    if (e.dataTransfer.files?.length) void handleFiles(e.dataTransfer.files);
  };

  const onDelete = async (c: GameClip) => {
    setClips((prev) => prev.filter((x) => x.id !== c.id));
    try {
      await deleteClip(c);
    } catch {
      toast.error("Could not delete clip");
    }
  };

  return (
    <div className="space-y-4">
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={onDrop}
        className={cn(
          "rounded-2xl border border-dashed border-border bg-secondary/40 p-4 transition-colors",
          dragOver && "border-primary bg-primary/10",
        )}
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-sm">
            <Film className="h-4 w-4 text-primary" />
            <span className="font-medium">Clips</span>
            <span className="text-muted-foreground">· drag a video here or</span>
          </div>
          <div className="flex items-center gap-2">
            <input
              ref={inputRef}
              type="file"
              accept="video/*"
              multiple
              className="hidden"
              onChange={(e) => e.target.files && handleFiles(e.target.files)}
            />
            <Button
              size="sm"
              variant="outline"
              className="rounded-xl"
              disabled={busy}
              onClick={() => inputRef.current?.click()}
            >
              {busy ? (
                <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
              ) : (
                <Upload className="h-3.5 w-3.5 mr-1.5" />
              )}
              Upload
            </Button>
          </div>
        </div>
        {typeof window !== "undefined" && (window as any).rubix?.isElectron && (
          <p className="mt-2 text-[11px] text-muted-foreground">
            Tip: press <kbd className="px-1 py-0.5 rounded bg-background border border-border font-mono text-[10px]">F9</kbd> in-game
            to save the last 30 seconds of gameplay.
          </p>
        )}
      </div>

      {clips.length === 0 ? (
        <div className="text-center py-10 text-sm text-muted-foreground">
          No clips yet.
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {clips.map((c) => (
            <div
              key={c.id}
              className="group relative aspect-video rounded-xl overflow-hidden bg-secondary cursor-pointer ring-1 ring-border"
              onClick={() => setLightbox(c)}
            >
              {c.url && (
                <video
                  src={c.url}
                  className="h-full w-full object-cover"
                  preload="metadata"
                  muted
                />
              )}
              <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-background/90 to-transparent px-3 py-2 text-[11px] text-foreground/90 flex items-center justify-between">
                <span className="font-medium">
                  {c.duration_seconds ? `${c.duration_seconds}s` : "Clip"}
                </span>
                <span className="text-muted-foreground">{formatSize(c.size_bytes)}</span>
              </div>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  void onDelete(c);
                }}
                className="absolute top-1.5 right-1.5 h-7 w-7 grid place-items-center rounded-full bg-background/70 backdrop-blur opacity-0 group-hover:opacity-100 transition-opacity text-destructive hover:bg-background"
                aria-label="Delete clip"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}

      {lightbox && (
        <div
          className="fixed inset-0 z-50 bg-background/90 backdrop-blur grid place-items-center p-6"
          onClick={() => setLightbox(null)}
        >
          <button
            className="absolute top-4 right-4 h-9 w-9 grid place-items-center rounded-full bg-secondary"
            onClick={() => setLightbox(null)}
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
          <video
            src={lightbox.url}
            className="max-h-full max-w-full rounded-xl shadow-2xl"
            controls
            autoPlay
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}
    </div>
  );
};
