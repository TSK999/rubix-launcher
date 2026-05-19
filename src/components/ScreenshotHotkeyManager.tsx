import { useEffect } from "react";
import { toast } from "sonner";
import { useRubixAuth } from "@/hooks/useRubixAuth";
import { uploadScreenshot } from "@/lib/game-user-data";
import { STORAGE_KEY, type Game } from "@/lib/game-types";

const dataUrlToBlob = (dataUrl: string): Blob => {
  const [meta, b64] = dataUrl.split(",");
  const mime = /data:(.*?);base64/.exec(meta)?.[1] ?? "image/png";
  const bin = atob(b64);
  const arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  return new Blob([arr], { type: mime });
};

const findMostRecentGame = (): Game | null => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const games = JSON.parse(raw) as Game[];
    const sorted = [...games].sort(
      (a, b) => (b.lastPlayedAt ?? 0) - (a.lastPlayedAt ?? 0),
    );
    return sorted[0] ?? null;
  } catch {
    return null;
  }
};

/**
 * Listens for Electron F12 screenshot captures and uploads them to the
 * most-recently-launched game's screenshot library.
 */
export const ScreenshotHotkeyManager = () => {
  const { user } = useRubixAuth();

  useEffect(() => {
    const api = (window as any).rubix;
    if (!api?.isElectron || !api.screenshots?.onCaptured) return;

    const off = api.screenshots.onCaptured(async (payload: {
      dataUrl: string;
      width: number;
      height: number;
    }) => {
      if (!user) {
        toast.error("Sign in to save screenshots");
        return;
      }
      const game = findMostRecentGame();
      if (!game) {
        toast.error("No recent game to attach the screenshot to");
        return;
      }
      try {
        const blob = dataUrlToBlob(payload.dataUrl);
        await uploadScreenshot(user.id, game.id, blob, {
          width: payload.width,
          height: payload.height,
          name: `screenshot-${Date.now()}.png`,
        });
        toast.success(`Screenshot saved to ${game.title}`);
      } catch (e) {
        toast.error("Could not save screenshot", {
          description: e instanceof Error ? e.message : undefined,
        });
      }
    });

    return () => {
      try {
        off?.();
      } catch {
        /* noop */
      }
    };
  }, [user]);

  return null;
};
