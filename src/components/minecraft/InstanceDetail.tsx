import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Slider } from "@/components/ui/slider";
import { Label } from "@/components/ui/label";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Play, FolderOpen, Trash2, Copy, Pencil, ArrowLeft, Loader2, Info } from "lucide-react";
import { toast } from "sonner";
import {
  getInstance, launch, openInstanceFolder, uninstallMod, toggleMod,
  deleteInstance, duplicateInstance, renameInstance, updateInstance,
  type Instance, type InstalledMod,
} from "@/lib/minecraft/bridge";
import { MinecraftModBrowser } from "./MinecraftModBrowser";
import { MinecraftPackBrowser } from "./MinecraftPackBrowser";
import { MinecraftAccountBadge } from "./MinecraftAccountBadge";
import { MinecraftLaunchProgress } from "./MinecraftLaunchProgress";
import { formatBytes } from "@/lib/minecraft/api";
import { cn } from "@/lib/utils";

const TABS = [
  { id: "browse", label: "Browse Mods" },
  { id: "resourcepacks", label: "Resource Packs" },
  { id: "shaders", label: "Shader Packs" },
  { id: "installed", label: "Installed" },
  { id: "settings", label: "Settings" },
] as const;
type TabId = typeof TABS[number]["id"];


type Props = {
  name: string;
  onBack: () => void;
  onMutated: () => void;
  /** When set, InstanceDetail skips the desktop bridge and renders this
   * instance directly. Used by the web preview so users can browse the UI. */
  demoInstance?: Instance;
};

