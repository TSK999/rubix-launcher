import { useEffect, useState } from "react";
import { Sidebar } from "@/components/Sidebar";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Play, Plus, Package, Boxes, Loader2, ArrowLeft, Upload, Clock, HardDrive, Sparkles } from "lucide-react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import {
  isDesktop, listInstances, launch, importModpack, installMod,
  type Instance,
} from "@/lib/minecraft/bridge";
import { CreateInstanceWizard } from "@/components/minecraft/CreateInstanceWizard";
import { InstanceDetail } from "@/components/minecraft/InstanceDetail";
import { cfMcFile, formatBytes } from "@/lib/minecraft/api";
import { cn } from "@/lib/utils";

const LAST_KEY = "rubix:mc:last-instance";

// Demo data so the page is browsable (and stylable) in the web preview,
// without pretending you can actually launch Minecraft from a browser.
const DEMO_INSTANCES: Instance[] = [
  {
    name: "Fabric 1.21.9", mcVersion: "1.21.9", loader: "Fabric", loaderVersion: "0.19.3",
    createdAt: new Date().toISOString(), lastPlayed: new Date().toISOString(),
    ramMb: 4096, javaPath: "", dir: "", modCount: 0, sizeBytes: 31 * 1024 * 1024,
  },
  {
    name: "Forge 1.21.8", mcVersion: "1.21.8", loader: "Forge", loaderVersion: "58.1.0",
    createdAt: new Date().toISOString(), lastPlayed: new Date().toISOString(),
    ramMb: 4096, javaPath: "", dir: "", modCount: 0, sizeBytes: 20 * 1024,
  },
  {
    name: "Vanilla 26.2", mcVersion: "26.2", loader: "Vanilla", loaderVersion: "",
    createdAt: new Date().toISOString(), lastPlayed: new Date().toISOString(),
    ramMb: 4096, javaPath: "", dir: "", modCount: 0, sizeBytes: 22 * 1024 * 1024,
  },
];

const loaderAccent: Record<string, string> = {
  Fabric: "from-violet-500/25 to-fuchsia-500/10 border-violet-500/30",
  Forge: "from-amber-500/20 to-orange-500/10 border-amber-500/25",
  NeoForge: "from-rose-500/20 to-red-500/10 border-rose-500/25",
  Quilt: "from-purple-500/20 to-indigo-500/10 border-purple-500/25",
  Vanilla: "from-emerald-500/20 to-teal-500/10 border-emerald-500/25",
};

const loaderLabel: Record<string, string> = {
  fabric: "Fabric", forge: "Forge", neoforge: "NeoForge", quilt: "Quilt", vanilla: "Vanilla",
};

