import { useEffect, useRef } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

/**
 * Listens for auto-updater events from the Electron main process
 * and surfaces them to the user via toasts. Only active in Electron.
 *
 * Flow (silent + prompt-on-ready):
 *  - checking / not-available: silent
 *  - available: silent toast "Downloading update vX..."
 *  - downloading: silent (could show progress later)
 *  - downloaded: persistent toast with "Restart now" / "Later" actions
 *  - error: silent log (don't nag the user)
 */
export const UpdateNotifier = () => {
  const downloadedToastId = useRef<string | number | null>(null);

  useEffect(() => {
    const updater = window.rubix?.updater;
    if (!updater) return;

    const off = updater.onStatus((data) => {
      switch (data.status) {
        case "available":
          toast(`Update available — v${data.payload.version}`, {
            description: "Downloading in the background…",
          });
          break;

        case "downloaded": {
          // Dismiss any previous "downloaded" toast so we don't stack them
          if (downloadedToastId.current !== null) {
            toast.dismiss(downloadedToastId.current);
          }
          downloadedToastId.current = toast(
            `Update ready — v${data.payload.version}`,
            {
              description: "Restart RUBIX to install the latest version.",
              duration: Infinity,
              action: (
                <Button
                  size="sm"
                  onClick={() => {
                    void updater.install();
                  }}
                >
                  Restart now
                </Button>
              ),
            }
          );
          break;
        }

        case "error":
          // Quietly log — don't pester the user with auto-update errors
          console.warn("[updater] error:", data.payload.message);
          break;

        default:
          break;
      }
    });

    return () => {
      off?.();
    };
  }, []);

  return null;
};
