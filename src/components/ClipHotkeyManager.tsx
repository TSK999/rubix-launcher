import { useEffect, useState } from "react";
import { toast } from "sonner";
import { useRubixAuth } from "@/hooks/useRubixAuth";
import { uploadClip } from "@/lib/game-clips";
import { clipBuffer, type ClipBufferStatus } from "@/lib/clip-buffer";
import { STORAGE_KEY, type Game } from "@/lib/game-types";

const findMostRecentGame = (): Game | null => {
  try {
    const active = localStorage.getItem("rubix:active-clip-game");
    if (active) return JSON.parse(active) as Game;
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const games = JSON.parse(raw) as Game[];
    return (
      [...games].sort(
        (a, b) => (b.lastPlayedAt ?? 0) - (a.lastPlayedAt ?? 0),
      )[0] ?? null
    );
  } catch {
    return null;
  }
};

/**
 * Boots the rolling clip buffer when running in Electron and a user is
 * signed in, then listens for the F9 hotkey to save the last 30s of
 * gameplay to the active game.
 */
export const ClipHotkeyManager = () => {
  const { user } = useRubixAuth();
  const [, setStatus] = useState<ClipBufferStatus>("idle");

  useEffect(() => {
    const api = (window as any).rubix;
    if (!api?.isElectron || !api.clips?.onSaveTrigger) return;
    if (!user) return;

    const unsubStatus = clipBuffer.subscribe((next) => {
      setStatus(next);
      window.dispatchEvent(
        new CustomEvent("rubix:clips-status", {
          detail: { status: next, error: clipBuffer.getLastError() },
        }),
      );
    });

    const startRecorder = async (preferDisplayMedia = false) => {
      try {
        await clipBuffer.start({ preferDisplayMedia });
        if (preferDisplayMedia) toast.success("Clip recorder armed");
      } catch (e) {
        toast.error("Clip recorder unavailable", {
          description: e instanceof Error ? e.message : undefined,
        });
      }
    };

    void startRecorder(false);

    const offSave = api.clips.onSaveTrigger(async () => {
      if (clipBuffer.getStatus() !== "recording") {
        await startRecorder(true);
      }
      if (clipBuffer.getStatus() !== "recording") {
        toast.error("Clip buffer not ready", {
          description: clipBuffer.getLastError() || "Open Clips and press Arm recorder once.",
        });
        return;
      }
      const game = findMostRecentGame();
      if (!game) {
        toast.error("No recent game to attach the clip to");
        return;
      }
      try {
        const clip = await clipBuffer.saveClip(30);
        toast.loading(`Saving ${clip.durationSeconds}s clip…`, { id: "clip-save" });
        const saved = await uploadClip(user.id, game.id, clip.blob, {
          duration_seconds: clip.durationSeconds,
          width: clip.width,
          height: clip.height,
        });
        window.dispatchEvent(new CustomEvent("rubix:clip-saved", { detail: { gameId: game.id, clip: saved } }));
        toast.success(`Clip saved to ${game.title}`, { id: "clip-save" });
      } catch (e) {
        toast.error("Could not save clip", {
          id: "clip-save",
          description: e instanceof Error ? e.message : undefined,
        });
      }
    });

    const onArm = () => void startRecorder(true);
    window.addEventListener("rubix:clips-arm", onArm);

    return () => {
      offSave?.();
      window.removeEventListener("rubix:clips-arm", onArm);
      unsubStatus();
      clipBuffer.stop();
    };
  }, [user]);

  return null;
};
