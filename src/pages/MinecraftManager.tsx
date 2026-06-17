import { useEffect, useState } from "react";
import { Sidebar } from "@/components/Sidebar";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Play, Plus, Package, Boxes, Loader2, ArrowLeft, Upload, AlertTriangle } from "lucide-react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import {
  isDesktop, listInstances, launch, importModpack, installMod,
  type Instance,
} from "@/lib/minecraft/bridge";
import { CreateInstanceWizard } from "@/components/minecraft/CreateInstanceWizard";
import { InstanceDetail } from "@/components/minecraft/InstanceDetail";
import { cfMcFile, formatBytes } from "@/lib/minecraft/api";

const LAST_KEY = "rubix:mc:last-instance";

export default function MinecraftManager() {
  const [instances, setInstances] = useState<Instance[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [launchingName, setLaunchingName] = useState<string | null>(null);
  const desktop = isDesktop();

  async function refresh() {
    setLoading(true);
    const r = await listInstances();
    if (r.ok) setInstances(r.instances);
    setLoading(false);
  }

  useEffect(() => { if (desktop) refresh(); else setLoading(false); }, [desktop]);

  useEffect(() => {
    if (!desktop) return;
    const last = localStorage.getItem(LAST_KEY);
    if (last && instances.some((i) => i.name === last)) setSelected(last);
  }, [instances, desktop]);

  useEffect(() => {
    if (selected) localStorage.setItem(LAST_KEY, selected);
  }, [selected]);

  async function quickLaunch(name: string) {
    setLaunchingName(name);
    const r = await launch(name);
    setLaunchingName(null);
    if (r.ok) toast.success(`Launched ${name}`);
    else toast.error(r.error || "Launch failed");
  }

  async function handleImportModpack() {
    const r = await importModpack();
    if (!r.ok) {
      if (!(r as any).canceled) toast.error(r.error || "Import failed");
      return;
    }
    toast.success(`Created "${r.instance}" — downloading mods…`);
    const files = (r as any).files as Array<{ projectID: number; fileID: number; required: boolean }>;
    let installed = 0;
    for (const f of files) {
      try {
        const fr = await cfMcFile(f.projectID, f.fileID);
        const file = fr.file;
        if (!file?.downloadUrl) continue;
        await installMod({
          instance: (r as any).instance,
          projectId: f.projectID,
          fileId: f.fileID,
          fileName: file.fileName || `${f.fileID}.jar`,
          name: file.displayName || `mod-${f.projectID}`,
          downloadUrl: file.downloadUrl,
          dependencies: [],
        });
        installed++;
      } catch (_e) { /* skip */ }
    }
    toast.success(`Modpack ready (${installed}/${files.length} mods)`);
    await refresh();
    setSelected((r as any).instance);
  }

  return (
    <div className="min-h-screen bg-background text-foreground flex">
      <Sidebar />
      <main className="flex-1 p-6 max-w-6xl">
        <div className="flex items-center justify-between mb-6">
          <div>
            <Link to="/mods" className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1 mb-1">
              <ArrowLeft className="h-3 w-3" /> Mod Manager
            </Link>
            <h1 className="text-3xl font-bold">Minecraft</h1>
            <p className="text-sm text-muted-foreground">
              Multi-instance launcher with Fabric, Forge, NeoForge & Quilt support.
            </p>
          </div>
          {desktop && !selected && (
            <div className="flex gap-2">
              <Button variant="outline" onClick={handleImportModpack}>
                <Upload className="h-4 w-4 mr-2" /> Import Modpack
              </Button>
              <Button onClick={() => setShowCreate(true)}>
                <Plus className="h-4 w-4 mr-2" /> Create Instance
              </Button>
            </div>
          )}
        </div>

        {!desktop && (
          <Card className="p-8 text-center">
            <AlertTriangle className="h-10 w-10 mx-auto mb-3 text-amber-500" />
            <h3 className="font-semibold mb-1">Desktop app required</h3>
            <p className="text-sm text-muted-foreground">
              Minecraft instance management needs the RUBIX desktop app.
            </p>
          </Card>
        )}

        {desktop && loading && (
          <div className="p-10 text-center text-muted-foreground">
            <Loader2 className="h-6 w-6 animate-spin mx-auto" />
          </div>
        )}

        {desktop && !loading && !selected && instances.length === 0 && (
          <Card className="p-12 text-center">
            <Boxes className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
            <h3 className="text-xl font-semibold mb-1">No instances yet</h3>
            <p className="text-sm text-muted-foreground mb-6">
              Create your first Minecraft instance to start installing mods.
            </p>
            <div className="flex justify-center gap-2">
              <Button onClick={() => setShowCreate(true)}>
                <Plus className="h-4 w-4 mr-2" /> Create Instance
              </Button>
              <Button variant="outline" onClick={handleImportModpack}>
                <Upload className="h-4 w-4 mr-2" /> Import CurseForge Modpack
              </Button>
            </div>
          </Card>
        )}

        {desktop && !selected && instances.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {instances.map((inst) => (
              <Card
                key={inst.name}
                className="p-4 hover:bg-muted/40 cursor-pointer transition-colors"
                onClick={() => setSelected(inst.name)}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="font-semibold truncate">{inst.name}</div>
                    <div className="flex flex-wrap items-center gap-1.5 mt-1">
                      <Badge>{inst.loader}{inst.loaderVersion ? ` ${inst.loaderVersion}` : ""}</Badge>
                      <Badge variant="outline">MC {inst.mcVersion}</Badge>
                    </div>
                    <div className="text-xs text-muted-foreground mt-2 flex items-center gap-3">
                      <span className="inline-flex items-center gap-1"><Package className="h-3 w-3" />{inst.modCount} mods</span>
                      <span>{formatBytes(inst.sizeBytes)}</span>
                      {inst.lastPlayed && <span>Last: {new Date(inst.lastPlayed).toLocaleDateString()}</span>}
                    </div>
                  </div>
                  <Button
                    size="sm"
                    onClick={(e) => { e.stopPropagation(); quickLaunch(inst.name); }}
                    disabled={launchingName === inst.name}
                  >
                    {launchingName === inst.name ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
                  </Button>
                </div>
              </Card>
            ))}
          </div>
        )}

        {desktop && selected && (
          <InstanceDetail
            name={selected}
            onBack={() => setSelected(null)}
            onMutated={refresh}
          />
        )}

        <CreateInstanceWizard
          open={showCreate}
          onOpenChange={setShowCreate}
          onCreated={(name) => { refresh(); setSelected(name); }}
        />
      </main>
    </div>
  );
}
