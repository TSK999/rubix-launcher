import { useEffect, useRef, useState } from "react";
import { CheckCircle2, Download, RefreshCw, RotateCw, Sparkles, XCircle } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Progress } from "@/components/ui/progress";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import type { UpdaterStatus } from "@/types/electron";

const AUTO_CHECK_KEY = "rubix:auto-check-updates";

export const getAutoCheckUpdates = () => {
  try {
    const v = localStorage.getItem(AUTO_CHECK_KEY);
    return v === null ? true : v === "true";
  } catch {
    return true;
  }
};

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

type LocalState =
  | { kind: "idle" }
  | { kind: "checking" }
  | { kind: "available"; version: string }
  | { kind: "not-available"; version?: string }
  | { kind: "downloading"; percent: number; bytesPerSecond: number; transferred: number; total: number }
  | { kind: "downloaded"; version: string }
  | { kind: "error"; message: string };

export const UpdatesPanel = () => {
  const isElectron = typeof window !== "undefined" && Boolean(window.rubix?.updater);
  const [appVersion, setAppVersion] = useState<string>("");
  const [autoCheck, setAutoCheckState] = useState<boolean>(getAutoCheckUpdates());
  const [state, setState] = useState<LocalState>({ kind: "idle" });
  const [busy, setBusy] = useState(false);
  const [confirmRestartOpen, setConfirmRestartOpen] = useState(false);
  const lastCheckedRef = useRef<Date | null>(null);
  const [lastChecked, setLastChecked] = useState<Date | null>(null);

  useEffect(() => {
    if (!isElectron) return;
    void window.rubix!.updater.getVersion().then((r) => setAppVersion(r.version));

    const off = window.rubix!.updater.onStatus((data: UpdaterStatus) => {
      switch (data.status) {
        case "checking":
          setState({ kind: "checking" });
          break;
        case "available":
          setState({ kind: "available", version: data.payload.version });
          break;
        case "not-available":
          setState({ kind: "not-available", version: data.payload?.version });
          lastCheckedRef.current = new Date();
          setLastChecked(lastCheckedRef.current);
          break;
        case "downloading":
          setState({ kind: "downloading", ...data.payload });
          break;
        case "downloaded":
          setState({ kind: "downloaded", version: data.payload.version });
          lastCheckedRef.current = new Date();
          setLastChecked(lastCheckedRef.current);
          break;
        case "error":
          setState({ kind: "error", message: data.payload.message });
          break;
      }
    });
    return () => {
      off?.();
    };
  }, [isElectron]);

  const setAutoCheck = (v: boolean) => {
    setAutoCheckState(v);
    try {
      localStorage.setItem(AUTO_CHECK_KEY, String(v));
    } catch {
      /* ignore */
    }
    toast(v ? "Auto-check enabled" : "Auto-check disabled", {
      description: v
        ? "RUBIX will check for updates in the background."
        : "Updates will only be checked manually.",
    });
  };

  const checkNow = async () => {
    if (!isElectron) return;
    setBusy(true);
    setState({ kind: "checking" });
    try {
      const result = await window.rubix!.updater.check();
      if (!result.ok) {
        setState({ kind: "error", message: result.error ?? "Update check failed" });
      }
      lastCheckedRef.current = new Date();
      setLastChecked(lastCheckedRef.current);
    } finally {
      setBusy(false);
    }
  };

  const restart = async () => {
    if (!isElectron) return;
    await window.rubix!.updater.install();
  };

  if (!isElectron) {
    return (
      <div className="rounded-2xl rubix-glass rubix-card-hi p-4">
        <div className="flex items-start gap-3">
          <Sparkles className="mt-0.5 h-5 w-5 text-primary" />
          <div>
            <p className="text-sm font-medium">Updates</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Update controls are only available in the RUBIX desktop launcher.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="rounded-2xl rubix-glass rubix-card-hi p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-sm font-medium">RUBIX Launcher</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Current version: <span className="font-mono">{appVersion || "—"}</span>
            </p>
            {lastChecked && (
              <p className="mt-0.5 text-[11px] text-muted-foreground">
                Last checked {lastChecked.toLocaleTimeString()}
              </p>
            )}
          </div>
          <Button
            size="sm"
            variant="outline"
            className="rounded-xl"
            disabled={busy || state.kind === "checking" || state.kind === "downloading"}
            onClick={checkNow}
          >
            <RefreshCw className={`mr-2 h-4 w-4 ${state.kind === "checking" ? "animate-spin" : ""}`} />
            Check now
          </Button>
        </div>

        <div className="mt-4">
          <StatusBlock state={state} onRestart={() => setConfirmRestartOpen(true)} />
        </div>
      </div>

      <div className="rounded-2xl rubix-glass rubix-card-hi p-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-sm font-medium">Auto-check for updates</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Automatically check and download updates in the background.
            </p>
          </div>
          <Switch checked={autoCheck} onCheckedChange={setAutoCheck} aria-label="Toggle auto-update" />
        </div>
      </div>

      <AlertDialog open={confirmRestartOpen} onOpenChange={setConfirmRestartOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Restart RUBIX to install update?</AlertDialogTitle>
            <AlertDialogDescription>
              RUBIX will close and relaunch to apply the update. Make sure any unsaved work
              (messages, forms, in-progress actions) is finished before continuing.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Not now</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setConfirmRestartOpen(false);
                void restart();
              }}
            >
              Restart & install
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

const StatusBlock = ({ state, onRestart }: { state: LocalState; onRestart: () => void }) => {
  switch (state.kind) {
    case "idle":
      return (
        <p className="text-xs text-muted-foreground">
          Press <span className="font-medium text-foreground">Check now</span> to look for a new version.
        </p>
      );
    case "checking":
      return (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <RefreshCw className="h-3.5 w-3.5 animate-spin" />
          Checking for updates…
        </div>
      );
    case "available":
      return (
        <div className="flex items-center gap-2 text-xs">
          <Download className="h-3.5 w-3.5 text-primary" />
          <span>
            Update <span className="font-mono">v{state.version}</span> available — downloading…
          </span>
        </div>
      );
    case "not-available":
      return (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
          You're on the latest version.
        </div>
      );
    case "downloading":
      return (
        <div className="space-y-2">
          <div className="flex items-center justify-between text-xs">
            <span className="flex items-center gap-2 font-medium">
              <Download className="h-3.5 w-3.5" />
              Downloading update… {state.percent}%
            </span>
            <span className="text-muted-foreground">{formatBytes(state.bytesPerSecond)}/s</span>
          </div>
          <Progress value={state.percent} className="h-2" />
          <div className="text-[11px] text-muted-foreground">
            {formatBytes(state.transferred)} / {formatBytes(state.total)}
          </div>
        </div>
      );
    case "downloaded":
      return (
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-xs">
            <Sparkles className="h-3.5 w-3.5 text-primary" />
            <span>
              Update <span className="font-mono">v{state.version}</span> ready to install.
            </span>
          </div>
          <Button size="sm" className="rounded-xl" onClick={onRestart}>
            <RotateCw className="mr-2 h-4 w-4" />
            Restart & install
          </Button>
        </div>
      );
    case "error":
      return (
        <div className="flex items-center gap-2 text-xs text-destructive">
          <XCircle className="h-3.5 w-3.5" />
          {state.message}
        </div>
      );
  }
};
