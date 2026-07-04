import { useEffect, useRef, useState } from "react";
import { Sidebar } from "@/components/Sidebar";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { Play, Plus, Package, Boxes, Loader2, ArrowLeft, Upload, Clock, HardDrive, Sparkles, Image as ImageIcon, Trash2, Tag, Palette } from "lucide-react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
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

const BG_KEY = "rubix:mc:instance-bg";
const GRAD_KEY = "rubix:mc:instance-grad";

function loadJson<T>(key: string, fallback: T): T {
  try { return JSON.parse(localStorage.getItem(key) || "null") ?? fallback; } catch { return fallback; }
}
function loadBackgrounds(): Record<string, string> {
  return loadJson(BG_KEY, {} as Record<string, string>);
}
function saveBackgrounds(map: Record<string, string>) {
  try { localStorage.setItem(BG_KEY, JSON.stringify(map)); } catch (e) {
    toast.error("Couldn't save background (storage full — try a smaller image or a URL).");
  }
}
type Gradient = { from: string; to: string };
function loadGradients(): Record<string, Gradient> {
  return loadJson(GRAD_KEY, {} as Record<string, Gradient>);
}
function saveGradients(map: Record<string, Gradient>) {
  try { localStorage.setItem(GRAD_KEY, JSON.stringify(map)); } catch {}
}
const NAME_KEY = "rubix:mc:instance-name";
function loadNames(): Record<string, string> {
  return loadJson(NAME_KEY, {} as Record<string, string>);
}
function saveNames(map: Record<string, string>) {
  try { localStorage.setItem(NAME_KEY, JSON.stringify(map)); } catch {}
}

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

const loaderGradientDefaults: Record<string, Gradient> = {
  Fabric: { from: "#8b5cf6", to: "#e879f9" },
  Forge: { from: "#f59e0b", to: "#f97316" },
  NeoForge: { from: "#f43f5e", to: "#ef4444" },
  Quilt: { from: "#a855f7", to: "#6366f1" },
  Vanilla: { from: "#10b981", to: "#14b8a6" },
};

