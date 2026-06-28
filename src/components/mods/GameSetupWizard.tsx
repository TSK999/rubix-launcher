import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2, FolderOpen, Wand2, CheckCircle2, AlertTriangle, FolderSearch, Cog } from "lucide-react";
import { toast } from "sonner";
import { adapterToGameDefinition, getAdapterOrFallback, normalizeLauncherName, type ModAdapter } from "@/lib/mod-adapters";
import { setupGame, verifyLoader } from "@/lib/mods/strategies";


type Candidate = {
  source: string;
  path: string;
  valid: boolean;
  matched: string | null;
};

type SetupModsBridge = {
  autoDetect: (adapter: {
    steamAppId?: number;
    signatureFiles: string[];
    userPathHints: string[];
  }) => Promise<{ ok: boolean; candidates: Candidate[]; error?: string }>;
  validatePath: (payload: {
    path: string;
    signatureFiles: string[];
  }) => Promise<{ ok: boolean; matched?: string | null; reason?: string }>;
  setFolder: (
    gameKey: string,
    path: string,
  ) => Promise<{ ok: boolean; gameDataDir?: string; error?: string }>;
  pickFolder: (
    gameKey: string,
    title?: string,
    mode?: "ksp" | "root",
  ) => Promise<{ ok: boolean; gameDataDir?: string; canceled?: boolean; error?: string }>;
};

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  storageKey: string;
  provider: ModAdapter["provider"];
  slug: string;
  title: string;
  currentPath: string | null;
  onConfigured: (path: string) => void;
};

const isElectron = () =>
  typeof window !== "undefined" && window.rubix?.isElectron === true;

const getSetupModsBridge = () =>
  (typeof window !== "undefined" ? window.rubix?.mods : null) as SetupModsBridge | null;

