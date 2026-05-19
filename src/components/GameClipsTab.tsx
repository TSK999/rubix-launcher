import { useRef, useState, type DragEvent } from "react";
import { Download, Film, Loader2, Trash2, Upload } from "lucide-react";
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

  const onDownload = async (c: GameClip) => {
    if (!c.url) return;
    try {
      const res = await fetch(c.url);
      const blob = await res.blob();
      const ext = (blob.type.split("/")[1] || "webm").split(";")[0];
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const safe = (game.title || "clip").replace(/[^a-z0-9-_]+/gi, "_");
      a.download = `${safe}-${c.id.slice(0, 8)}.${ext}`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch {
      toast.error("Download failed");
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
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {clips.map((c) => (
            <div key={c.id} className="space-y-1.5">
              <div className="relative">
                {c.url ? (
                  <ClipPlayer src={c.url} className="aspect-video w-full" />
                ) : (
                  <div className="aspect-video w-full rounded-xl bg-secondary" />
                )}
                <div className="absolute top-1.5 right-1.5 z-10 flex gap-1 opacity-0 hover:opacity-100 group-hover:opacity-100 transition-opacity">
                  <button
                    type="button"
                    onClick={() => void onDownload(c)}
                    className="h-7 w-7 grid place-items-center rounded-full bg-background/70 backdrop-blur text-foreground hover:bg-background"
                    aria-label="Download clip"
                  >
                    <Download className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => void onDelete(c)}
                    className="h-7 w-7 grid place-items-center rounded-full bg-background/70 backdrop-blur text-destructive hover:bg-background"
                    aria-label="Delete clip"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
              <div className="flex items-center justify-between px-1 text-[11px] text-muted-foreground">
                <span className="font-medium text-foreground/80">
                  {c.duration_seconds ? `${c.duration_seconds}s` : "Clip"}
                </span>
                <span>{formatSize(c.size_bytes)}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