export default function MinecraftManager() {
  const [instances, setInstances] = useState<Instance[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [launchingName, setLaunchingName] = useState<string | null>(null);
  const desktop = isDesktop();

  async function refresh() {
    if (!desktop) {
      setInstances(DEMO_INSTANCES);
      setLoading(false);
      return;
    }
    setLoading(true);
    const r = await listInstances();
    if (r.ok) setInstances(r.instances);
    setLoading(false);
  }

  useEffect(() => { refresh(); }, [desktop]);

  useEffect(() => {
    if (!desktop) return;
    const last = localStorage.getItem(LAST_KEY);
    if (last && instances.some((i) => i.name === last)) setSelected(last);
  }, [instances, desktop]);

  useEffect(() => {
    if (selected) localStorage.setItem(LAST_KEY, selected);
  }, [selected]);

  async function quickLaunch(name: string) {
    if (!desktop) {
      toast.info("Launching Minecraft is only available in the RUBIX desktop app.");
      return;
    }
    setLaunchingName(name);
    const r = await launch(name);
    setLaunchingName(null);
    if (r.ok) toast.success(`Launched ${name}`);
    else toast.error(r.error || "Launch failed");
  }

  async function handleImportModpack() {
    if (!desktop) {
      toast.info("Modpack import needs the desktop app.");
      return;
    }
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
      <Sidebar
        collection="all"
        onCollection={() => {}}
        genres={[]}
        selectedGenre={null}
        onGenre={() => {}}
        counts={{ all: 0, favorites: 0, recent: 0 }}
        selectedSource={null}
        onSource={() => {}}
        sourceCounts={{ steam: 0, epic: 0, ea: 0, xbox: 0, riot: 0, other: 0 }}
      />
      <main className="relative flex-1 overflow-hidden">
        {/* Ambient backdrop */}
        <div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
          <div className="absolute -top-40 -left-32 h-[420px] w-[420px] rounded-full bg-primary/20 blur-3xl" />
          <div className="absolute top-1/3 -right-24 h-[360px] w-[360px] rounded-full bg-fuchsia-500/10 blur-3xl" />
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,transparent_0%,hsl(var(--background))_75%)]" />
        </div>

        <div className="mx-auto max-w-6xl px-6 py-8">
          {/* Header */}
          <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4 mb-8">
            <div className="min-w-0">
              <Link
                to="/mods"
                className="text-xs uppercase tracking-[0.14em] text-muted-foreground hover:text-foreground inline-flex items-center gap-1.5 mb-3"
              >
                <ArrowLeft className="h-3 w-3" /> Mod Manager
              </Link>
              <div className="flex items-center gap-3">
                <div className="grid h-11 w-11 place-items-center rounded-xl bg-gradient-to-br from-primary to-fuchsia-500 shadow-[0_10px_40px_-10px_hsl(var(--primary)/0.6)]">
                  <Boxes className="h-5 w-5 text-primary-foreground" />
                </div>
                <div>
                  <h1 className="text-4xl font-bold tracking-tight bg-gradient-to-b from-foreground to-foreground/70 bg-clip-text text-transparent">
                    Minecraft
                  </h1>
                  <p className="text-sm text-muted-foreground mt-0.5">
                    Multi-instance launcher · Fabric · Forge · NeoForge · Quilt
                  </p>
                </div>
              </div>
            </div>

            {!selected && (
              <div className="flex gap-2 shrink-0">
                <Button variant="outline" onClick={handleImportModpack} className="rounded-xl border-border/60 backdrop-blur">
                  <Upload className="h-4 w-4 mr-2" /> Import Modpack
                </Button>
                <Button
                  onClick={() => desktop ? setShowCreate(true) : toast.info("Instance creation needs the desktop app.")}
                  className="rounded-xl bg-gradient-to-r from-primary to-fuchsia-500 text-primary-foreground shadow-[0_10px_30px_-8px_hsl(var(--primary)/0.7)] hover:opacity-95"
                >
                  <Plus className="h-4 w-4 mr-2" /> Create Instance
                </Button>
              </div>
            )}
          </div>

          {!desktop && !selected && (
            <div className="mb-6 flex items-center gap-3 rounded-xl border border-border/50 bg-card/40 backdrop-blur px-4 py-3">
              <Sparkles className="h-4 w-4 text-primary shrink-0" />
              <p className="text-xs text-muted-foreground">
                Web preview mode — instances shown are examples. Install the RUBIX desktop app to create, mod, and launch.
              </p>
            </div>
          )}

          {loading && (
            <div className="p-16 text-center text-muted-foreground">
              <Loader2 className="h-6 w-6 animate-spin mx-auto" />
            </div>
          )}

          {!loading && !selected && instances.length === 0 && (
            <Card className="p-14 text-center border-dashed border-border/60 bg-card/40 backdrop-blur">
              <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-primary/10 mb-4">
                <Boxes className="h-7 w-7 text-primary" />
              </div>
              <h3 className="text-xl font-semibold mb-1">No instances yet</h3>
              <p className="text-sm text-muted-foreground mb-6">
                Spin up your first Minecraft instance to start installing mods.
              </p>
              <div className="flex justify-center gap-2">
                <Button onClick={() => setShowCreate(true)} className="rounded-xl">
                  <Plus className="h-4 w-4 mr-2" /> Create Instance
                </Button>
                <Button variant="outline" onClick={handleImportModpack} className="rounded-xl">
                  <Upload className="h-4 w-4 mr-2" /> Import Modpack
                </Button>
              </div>
            </Card>
          )}

          {!loading && !selected && instances.length > 0 && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {instances.map((inst) => {
                const accent = loaderAccent[inst.loader] ?? loaderAccent.vanilla;
                const label = loaderLabel[inst.loader] ?? inst.loader;
                const isLaunching = launchingName === inst.name;
                return (
                  <Card
                    key={inst.name}
                    onClick={() => desktop && setSelected(inst.name)}
                    className={cn(
                      "group relative overflow-hidden rounded-2xl border bg-card/50 backdrop-blur transition-all",
                      desktop && "cursor-pointer hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-[0_20px_50px_-20px_hsl(var(--primary)/0.5)]",
                    )}
                  >
                    {/* Loader-tinted top wash */}
                    <div
                      aria-hidden
                      className={cn(
                        "pointer-events-none absolute inset-x-0 top-0 h-24 bg-gradient-to-b opacity-80",
                        accent,
                      )}
                    />
                    <div className="relative p-5">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <div className="text-lg font-semibold truncate">{inst.name}</div>
                          <div className="flex flex-wrap items-center gap-1.5 mt-2">
                            <Badge className="rounded-full bg-primary/15 text-primary hover:bg-primary/20 border-0">
                              {label}{inst.loaderVersion ? ` ${inst.loaderVersion}` : ""}
                            </Badge>
                            <Badge variant="outline" className="rounded-full border-border/60">
                              MC {inst.mcVersion}
                            </Badge>
                          </div>
                        </div>
                        <Button
                          size="icon"
                          onClick={(e) => { e.stopPropagation(); quickLaunch(inst.name); }}
                          disabled={isLaunching}
                          aria-label={`Launch ${inst.name}`}
                          className="h-11 w-11 rounded-full bg-gradient-to-br from-primary to-fuchsia-500 text-primary-foreground shadow-[0_10px_25px_-8px_hsl(var(--primary)/0.8)] hover:scale-105 transition-transform ring-1 ring-primary/40"
                        >
                          {isLaunching ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4 fill-current translate-x-[1px]" />}
                        </Button>
                      </div>

                      <div className="mt-5 flex items-center gap-4 text-xs text-muted-foreground">
                        <span className="inline-flex items-center gap-1.5">
                          <Package className="h-3.5 w-3.5" />
                          {inst.modCount} mods
                        </span>
                        <span className="inline-flex items-center gap-1.5">
                          <HardDrive className="h-3.5 w-3.5" />
                          {formatBytes(inst.sizeBytes)}
                        </span>
                        {inst.lastPlayed && (
                          <span className="inline-flex items-center gap-1.5">
                            <Clock className="h-3.5 w-3.5" />
                            {new Date(inst.lastPlayed).toLocaleDateString()}
                          </span>
                        )}
                      </div>
                    </div>
                  </Card>
                );
              })}
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
        </div>
      </main>
    </div>
  );
}