export function InstanceDetail({ name, onBack, onMutated, demoInstance }: Props) {
  const [inst, setInst] = useState<Instance | null>(null);
  const [installed, setInstalled] = useState<Record<string, InstalledMod>>({});
  const [loading, setLoading] = useState(true);
  const [launching, setLaunching] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [renameTo, setRenameTo] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [hasAccount, setHasAccount] = useState<boolean>(false);
  const [tab, setTab] = useState<TabId>("browse");
  const isDemo = !!demoInstance;

  async function refresh() {
    if (demoInstance) {
      setInst(demoInstance);
      setInstalled({});
      setLoading(false);
      return;
    }
    setLoading(true);
    const r = await getInstance(name);
    if (r.ok && r.instance) {
      setInst(r.instance);
      setInstalled(r.installed || {});
    }
    setLoading(false);
  }
  useEffect(() => { refresh(); /* eslint-disable-next-line */ }, [name, demoInstance?.name]);

  if (loading || !inst) {
    return (
      <div className="p-6 text-center text-muted-foreground">
        <Loader2 className="h-6 w-6 animate-spin mx-auto mb-2" /> Loading instance…
      </div>
    );
  }

  const installedIds = new Set(Object.values(installed).map((m) => m.projectId));

  async function doLaunch() {
    setLaunching(true);
    const r = await launch(inst!.name);
    // Keep the progress banner visible for a moment after success/failure.
    setTimeout(() => setLaunching(false), r.ok ? 4000 : 1500);
    if (r.ok) toast.success(`Launched ${inst!.name}`);
    else toast.error(r.error || "Launch failed");
  }

  async function handleDelete() {
    const r = await deleteInstance(inst!.name);
    if (r.ok) { toast.success("Deleted"); onMutated(); onBack(); }
    else toast.error(r.error || "Delete failed");
  }

  async function handleDuplicate() {
    const newName = `${inst!.name} copy`;
    const r = await duplicateInstance(inst!.name, newName);
    if (r.ok) { toast.success(`Duplicated to "${newName}"`); onMutated(); }
    else toast.error(r.error || "Duplicate failed");
  }

  async function handleRename() {
    if (!renameTo.trim() || renameTo === inst!.name) { setRenaming(false); return; }
    const r = await renameInstance(inst!.name, renameTo.trim());
    if (r.ok) { toast.success("Renamed"); setRenaming(false); onMutated(); onBack(); }
    else toast.error(r.error || "Rename failed");
  }

  async function handleToggle(mod: InstalledMod, enabled: boolean) {
    const r = await toggleMod(inst!.name, mod.projectId, enabled);
    if (r.ok) refresh(); else toast.error(r.error || "Toggle failed");
  }

  async function handleUninstall(mod: InstalledMod) {
    const r = await uninstallMod(inst!.name, mod.projectId);
    if (r.ok) { toast.success(`Removed ${mod.name}`); refresh(); }
    else toast.error(r.error || "Uninstall failed");
  }

  const eyebrowChip = "px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest backdrop-blur";

  return (
    <div className="relative space-y-8">
      {/* Back link */}
      <button
        onClick={onBack}
        className="group inline-flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors"
      >
        <ArrowLeft className="h-3.5 w-3.5 transition-transform group-hover:-translate-x-0.5" />
        <span className="text-[10px] uppercase tracking-[0.25em] font-black">All instances</span>
      </button>

      {/* Hero header */}
      <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-6">
        <div className="space-y-4 min-w-0">
          <h1 className="text-5xl md:text-6xl font-black tracking-tighter bg-gradient-to-b from-foreground to-foreground/50 bg-clip-text text-transparent">
            {inst.name}
          </h1>
          <div className="flex flex-wrap items-center gap-2.5">
            <span className={cn(eyebrowChip, "bg-primary/10 border border-primary/30 text-primary")}>
              {inst.loader}{inst.loaderVersion ? ` ${inst.loaderVersion}` : ""}
            </span>
            <span className={cn(eyebrowChip, "bg-card/40 border border-border/50 text-muted-foreground")}>
              MC {inst.mcVersion}
            </span>
            <span className={cn(eyebrowChip, "bg-card/40 border border-border/50 text-muted-foreground")}>
              {inst.modCount} mod{inst.modCount === 1 ? "" : "s"}
            </span>
            <span className={cn(eyebrowChip, "bg-card/40 border border-border/50 text-muted-foreground")}>
              {formatBytes(inst.sizeBytes)}
            </span>
            {inst.lastPlayed && (
              <span className="text-[11px] uppercase tracking-wider text-muted-foreground/70 font-medium ml-1">
                Last played {new Date(inst.lastPlayed).toLocaleString()}
              </span>
            )}
          </div>
        </div>

        <div className="flex items-center gap-3 shrink-0">
          {!isDemo && <MinecraftAccountBadge onAccount={(a) => setHasAccount(!!a)} />}
          <button
            onClick={doLaunch}
            disabled={launching || (!isDemo && !hasAccount)}
            title={isDemo ? "Launching requires the RUBIX desktop app" : (!hasAccount ? "Sign in with Microsoft first" : "")}
            className="relative group disabled:opacity-60 disabled:cursor-not-allowed"
          >
            <div className="absolute -inset-1 bg-gradient-to-r from-primary to-fuchsia-500 rounded-2xl blur-md opacity-40 group-hover:opacity-75 group-disabled:opacity-20 transition duration-500" />
            <div className="relative px-10 py-4 bg-gradient-to-r from-primary to-fuchsia-500 rounded-2xl font-black text-primary-foreground text-base flex items-center gap-3 transition-transform group-active:scale-95">
              {launching
                ? <Loader2 className="h-5 w-5 animate-spin" />
                : <Play className="h-5 w-5 fill-current" />}
              <span className="uppercase tracking-widest text-sm">Launch</span>
            </div>
          </button>
        </div>
      </div>

      {isDemo && (
        <div className="w-full p-4 rounded-2xl bg-card/40 border border-border/50 backdrop-blur-xl flex items-center gap-4">
          <div className="flex-shrink-0 grid place-items-center w-10 h-10 rounded-xl bg-primary/10 border border-primary/20">
            <Info className="h-4 w-4 text-primary" />
          </div>
          <p className="text-sm text-muted-foreground leading-relaxed">
            <span className="text-foreground font-bold uppercase tracking-wider mr-2 text-[11px]">Web preview</span>
            This is a demo instance for exploring the UI. Install the <span className="text-primary font-bold underline decoration-primary/40 underline-offset-4">RUBIX desktop app</span> to launch, mod, and manage real instances.
          </p>
        </div>
      )}

      <MinecraftLaunchProgress active={launching} />

      {/* Action toolbar */}
      <div className="flex flex-wrap items-center gap-2.5">
        <ActionButton icon={<FolderOpen className="h-4 w-4" />} onClick={() => openInstanceFolder(inst.name)}>
          Open folder
        </ActionButton>
        <ActionButton icon={<Copy className="h-4 w-4" />} onClick={handleDuplicate}>
          Duplicate
        </ActionButton>
        <ActionButton icon={<Pencil className="h-4 w-4" />} onClick={() => { setRenameTo(inst.name); setRenaming(true); }}>
          Rename
        </ActionButton>
        <button
          onClick={() => setConfirmDelete(true)}
          className="ml-auto flex items-center gap-2.5 px-5 py-3 rounded-xl bg-destructive/10 border border-destructive/30 text-[11px] font-black uppercase tracking-[0.1em] text-destructive hover:bg-destructive/20 transition-all"
        >
          <Trash2 className="h-4 w-4" />
          Delete
        </button>
      </div>

      {/* Custom pill tabs */}
      <div className="space-y-6">
        <div className="flex flex-wrap p-1.5 rounded-[22px] bg-card/40 border border-border/50 backdrop-blur-xl w-fit gap-1">
          {TABS.map((t) => {
            const active = tab === t.id;
            const label = t.id === "installed" ? `Installed (${Object.keys(installed).length})` : t.label;
            return (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={cn(
                  "px-6 py-2.5 rounded-[16px] text-[11px] font-black uppercase tracking-widest transition-all",
                  active
                    ? "bg-primary text-primary-foreground shadow-xl shadow-primary/30"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {label}
              </button>
            );
          })}
        </div>

        {tab === "browse" && (
          <MinecraftModBrowser instance={inst} installedIds={installedIds} onChanged={refresh} />
        )}

        {tab === "resourcepacks" && (
          <MinecraftPackBrowser instance={inst} kind="resourcepack" />
        )}

        {tab === "shaders" && (
          <MinecraftPackBrowser instance={inst} kind="shader" />
        )}

        {tab === "installed" && (
          <div className="space-y-2">
            {Object.values(installed).length === 0 && (
              <div className="text-center py-16 text-muted-foreground text-sm rounded-2xl border border-dashed border-border/50 bg-card/20">
                No mods installed yet.
              </div>
            )}
            {Object.values(installed).map((m) => (
              <Card key={m.projectId} className="p-4 flex items-center gap-4 rounded-2xl bg-card/40 border-border/50 backdrop-blur-xl">
                <div className="flex-1 min-w-0">
                  <div className="font-semibold truncate">{m.name}</div>
                  <div className="text-xs text-muted-foreground truncate">{m.fileName}</div>
                </div>
                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-widest font-bold text-muted-foreground">
                    <Switch checked={m.enabled} onCheckedChange={(v) => handleToggle(m, v)} />
                    {m.enabled ? "On" : "Off"}
                  </div>
                  <Button size="sm" variant="ghost" onClick={() => handleUninstall(m)}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </Card>
            ))}
          </div>
        )}

        {tab === "settings" && (
          <Card className="p-6 space-y-5 rounded-2xl bg-card/40 border-border/50 backdrop-blur-xl">
            <div className="space-y-2">
              <Label className="text-[11px] uppercase tracking-widest font-black text-muted-foreground">
                RAM allocation · {inst.ramMb} MB
              </Label>
              <Slider
                value={[inst.ramMb]}
                min={1024} max={16384} step={512}
                onValueChange={async ([v]) => {
                  const r = await updateInstance(inst.name, { ramMb: v });
                  if (r.ok) refresh();
                }}
              />
            </div>
            <div className="space-y-2">
              <Label className="text-[11px] uppercase tracking-widest font-black text-muted-foreground">
                Custom Java path
              </Label>
              <Input
                defaultValue={inst.javaPath}
                onBlur={async (e) => {
                  const r = await updateInstance(inst.name, { javaPath: e.target.value || "java" });
                  if (r.ok) toast.success("Saved");
                }}
              />
              <p className="text-xs text-muted-foreground mt-1">
                Leave as <code>java</code> to use system Java.
              </p>
            </div>
            <div className="text-xs text-muted-foreground border-t border-border/50 pt-4">
              <b>Note:</b> RUBIX runs Minecraft directly — no external launcher required.
              Missing assets, libraries, loader jars, and (if needed) a Java runtime are
              downloaded automatically on first launch and shared across instances.
            </div>
            {inst.installerPath && (
              <div className="text-xs text-muted-foreground">
                Loader installer cached at: <code>{inst.installerPath}</code>
              </div>
            )}
          </Card>
        )}
      </div>


      <AlertDialog open={renaming} onOpenChange={setRenaming}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Rename instance</AlertDialogTitle>
            <AlertDialogDescription>Choose a new name for "{inst.name}".</AlertDialogDescription>
          </AlertDialogHeader>
          <Input value={renameTo} onChange={(e) => setRenameTo(e.target.value)} />
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleRename}>Rename</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete "{inst.name}"?</AlertDialogTitle>
            <AlertDialogDescription>
              This removes the instance folder and all of its mods, configs, and saves. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
