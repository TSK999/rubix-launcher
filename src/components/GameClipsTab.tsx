import { useEffect, useRef, useState, type DragEvent } from "react";
import { Film, Loader2, Radio, Upload } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { ClipPlayer } from "@/components/ClipPlayer";
import { ClipActionsMenu } from "@/components/clips/ClipActionsMenu";
import { supabase } from "@/integrations/supabase/client";
import {
  deleteClip,
  uploadClip,
  type GameClip,
} from "@/lib/game-clips";
import type { Game } from "@/lib/game-types";
import type { ClipBufferStatus } from "@/lib/clip-buffer";
import type { SharedClip } from "@/lib/clip-share";
import { shareLinkFor } from "@/lib/clip-share";
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
  const [recorderStatus, setRecorderStatus] = useState<ClipBufferStatus>("idle");
  const [sharedByLocalId, setSharedByLocalId] = useState<Map<string, SharedClip>>(new Map());
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    localStorage.setItem("rubix:active-clip-game", JSON.stringify(game));
    const onSaved = (event: Event) => {
      const detail = (event as CustomEvent<{ gameId: string; clip: GameClip }>).detail;
      if (detail?.gameId !== game.id || !detail.clip) return;
      setClips((prev) => [detail.clip, ...prev.filter((c) => c.id !== detail.clip.id)]);
    };
    const onStatus = (event: Event) => {
      const detail = (event as CustomEvent<{ status: ClipBufferStatus }>).detail;
      if (detail?.status) setRecorderStatus(detail.status);
    };
    const onShared = () => {
      // Refresh shared clip list when a new upload finishes
      void loadSharedMap();
    };
    window.addEventListener("rubix:clip-saved", onSaved);
    window.addEventListener("rubix:clips-status", onStatus);
    window.addEventListener("rubix:shared-clip-ready", onShared);
    return () => {
      window.removeEventListener("rubix:clip-saved", onSaved);
      window.removeEventListener("rubix:clips-status", onStatus);
      window.removeEventListener("rubix:shared-clip-ready", onShared);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [game, setClips]);

  const loadSharedMap = async () => {
    if (!userId) return;
    const { data } = await supabase
      .from("shared_clips")
      .select("*")
      .eq("user_id", userId)
      .eq("game_key", game.id);
    const list = (data as SharedClip[]) ?? [];
    // Heuristic match: pair by title (caption) when possible, else by chronology.
    const map = new Map<string, SharedClip>();
    const localById = new Map(clips.map((c) => [c.id, c] as const));
    const remaining = [...list];
    for (const c of clips) {
      const title = c.caption ?? "";
      const idx = remaining.findIndex((s) => s.title === title);
      if (idx >= 0) { map.set(c.id, remaining[idx]); remaining.splice(idx, 1); }
    }
    setSharedByLocalId(map);
    void localById; // keep ref
  };

  useEffect(() => {
    void loadSharedMap();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, game.id, clips.length]);

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

  const onRename = async (id: string, newCaption: string) => {
    setClips((prev) => prev.map((c) => (c.id === id ? { ...c, caption: newCaption } : c)));
    try {
      await supabase.from("game_clips_user").update({ caption: newCaption }).eq("id", id);
    } catch {
      toast.error("Could not rename");
    }
  };

  const onDragStart = (e: DragEvent<HTMLDivElement>, c: GameClip) => {
    const shared = sharedByLocalId.get(c.id);
    if (!shared) return;
    e.dataTransfer.setData("application/x-rubix-clip", shared.share_slug);
    e.dataTransfer.setData("text/plain", shareLinkFor(shared.share_slug));
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
            {typeof window !== "undefined" && (window as any).rubix?.isElectron && (
              <Button
                size="sm"
                variant="secondary"
                className="rounded-xl"
                disabled={recorderStatus === "starting"}
                onClick={() => window.dispatchEvent(new CustomEvent("rubix:clips-arm"))}
              >
                {recorderStatus === "starting" ? (
                  <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                ) : (
                  <Radio className={cn("h-3.5 w-3.5 mr-1.5", recorderStatus === "recording" && "text-primary")} />
                )}
                {recorderStatus === "recording" ? "Armed" : "Arm recorder"}
              </Button>
            )}
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
            Press <kbd className="px-1 py-0.5 rounded bg-background border border-border font-mono text-[10px]">Arm recorder</kbd> once if Windows asks for capture access, then press <kbd className="px-1 py-0.5 rounded bg-background border border-border font-mono text-[10px]">F9</kbd> in-game to save the last 30 seconds.
          </p>
        )}
      </div>

      {clips.length === 0 ? (
        <div className="text-center py-10 text-sm text-muted-foreground">
          No clips yet.
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {clips.map((c) => {
            const shared = sharedByLocalId.get(c.id);
            return (
              <div
                key={c.id}
                className="space-y-1.5"
                draggable={!!shared}
                onDragStart={(e) => onDragStart(e, c)}
              >
                <div className="group relative">
                  {c.url ? (
                    <ClipPlayer src={c.url} className="aspect-video w-full" />
                  ) : (
                    <div className="aspect-video w-full rounded-xl bg-secondary" />
                  )}
                  {shared && (
                    <span className="absolute top-1.5 left-1.5 z-10 rounded-full bg-primary/90 text-primary-foreground text-[10px] font-medium px-2 py-0.5 backdrop-blur shadow">
                      Shared · {shared.visibility}
                    </span>
                  )}
                  <div className="absolute top-1.5 right-1.5 z-10 opacity-0 hover:opacity-100 group-hover:opacity-100 transition-opacity">
                    <ClipActionsMenu
                      clip={c}
                      gameKey={game.id}
                      gameTitle={game.title}
                      sharedClip={shared}
                      onShared={() => void loadSharedMap()}
                      onRename={onRename}
                      onDelete={() => onDelete(c)}
                      onDownload={() => onDownload(c)}
                    />
                  </div>
                </div>
                <div className="flex items-center justify-between px-1 text-[11px] text-muted-foreground">
                  <span className="font-medium text-foreground/80 truncate">
                    {c.caption || (c.duration_seconds ? `${c.duration_seconds}s clip` : "Clip")}
                  </span>
                  <span className="shrink-0 ml-2">{formatSize(c.size_bytes)}</span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