export default function MinecraftManager() {
  const [instances, setInstances] = useState<Instance[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [launchingName, setLaunchingName] = useState<string | null>(null);
  const [backgrounds, setBackgrounds] = useState<Record<string, string>>(() => loadBackgrounds());
  const [gradients, setGradients] = useState<Record<string, Gradient>>(() => loadGradients());
  const [names, setNames] = useState<Record<string, string>>(() => loadNames());
  const [bgEditing, setBgEditing] = useState<string | null>(null);
  const [bgUrlDraft, setBgUrlDraft] = useState("");
  const [gradDraft, setGradDraft] = useState<Gradient>({ from: "#8b5cf6", to: "#e879f9" });
  const [nameDraft, setNameDraft] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const desktop = isDesktop();

  function setInstanceGradient(name: string, value: Gradient | null) {
    setGradients((prev) => {
      const next = { ...prev };
      if (value) next[name] = value; else delete next[name];
      saveGradients(next);
      return next;
    });
  }

  function setInstanceBackground(name: string, value: string | null) {
    setBackgrounds((prev) => {
      const next = { ...prev };
      if (value) next[name] = value; else delete next[name];
      saveBackgrounds(next);
      return next;
    });
  }

  function setInstanceName(name: string, value: string | null) {
    setNames((prev) => {
      const next = { ...prev };
      if (value && value.trim()) next[name] = value.trim(); else delete next[name];
      saveNames(next);
      return next;
    });
  }

  function openBgDialog(name: string) {
    setBgEditing(name);
    setBgUrlDraft(backgrounds[name] && backgrounds[name].startsWith("http") ? backgrounds[name] : "");
    const inst = instances.find((i) => i.name === name);
    const fallback = (inst && loaderGradientDefaults[inst.loader]) || loaderGradientDefaults.Vanilla;
    setGradDraft(gradients[name] ?? fallback);
    setNameDraft(names[name] ?? "");
  }

  async function onBgFilePicked(file: File) {
    if (!bgEditing) return;
    if (file.size > 4 * 1024 * 1024) {
      toast.error("Image too large — please choose a file under 4 MB or use a URL.");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      setInstanceBackground(bgEditing, String(reader.result));
      setBgEditing(null);
      toast.success("Background updated");
    };
    reader.readAsDataURL(file);
  }

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
                const accent = loaderAccent[inst.loader] ?? loaderAccent.Vanilla;
                const label = inst.loader;
                const isLaunching = launchingName === inst.name;
                const customBg = backgrounds[inst.name];
                const customGrad = gradients[inst.name];
                return (
                  <Card
                    key={inst.name}
                    onClick={() => desktop && setSelected(inst.name)}
                    className={cn(
                      "group relative overflow-hidden rounded-2xl border bg-card/50 backdrop-blur transition-all min-h-[180px]",
                      desktop && "cursor-pointer hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-[0_20px_50px_-20px_hsl(var(--primary)/0.5)]",
                    )}
                  >
                    {customBg ? (
                      <>
                        <img
                          src={customBg}
                          alt=""
                          aria-hidden
                          className="pointer-events-none absolute inset-0 h-full w-full object-cover"
                        />
                        {/* Legibility scrim */}
                        <div aria-hidden className="pointer-events-none absolute inset-0 bg-gradient-to-t from-background via-background/85 to-background/30" />
                      </>
                    ) : customGrad ? (
                      <div
                        aria-hidden
                        className="pointer-events-none absolute inset-x-0 top-0 h-24 opacity-80"
                        style={{ backgroundImage: `linear-gradient(to bottom, ${customGrad.from}, ${customGrad.to})` }}
                      />
                    ) : (
                      <div
                        aria-hidden
                        className={cn(
                          "pointer-events-none absolute inset-x-0 top-0 h-24 bg-gradient-to-b opacity-80",
                          accent,
                        )}
                      />
                    )}

                    {/* Background controls (top-right, above launch button area) */}
                    <div className="absolute top-3 right-3 z-10 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <Button
                        size="icon"
                        variant="secondary"
                        onClick={(e) => { e.stopPropagation(); openBgDialog(inst.name); }}
                        aria-label="Set background"
                        className="h-7 w-7 rounded-full bg-background/70 backdrop-blur border border-border/60 hover:bg-background"
                      >
                        <ImageIcon className="h-3.5 w-3.5" />
                      </Button>
                      {customBg && (
                        <Button
                          size="icon"
                          variant="secondary"
                          onClick={(e) => { e.stopPropagation(); setInstanceBackground(inst.name, null); toast.success("Background removed"); }}
                          aria-label="Remove background"
                          className="h-7 w-7 rounded-full bg-background/70 backdrop-blur border border-border/60 hover:bg-background"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      )}
                    </div>

                    <div className="relative p-5">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0 flex-1 pr-16">
                          <div className="text-lg font-semibold truncate drop-shadow-sm">{names[inst.name] || inst.name}</div>
                          {names[inst.name] && (
                            <div className="text-[11px] text-muted-foreground truncate mt-0.5">{inst.name}</div>
                          )}
                          <div className="flex flex-wrap items-center gap-1.5 mt-2">
                            <Badge className="rounded-full bg-primary/15 text-primary hover:bg-primary/20 border-0">
                              {label}{inst.loaderVersion ? ` ${inst.loaderVersion}` : ""}
                            </Badge>
                            <Badge variant="outline" className="rounded-full border-border/60 bg-background/50 backdrop-blur">
                              MC {inst.mcVersion}
                            </Badge>
                          </div>
                        </div>
                      </div>

                      <div className="mt-16 flex items-end justify-between gap-3">
                        <div className="flex items-center gap-4 text-xs text-muted-foreground">
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
                        <Button
                          size="icon"
                          onClick={(e) => { e.stopPropagation(); quickLaunch(inst.name); }}
                          disabled={isLaunching}
                          aria-label={`Launch ${inst.name}`}
                          className="h-11 w-11 rounded-full bg-gradient-to-br from-primary to-fuchsia-500 text-primary-foreground shadow-[0_10px_25px_-8px_hsl(var(--primary)/0.8)] hover:scale-105 transition-transform ring-1 ring-primary/40 shrink-0"
                        >
                          {isLaunching ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4 fill-current translate-x-[1px]" />}
                        </Button>
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

          <Dialog open={!!bgEditing} onOpenChange={(o) => !o && setBgEditing(null)}>
            <DialogContent className="sm:max-w-md">
              <DialogHeader>
                <DialogTitle>Customize card</DialogTitle>
                <DialogDescription>
                  Personalize the card for <span className="text-foreground font-medium">{bgEditing}</span>.
                </DialogDescription>
              </DialogHeader>

              <Tabs defaultValue="name" className="w-full">
                <TabsList className="grid w-full grid-cols-3">
                  <TabsTrigger value="name" className="gap-1.5">
                    <Tag className="h-3.5 w-3.5" /> Name
                  </TabsTrigger>
                  <TabsTrigger value="background" className="gap-1.5">
                    <ImageIcon className="h-3.5 w-3.5" /> Background
                  </TabsTrigger>
                  <TabsTrigger value="gradient" className="gap-1.5">
                    <Palette className="h-3.5 w-3.5" /> Gradient
                  </TabsTrigger>
                </TabsList>

                {/* NAME */}
                <TabsContent value="name" className="mt-4 space-y-3">
                  <Label htmlFor="display-name">Display name</Label>
                  <div className="flex gap-2">
                    <Input
                      id="display-name"
                      placeholder={bgEditing ?? "Instance name"}
                      value={nameDraft}
                      onChange={(e) => setNameDraft(e.target.value)}
                      maxLength={60}
                    />
                    <Button
                      onClick={() => {
                        if (!bgEditing) return;
                        setInstanceName(bgEditing, nameDraft);
                        toast.success(nameDraft.trim() ? "Name updated" : "Name reset");
                      }}
                    >
                      Save
                    </Button>
                  </div>
                  <p className="text-[11px] text-muted-foreground">
                    Only changes the label shown on the card. The underlying instance folder stays{" "}
                    <span className="font-mono">{bgEditing}</span>.
                  </p>
                  {bgEditing && names[bgEditing] && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => { setInstanceName(bgEditing!, null); setNameDraft(""); toast.success("Name reset"); }}
                      className="text-destructive hover:text-destructive px-0"
                    >
                      <Trash2 className="h-3.5 w-3.5 mr-1.5" /> Reset to original
                    </Button>
                  )}
                </TabsContent>

                {/* BACKGROUND */}
                <TabsContent value="background" className="mt-4 space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="bg-url">Image or GIF URL</Label>
                    <div className="flex gap-2">
                      <Input
                        id="bg-url"
                        placeholder="https://example.com/cover.gif"
                        value={bgUrlDraft}
                        onChange={(e) => setBgUrlDraft(e.target.value)}
                      />
                      <Button
                        onClick={() => {
                          if (!bgEditing || !bgUrlDraft.trim()) return;
                          setInstanceBackground(bgEditing, bgUrlDraft.trim());
                          toast.success("Background updated");
                        }}
                        disabled={!bgUrlDraft.trim()}
                      >
                        Apply
                      </Button>
                    </div>
                  </div>

                  <div className="relative">
                    <div className="absolute inset-0 flex items-center"><span className="w-full border-t border-border/60" /></div>
                    <div className="relative flex justify-center text-xs uppercase tracking-wider">
                      <span className="bg-background px-2 text-muted-foreground">or</span>
                    </div>
                  </div>

                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*,image/gif"
                    className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) onBgFilePicked(f);
                      e.target.value = "";
                    }}
                  />
                  <Button variant="outline" onClick={() => fileInputRef.current?.click()} className="w-full">
                    <Upload className="h-4 w-4 mr-2" /> Upload image / GIF (max 4 MB)
                  </Button>

                  {bgEditing && backgrounds[bgEditing] && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => { setInstanceBackground(bgEditing!, null); toast.success("Background removed"); }}
                      className="text-destructive hover:text-destructive w-full justify-center"
                    >
                      <Trash2 className="h-3.5 w-3.5 mr-1.5" /> Remove background
                    </Button>
                  )}
                </TabsContent>

                {/* GRADIENT */}
                <TabsContent value="gradient" className="mt-4 space-y-3">
                  <p className="text-[11px] text-muted-foreground">
                    Used as the card wash when no background image is set.
                  </p>

                  <div
                    aria-hidden
                    className="h-14 w-full rounded-lg border border-border/60"
                    style={{ backgroundImage: `linear-gradient(to bottom right, ${gradDraft.from}, ${gradDraft.to})` }}
                  />

                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label htmlFor="grad-from" className="text-xs text-muted-foreground">From</Label>
                      <div className="flex items-center gap-2">
                        <input
                          id="grad-from"
                          type="color"
                          value={gradDraft.from}
                          onChange={(e) => setGradDraft((g) => ({ ...g, from: e.target.value }))}
                          className="h-9 w-10 rounded-md border border-border/60 bg-transparent cursor-pointer"
                        />
                        <Input
                          value={gradDraft.from}
                          onChange={(e) => setGradDraft((g) => ({ ...g, from: e.target.value }))}
                          className="font-mono text-xs"
                        />
                      </div>
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="grad-to" className="text-xs text-muted-foreground">To</Label>
                      <div className="flex items-center gap-2">
                        <input
                          id="grad-to"
                          type="color"
                          value={gradDraft.to}
                          onChange={(e) => setGradDraft((g) => ({ ...g, to: e.target.value }))}
                          className="h-9 w-10 rounded-md border border-border/60 bg-transparent cursor-pointer"
                        />
                        <Input
                          value={gradDraft.to}
                          onChange={(e) => setGradDraft((g) => ({ ...g, to: e.target.value }))}
                          className="font-mono text-xs"
                        />
                      </div>
                    </div>
                  </div>

                  <div className="flex gap-2">
                    <Button
                      onClick={() => {
                        if (!bgEditing) return;
                        setInstanceGradient(bgEditing, gradDraft);
                        toast.success("Gradient updated");
                      }}
                      className="flex-1"
                    >
                      Apply gradient
                    </Button>
                    {bgEditing && gradients[bgEditing] && (
                      <Button
                        variant="outline"
                        onClick={() => {
                          setInstanceGradient(bgEditing!, null);
                          const inst = instances.find((i) => i.name === bgEditing);
                          const fallback = (inst && loaderGradientDefaults[inst.loader]) || loaderGradientDefaults.Vanilla;
                          setGradDraft(fallback);
                          toast.success("Reset to loader default");
                        }}
                      >
                        Reset
                      </Button>
                    )}
                  </div>
                </TabsContent>
              </Tabs>

              <DialogFooter className="mt-2">
                <Button variant="secondary" onClick={() => setBgEditing(null)}>Close</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </main>
    </div>
  );
}
