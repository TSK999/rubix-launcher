import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Slider } from "@/components/ui/slider";
import { Label } from "@/components/ui/label";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Play, FolderOpen, Trash2, Copy, Pencil, ArrowLeft, Loader2 } from "lucide-react";
import { toast } from "sonner";
import {
  getInstance, launch, openInstanceFolder, uninstallMod, toggleMod,
  deleteInstance, duplicateInstance, renameInstance, updateInstance,
  type Instance, type InstalledMod,
} from "@/lib/minecraft/bridge";
import { MinecraftModBrowser } from "./MinecraftModBrowser";
import { formatBytes } from "@/lib/minecraft/api";

type Props = {
  name: string;
  onBack: () => void;
  onMutated: () => void;
};

export function InstanceDetail({ name, onBack, onMutated }: Props) {
  const [inst, setInst] = useState<Instance | null>(null);
  const [installed, setInstalled] = useState<Record<string, InstalledMod>>({});
  const [loading, setLoading] = useState(true);
  const [launching, setLaunching] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [renameTo, setRenameTo] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);

  async function refresh() {
    setLoading(true);
    const r = await getInstance(name);
    if (r.ok && r.instance) {
      setInst(r.instance);
      setInstalled(r.installed || {});
    }
    setLoading(false);
  }
  useEffect(() => { refresh(); /* eslint-disable-next-line */ }, [name]);

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
    setLaunching(false);
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

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <Button variant="ghost" size="sm" onClick={onBack} className="mb-2">
            <ArrowLeft className="h-4 w-4 mr-1" /> All instances
          </Button>
          <h2 className="text-2xl font-bold">{inst.name}</h2>
          <div className="flex flex-wrap items-center gap-2 mt-1">
            <Badge>{inst.loader}{inst.loaderVersion ? ` ${inst.loaderVersion}` : ""}</Badge>
            <Badge variant="outline">MC {inst.mcVersion}</Badge>
            <Badge variant="outline">{inst.modCount} mod{inst.modCount === 1 ? "" : "s"}</Badge>
            <Badge variant="outline">{formatBytes(inst.sizeBytes)}</Badge>
            {inst.lastPlayed && (
              <span className="text-xs text-muted-foreground">
                Last played {new Date(inst.lastPlayed).toLocaleString()}
              </span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button onClick={doLaunch} disabled={launching} size="lg">
            {launching ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Play className="h-4 w-4 mr-2" />}
            Launch
          </Button>
        </div>
      </div>

      <div className="flex items-center gap-2 text-xs">
        <Button size="sm" variant="outline" onClick={() => openInstanceFolder(inst.name)}>
          <FolderOpen className="h-3.5 w-3.5 mr-1" /> Open folder
        </Button>
        <Button size="sm" variant="outline" onClick={handleDuplicate}>
          <Copy className="h-3.5 w-3.5 mr-1" /> Duplicate
        </Button>
        <Button size="sm" variant="outline" onClick={() => { setRenameTo(inst.name); setRenaming(true); }}>
          <Pencil className="h-3.5 w-3.5 mr-1" /> Rename
        </Button>
        <Button size="sm" variant="destructive" onClick={() => setConfirmDelete(true)}>
          <Trash2 className="h-3.5 w-3.5 mr-1" /> Delete
        </Button>
      </div>

      <Tabs defaultValue="browse">
        <TabsList>
          <TabsTrigger value="browse">Browse Mods</TabsTrigger>
          <TabsTrigger value="installed">Installed ({Object.keys(installed).length})</TabsTrigger>
          <TabsTrigger value="settings">Settings</TabsTrigger>
        </TabsList>

        <TabsContent value="browse">
          <MinecraftModBrowser instance={inst} installedIds={installedIds} onChanged={refresh} />
        </TabsContent>

        <TabsContent value="installed" className="space-y-2">
          {Object.values(installed).length === 0 && (
            <div className="text-center py-10 text-muted-foreground text-sm">No mods installed yet.</div>
          )}
          {Object.values(installed).map((m) => (
            <Card key={m.projectId} className="p-3 flex items-center gap-3">
              <div className="flex-1 min-w-0">
                <div className="font-medium truncate">{m.name}</div>
                <div className="text-xs text-muted-foreground truncate">{m.fileName}</div>
              </div>
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-1 text-xs">
                  <Switch checked={m.enabled} onCheckedChange={(v) => handleToggle(m, v)} />
                  {m.enabled ? "On" : "Off"}
                </div>
                <Button size="sm" variant="ghost" onClick={() => handleUninstall(m)}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </Card>
          ))}
        </TabsContent>

        <TabsContent value="settings" className="space-y-4">
          <Card className="p-4 space-y-3">
            <div>
              <Label>RAM allocation ({inst.ramMb} MB)</Label>
              <Slider
                value={[inst.ramMb]}
                min={1024} max={16384} step={512}
                onValueChange={async ([v]) => {
                  const r = await updateInstance(inst.name, { ramMb: v });
                  if (r.ok) refresh();
                }}
              />
            </div>
            <div>
              <Label>Custom Java path</Label>
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
            <div className="text-xs text-muted-foreground">
              <b>Note:</b> launching opens the official Minecraft Launcher pointed at this instance's
              game directory. Mojang authentication and Java sandboxing remain handled by the
              official launcher.
            </div>
            {inst.installerPath && (
              <div className="text-xs text-muted-foreground">
                Loader installer cached at: <code>{inst.installerPath}</code>
              </div>
            )}
          </Card>
        </TabsContent>
      </Tabs>

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
