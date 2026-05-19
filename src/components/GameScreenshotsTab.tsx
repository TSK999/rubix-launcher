import { useRef, useState, type DragEvent } from "react";
import { Camera, ImagePlus, Loader2, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  deleteScreenshot,
  uploadScreenshot,
  type GameScreenshot,
} from "@/lib/game-user-data";
import type { Game } from "@/lib/game-types";
import { cn } from "@/lib/utils";

type Props = {
  game: Game;
  userId: string | null;
  shots: GameScreenshot[];
  setShots: (next: GameScreenshot[] | ((p: GameScreenshot[]) => GameScreenshot[])) => void;
};

const readDims = (file: Blob): Promise<{ width: number; height: number }> =>
  new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      resolve({ width: img.naturalWidth, height: img.naturalHeight });
      URL.revokeObjectURL(url);
    };
    img.onerror = () => {
      resolve({ width: 0, height: 0 });
      URL.revokeObjectURL(url);
    };
    img.src = url;
  });

export const GameScreenshotsTab = ({ game, userId, shots, setShots }: Props) => {
  const [busy, setBusy] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [lightbox, setLightbox] = useState<GameScreenshot | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFiles = async (files: FileList | File[]) => {
    if (!userId) {
      toast.error("Sign in to save screenshots");
      return;
    }
    const arr = Array.from(files).filter((f) => f.type.startsWith("image/"));
    if (!arr.length) return;
    setBusy(true);
    try {
      for (const f of arr) {
        const dims = await readDims(f);
        const shot = await uploadScreenshot(userId, game.id, f, {
          ...dims,
          name: f.name,
        });
        setShots((prev) => [shot, ...prev]);
      }
      toast.success(`${arr.length} screenshot${arr.length === 1 ? "" : "s"} added`);
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

  const onDelete = async (s: GameScreenshot) => {
    setShots((prev) => prev.filter((x) => x.id !== s.id));
    if (lightbox?.id === s.id) setLightbox(null);
    try {
      await deleteScreenshot(s);
    } catch {
      toast.error("Could not delete screenshot");
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
            <Camera className="h-4 w-4 text-primary" />
            <span className="font-medium">Screenshots</span>
            <span className="text-muted-foreground">· drag images here or</span>
          </div>
          <div className="flex items-center gap-2">
            <input
              ref={inputRef}
              type="file"
              accept="image/*"
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
                <ImagePlus className="h-3.5 w-3.5 mr-1.5" />
              )}
              Upload
            </Button>
          </div>
        </div>
        {typeof window !== "undefined" && (window as any).rubix?.isElectron && (
          <p className="mt-2 text-[11px] text-muted-foreground">
            Tip: press <kbd className="px-1 py-0.5 rounded bg-background border border-border font-mono text-[10px]">F12</kbd> in-game
            to capture and auto-attach to the active game.
          </p>
        )}
      </div>

      {shots.length === 0 ? (
        <div className="text-center py-10 text-sm text-muted-foreground">
          No screenshots yet.
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {shots.map((s) => (
            <div
              key={s.id}
              className="group relative aspect-video rounded-xl overflow-hidden bg-secondary cursor-pointer ring-1 ring-border"
              onClick={() => setLightbox(s)}
            >
              {s.url && (
                <img
                  src={s.url}
                  alt={s.caption ?? "Screenshot"}
                  className="h-full w-full object-cover transition-transform group-hover:scale-105"
                  loading="lazy"
                />
              )}
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  void onDelete(s);
                }}
                className="absolute top-1.5 right-1.5 h-7 w-7 grid place-items-center rounded-full bg-background/70 backdrop-blur opacity-0 group-hover:opacity-100 transition-opacity text-destructive hover:bg-background"
                aria-label="Delete screenshot"
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
          <img
            src={lightbox.url}
            alt={lightbox.caption ?? "Screenshot"}
            className="max-h-full max-w-full rounded-xl shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}
    </div>
  );
};
