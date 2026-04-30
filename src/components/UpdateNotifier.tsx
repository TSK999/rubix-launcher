import { useEffect, useRef } from "react";
import { toast } from "sonner";
import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { getAutoCheckUpdates } from "@/components/UpdatesPanel";

const formatBytes = (bytes: number) => {
  if (!bytes || bytes < 1024) return `${bytes || 0} B`;
  const units = ["KB", "MB", "GB"];
  let v = bytes / 1024;
  let u = 0;
  while (v >= 1024 && u < units.length - 1) {
    v /= 1024;
    u++;
  }
  return `${v.toFixed(1)} ${units[u]}`;
};

/**
 * Listens for auto-updater events from the Electron main process
 * and surfaces them to the user via toasts. Only active in Electron.
 */
export const UpdateNotifier = () => {
  const progressToastId = useRef<string | number | null>(null);
  const downloadedToastId = useRef<string | number | null>(null);

  useEffect(() => {
    const updater = window.rubix?.updater;
    if (!updater) return;

    const off = updater.onStatus((data) => {
      switch (data.status) {
        case "available":
          toast(`Update available — v${data.payload.version}`, {
            description: "Starting download…",
          });
          break;

        case "downloading": {
          const { percent, bytesPerSecond, transferred, total } = data.payload;
          const speed = `${formatBytes(bytesPerSecond)}/s`;
          const sizes = `${formatBytes(transferred)} / ${formatBytes(total)}`;

          const content = (
            <div className="flex w-full flex-col gap-2">
              <div className="flex items-center gap-2 text-sm font-medium">
                <Download className="h-4 w-4" />
                Downloading update… {percent}%
              </div>
              <Progress value={percent} className="h-2" />
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>{sizes}</span>
                <span>{speed}</span>
              </div>
            </div>
          );

          if (progressToastId.current === null) {
            progressToastId.current = toast(content, {
              duration: Infinity,
              dismissible: false,
            });
          } else {
            toast(content, {
              id: progressToastId.current,
              duration: Infinity,
              dismissible: false,
            });
          }
          break;
        }

        case "downloaded": {
          // Replace the progress toast with the "ready" toast
          if (progressToastId.current !== null) {
            toast.dismiss(progressToastId.current);
            progressToastId.current = null;
          }
          if (downloadedToastId.current !== null) {
            toast.dismiss(downloadedToastId.current);
          }
          downloadedToastId.current = toast.success(
            `Update ready — v${data.payload.version}`,
            {
              description: "Restart RUBIX to install and see what's new.",
              duration: Infinity,
              action: (
                <Button
                  size="sm"
                  onClick={() => {
                    void window.rubix?.updater.install();
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