export function GameSetupWizard({
  open,
  onOpenChange,
  storageKey,
  provider,
  slug,
  title,
  currentPath,
  onConfigured,
}: Props) {
  const adapter = getAdapterOrFallback(storageKey, provider, slug, title);
  const [scanning, setScanning] = useState(false);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [applying, setApplying] = useState<string | null>(null);
  const [scanned, setScanned] = useState(false);
  const [loaderStatus, setLoaderStatus] = useState<
    | { state: "idle" }
    | { state: "running"; message: string }
    | { state: "ok"; message: string }
    | { state: "error"; message: string }
  >({ state: "idle" });

  useEffect(() => {
    if (!open) {
      setCandidates([]);
      setScanned(false);
      setLoaderStatus({ state: "idle" });
    }
  }, [open]);

  // Run strategy.setup() then verifyLoader() through the unified dispatcher.
  // This bootstraps BepInEx / MelonLoader / SMAPI / etc. whenever the
  // chosen strategy needs it; for plain folder-injection games it's a no-op.
  async function runStrategySetup(path: string): Promise<boolean> {
    const game = adapterToGameDefinition(adapter, path);
    setLoaderStatus({ state: "running", message: `Preparing ${adapter.loaderLabel}…` });
    const setupRes = await setupGame(game);
    if (!setupRes.ok) {
      setLoaderStatus({ state: "error", message: setupRes.error || "Loader setup failed" });
      toast.error(`${adapter.loaderLabel} setup failed`, { description: setupRes.error });
      return false;
    }
    const verifyRes = await verifyLoader(game);
    if (!verifyRes.ok) {
      setLoaderStatus({ state: "error", message: verifyRes.error || "Loader not detected" });
      toast.warning(`${adapter.loaderLabel} could not be verified`, { description: verifyRes.error });
      return false;
    }
    const v = verifyRes.data?.version ? ` (${verifyRes.data.version})` : "";
    setLoaderStatus({ state: "ok", message: `${adapter.loaderLabel}${v} ready` });
    return true;
  }


  async function runAutoDetect() {
    const mods = getSetupModsBridge();
    if (!isElectron() || !mods) {
      toast.error("Auto Detect is only available in the desktop app");
      return;
    }
    setScanning(true);
    setCandidates([]);
    const found: Candidate[] = [];
    try {
      // 1) Steam + user-path hints come from the Electron main.
      const native = await mods.autoDetect({
        steamAppId: adapter.steamAppId,
        signatureFiles: adapter.signatureFiles,
        userPathHints: adapter.userPathHints ?? [],
      });
      if (native?.ok && Array.isArray(native.candidates)) {
        for (const c of native.candidates) found.push(c);
      }

      // 2) Cross-launcher scans (Epic / EA / Xbox / Riot). Name-matched against
      //    the adapter's launcherNameMatchers.
      const matchers = (adapter.launcherNameMatchers ?? [])
        .map(normalizeLauncherName)
        .filter(Boolean);
      const nameMatches = (display: string, appName?: string) => {
        const a = normalizeLauncherName(display);
        const b = appName ? normalizeLauncherName(appName) : "";
        return matchers.some((m) => (a && a.includes(m)) || (b && b.includes(m)));
      };

      const scanAll = await Promise.allSettled([
        window.rubix.epic.scanInstalled(),
        window.rubix.ea.scanInstalled(),
        window.rubix.xbox.scanInstalled(),
        window.rubix.riot.scanInstalled(),
      ]);
      const labels = ["Epic Games", "EA app", "Xbox / PC Game Pass", "Riot"];
      scanAll.forEach((r, i) => {
        if (r.status !== "fulfilled" || !r.value?.ok) return;
        for (const g of r.value.games as any[]) {
          if (!g?.installLocation) continue;
          const display = g.displayName || g.appName || "";
          if (!nameMatches(display, g.appName)) continue;
          found.push({
            source: labels[i],
            path: g.installLocation,
            valid: true, // launcher said it's installed
            matched: null,
          });
        }
      });

      // Validate every candidate against signature files (re-validates
      // launcher candidates too so the user sees a clear status).
      const validated: Candidate[] = [];
      for (const c of found) {
        try {
          const v = await mods.validatePath({
            path: c.path,
            signatureFiles: adapter.signatureFiles,
          });
          validated.push({
            source: c.source,
            path: c.path,
            valid: !!v?.ok || c.valid,
            matched: v?.matched ?? c.matched ?? null,
          });
        } catch {
          validated.push(c);
        }
      }

      // De-dupe by path, prefer valid > invalid.
      const byPath = new Map<string, Candidate>();
      for (const c of validated) {
        const prev = byPath.get(c.path);
        if (!prev || (!prev.valid && c.valid)) byPath.set(c.path, c);
      }
      setCandidates(Array.from(byPath.values()));
    } finally {
      setScanning(false);
      setScanned(true);
    }
  }

  async function apply(path: string) {
    const mods = getSetupModsBridge();
    if (!mods) return;
    setApplying(path);
    const r = await mods.setFolder(storageKey, path);
    if (!r.ok || !r.gameDataDir) {
      setApplying(null);
      toast.error("Couldn't save folder", { description: r.error });
      return;
    }
    const resolved = r.gameDataDir;
    const loaderOk = await runStrategySetup(resolved);
    setApplying(null);
    toast.success(`${title} configured`, { description: resolved });
    onConfigured(resolved);
    if (loaderOk) onOpenChange(false);
  }

  async function browse() {
    const mods = getSetupModsBridge();
    if (!mods) return;
    const r = await mods.pickFolder(
      storageKey,
      `Select ${title} ${adapter.folderLabel}`,
      adapter.pickerMode,
    );
    if (!r.ok) {
      if (!r.canceled && r.error) toast.error("Browse failed", { description: r.error });
      return;
    }
    const chosen = r.gameDataDir!;
    const v = await mods.validatePath({
      path: chosen,
      signatureFiles: adapter.signatureFiles,
    });
    if (v?.ok) {
      toast.success(`${title} configured`, { description: chosen });
    } else {
      toast.warning("Folder saved, but couldn't verify game files", {
        description: v?.reason || "No expected game files found in that folder.",
      });
    }
    const loaderOk = await runStrategySetup(chosen);
    onConfigured(chosen);
    if (loaderOk) onOpenChange(false);
  }


  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FolderSearch className="h-5 w-5 text-primary" />
            Set up {title} for modding
          </DialogTitle>
          <DialogDescription>
            Before any mods can be installed, RUBIX needs to know where {title} lives.
            Loader: <span className="font-medium text-foreground">{adapter.loaderLabel}</span>.
            Mods will be placed in{" "}
            <code className="rounded bg-muted px-1 py-0.5 text-xs">
              {adapter.installSubdir || adapter.folderLabel}
            </code>
            .
          </DialogDescription>
        </DialogHeader>

        {currentPath && (
          <div className="rounded-md border bg-muted/30 p-3 text-xs">
            <div className="mb-1 text-muted-foreground">Currently configured:</div>
            <code className="break-all">{currentPath}</code>
          </div>
        )}

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Card className="flex flex-col gap-2 p-4">
            <div className="flex items-center gap-2">
              <Wand2 className="h-4 w-4 text-primary" />
              <h4 className="text-sm font-semibold">Auto Detect</h4>
            </div>
            <p className="text-xs text-muted-foreground">
              Scans Steam, Epic, EA app, Xbox / PC Game Pass and default install
              locations.
            </p>
            <Button
              size="sm"
              onClick={runAutoDetect}
              disabled={scanning || !isElectron()}
              className="mt-auto"
            >
              {scanning ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Scanning…
                </>
              ) : (
                <>
                  <Wand2 className="mr-2 h-4 w-4" /> Run auto detect
                </>
              )}
            </Button>
          </Card>

          <Card className="flex flex-col gap-2 p-4">
            <div className="flex items-center gap-2">
              <FolderOpen className="h-4 w-4 text-primary" />
              <h4 className="text-sm font-semibold">Browse Folder</h4>
            </div>
            <p className="text-xs text-muted-foreground">
              Pick the {adapter.folderLabel} yourself.
            </p>
            <Button
              size="sm"
              variant="outline"
              onClick={browse}
              disabled={!isElectron()}
              className="mt-auto"
            >
              <FolderOpen className="mr-2 h-4 w-4" /> Browse…
            </Button>
          </Card>
        </div>

        {scanned && (
          <div className="space-y-2">
            <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Detected installs
            </h4>
            {candidates.length === 0 ? (
              <Card className="flex items-center gap-2 border-dashed p-3 text-xs text-muted-foreground">
                <AlertTriangle className="h-4 w-4" />
                No installs found. Try Browse Folder instead.
              </Card>
            ) : (
              <div className="space-y-2">
                {candidates.map((c) => (
                  <Card
                    key={c.path}
                    className="flex flex-wrap items-center gap-2 p-3 text-sm"
                  >
                    <Badge variant="outline" className="text-[10px]">
                      {c.source}
                    </Badge>
                    {c.valid ? (
                      <Badge className="bg-emerald-500/15 text-emerald-400 hover:bg-emerald-500/15 text-[10px]">
                        <CheckCircle2 className="mr-1 h-3 w-3" /> Verified
                      </Badge>
                    ) : (
                      <Badge variant="secondary" className="text-[10px]">
                        <AlertTriangle className="mr-1 h-3 w-3" /> Unverified
                      </Badge>
                    )}
                    <code className="flex-1 truncate text-xs">{c.path}</code>
                    <Button
                      size="sm"
                      onClick={() => apply(c.path)}
                      disabled={applying === c.path}
                    >
                      {applying === c.path ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        "Use this"
                      )}
                    </Button>
                  </Card>
                ))}
              </div>
            )}
          </div>
        )}

        {loaderStatus.state !== "idle" && (
          <div
            className={
              "flex items-center gap-2 rounded-md border p-3 text-xs " +
              (loaderStatus.state === "ok"
                ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300"
                : loaderStatus.state === "error"
                ? "border-destructive/40 bg-destructive/10 text-destructive"
                : "border-border bg-muted/30 text-muted-foreground")
            }
          >
            {loaderStatus.state === "running" ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : loaderStatus.state === "ok" ? (
              <CheckCircle2 className="h-4 w-4" />
            ) : loaderStatus.state === "error" ? (
              <AlertTriangle className="h-4 w-4" />
            ) : (
              <Cog className="h-4 w-4" />
            )}
            <span>{loaderStatus.message}</span>
          </div>
        )}

          <div className="rounded-md border border-dashed bg-muted/30 p-3 text-xs text-muted-foreground">
            One-click setup is only available in the RUBIX desktop app.
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
