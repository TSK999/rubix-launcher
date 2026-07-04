// Modrinth-powered browser for Minecraft Resource Packs and Shader Packs.
// - Uses project_type filter (resourcepack | shader) via Modrinth's search facets.
// - Downloads the primary .zip file into the instance's resourcepacks/ or
//   shaderpacks/ folder without extracting.
// - For shader packs, warns when no shader renderer (Iris/OptiFine/Oculus/
//   Sodium+Iris) is installed in the instance.

import { useEffect, useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Search, Download, Loader2, ExternalLink, Trash2, AlertTriangle, Package,
} from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import {
  detectShaderRenderer, installPack, listPacks, togglePack, uninstallPack,
  type Instance, type InstalledPack, type PackKind,
} from "@/lib/minecraft/bridge";

type Props = { instance: Instance; kind: PackKind };

type Hit = {
  project_id: string;
  slug: string;
  title: string;
  description: string;
  author: string;
  downloads: number;
  icon_url: string | null;
  categories: string[];
  versions: string[];
};

type Version = {
  id: string;
  name: string;
  version_number: string;
  game_versions: string[];
  loaders: string[];
  files: Array<{ url: string; filename: string; primary: boolean; size: number }>;
};

const MODRINTH = "https://api.modrinth.com/v2";
const UA = "RUBIX-Launcher (github.com/rubix)";

type SortKey = "relevance" | "downloads" | "follows" | "newest" | "updated";
const SORTS: { k: SortKey; label: string }[] = [
  { k: "relevance", label: "Relevance" },
  { k: "downloads", label: "Downloads" },
  { k: "follows", label: "Follows" },
  { k: "newest", label: "Newest" },
  { k: "updated", label: "Updated" },
];

// Curated subset of Modrinth's supported category facets, split per project_type.
const CATEGORIES: Record<"resourcepack" | "shader", string[]> = {
  resourcepack: [
    "8x-", "16x", "32x", "48x", "64x", "128x", "256x", "512x+",
    "realistic", "simplistic", "vanilla-like", "themed", "tweaks",
    "combat", "decoration", "gui", "items", "blocks", "entities", "mobs",
    "environment", "fonts", "audio", "models", "modded", "cursed",
  ],
  shader: [
    "vanilla-like", "semi-realistic", "realistic", "fantasy", "cartoon", "cursed",
    "atmosphere", "bloom", "colored-lighting", "foliage", "path-tracing", "pbr",
    "reflections", "shadows", "potato", "low", "medium", "high", "screenshot",
  ],
};

async function modrinth<T>(path: string): Promise<T> {
  const r = await fetch(`${MODRINTH}${path}`, { headers: { "User-Agent": UA } });
  if (!r.ok) throw new Error(`Modrinth ${r.status}`);
  return r.json();
}

export function MinecraftPackBrowser({ instance, kind }: Props) {
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<Hit[]>([]);
  const [installed, setInstalled] = useState<InstalledPack[]>([]);
  const [showIncompatible, setShowIncompatible] = useState(false);
  const [installingId, setInstallingId] = useState<string | null>(null);
  const [hasRenderer, setHasRenderer] = useState<boolean>(true);
  const [renderers, setRenderers] = useState<string[]>([]);
  const [conflict, setConflict] = useState<{ hit: Hit; version: Version } | null>(null);
  const [sort, setSort] = useState<SortKey>("relevance");
  const [selectedCats, setSelectedCats] = useState<Set<string>>(new Set());
  const [hideInstalled, setHideInstalled] = useState(false);

  const labelPlural = kind === "shader" ? "shader packs" : "resource packs";
  const facetType = kind === "shader" ? "shader" : "resourcepack";
  const catList = CATEGORIES[facetType as "resourcepack" | "shader"];

  async function refreshInstalled() {
    const r = await listPacks(instance.name, kind);
    if (r.ok) setInstalled(r.packs);
  }

  async function refreshRenderer() {
    if (kind !== "shader") return;
    const r = await detectShaderRenderer(instance.name);
    if (r.ok) {
      setHasRenderer(r.hasRenderer);
      setRenderers(r.renderers);
    }
  }

  async function search(q = query) {
    setLoading(true);
    try {
      // Facets: project_type + game version + selected categories.
      // Loader is intentionally not filtered here — resource packs are
      // loader-agnostic, and shaders are handled by whichever renderer
      // the user has installed.
      const facets: string[][] = [[`project_type:${facetType}`]];
      if (!showIncompatible) facets.push([`versions:${instance.mcVersion}`]);
      for (const c of selectedCats) facets.push([`categories:${c}`]);
      const params = new URLSearchParams({
        query: q,
        limit: "30",
        index: sort,
        facets: JSON.stringify(facets),
      });
      const data = await modrinth<{ hits: Hit[] }>(`/search?${params}`);
      setResults(data.hits || []);
    } catch (e: any) {
      toast.error("Search failed", { description: e?.message });
    } finally { setLoading(false); }
  }

  useEffect(() => {
    refreshInstalled();
    refreshRenderer();
    search("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [instance.name, kind, instance.mcVersion, showIncompatible, sort, selectedCats]);

  function toggleCat(c: string) {
    setSelectedCats((prev) => {
      const next = new Set(prev);
      if (next.has(c)) next.delete(c); else next.add(c);
      return next;
    });
  }


  async function pickVersion(hit: Hit): Promise<Version | null> {
    const versions = await modrinth<Version[]>(
      `/project/${hit.project_id}/version?game_versions=${encodeURIComponent(JSON.stringify([instance.mcVersion]))}`,
    );
    let v = versions[0];
    if (!v && showIncompatible) {
      const all = await modrinth<Version[]>(`/project/${hit.project_id}/version`);
      v = all[0];
    }
    return v ?? null;
  }

  async function doInstall(hit: Hit, replace?: "replace" | "keep-both") {
    setInstallingId(hit.project_id);
    try {
      const version = await pickVersion(hit);
      if (!version) {
        toast.error(`No compatible version for MC ${instance.mcVersion}`);
        return;
      }
      const file = version.files.find((f) => f.primary) ?? version.files[0];
      if (!file || !file.filename.toLowerCase().endsWith(".zip")) {
        toast.error("This pack has no downloadable .zip file");
        return;
      }
      const r = await installPack({
        instance: instance.name,
        kind,
        projectId: hit.project_id,
        versionId: version.id,
        fileName: file.filename,
        name: hit.title,
        downloadUrl: file.url,
        replace,
      });
      if (!r.ok) {
        if (r.conflict) {
          setConflict({ hit, version });
          return;
        }
        throw new Error(r.error);
      }
      toast.success(`Installed ${hit.title}`);
      refreshInstalled();
    } catch (e: any) {
      toast.error("Install failed", { description: e?.message });
    } finally { setInstallingId(null); }
  }

  async function resolveConflict(mode: "replace" | "keep-both") {
    if (!conflict) return;
    const { hit } = conflict;
    setConflict(null);
    await doInstall(hit, mode);
  }

  const installedByProject = useMemo(() => {
    const m = new Map<string, InstalledPack>();
    for (const p of installed) if (p.projectId) m.set(p.projectId, p);
    return m;
  }, [installed]);

  return (
    <div className="space-y-3">
      {kind === "shader" && !hasRenderer && (
        <Alert variant="default" className="border-amber-500/40">
          <AlertTriangle className="h-4 w-4 text-amber-500" />
          <AlertDescription className="text-sm">
            This shader pack requires a shader renderer such as <b>Iris</b> or <b>OptiFine</b>.
            You can install shaders anyway — they will not be usable in-game until a renderer mod
            is installed.{renderers.length > 0 && <> Detected: {renderers.join(", ")}.</>}
          </AlertDescription>
        </Alert>
      )}

      <form onSubmit={(e) => { e.preventDefault(); search(); }} className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            className="pl-9"
            placeholder={`Search Modrinth ${labelPlural}…`}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <Button type="submit" disabled={loading}>
          {loading && <Loader2 className="h-4 w-4 animate-spin mr-2" />}Search
        </Button>
      </form>

      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <div className="flex items-center gap-2">
          <Badge variant="outline">MC {instance.mcVersion}</Badge>
          <span>Modrinth • filtered by project_type=<code>{facetType}</code></span>
        </div>
        <label className="flex items-center gap-2 cursor-pointer">
          <Checkbox checked={showIncompatible} onCheckedChange={(v) => setShowIncompatible(!!v)} />
          Show incompatible versions
        </label>
      </div>

      {installed.length > 0 && (
        <div>
          <div className="text-xs uppercase tracking-wide text-muted-foreground mb-1">
            Installed ({installed.length})
          </div>
          <div className="grid gap-2">
            {installed.map((p) => (
              <Card key={p.fileName} className="p-3 flex items-center gap-3">
                <Package className="h-4 w-4 text-muted-foreground shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="font-medium truncate">{p.name}</div>
                  <div className="text-xs text-muted-foreground truncate">{p.fileName}</div>
                </div>
                <div className="flex items-center gap-2 text-xs">
                  <Switch
                    checked={p.enabled}
                    onCheckedChange={async (v) => {
                      const r = await togglePack(instance.name, kind, p.projectId || p.fileName, v);
                      if (r.ok) refreshInstalled(); else toast.error(r.error || "Toggle failed");
                    }}
                  />
                  {p.enabled ? "On" : "Off"}
                  <Button
                    size="sm" variant="ghost"
                    onClick={async () => {
                      const r = await uninstallPack(instance.name, kind, p.projectId || p.fileName);
                      if (r.ok) { toast.success(`Removed ${p.name}`); refreshInstalled(); }
                      else toast.error(r.error || "Uninstall failed");
                    }}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </Card>
            ))}
          </div>
        </div>
      )}

      <div className="grid gap-2">
        {results.map((h) => {
          const already = installedByProject.has(h.project_id);
          const busy = installingId === h.project_id;
          return (
            <Card key={h.project_id} className="p-3 flex items-start gap-3">
              {h.icon_url
                ? <img src={h.icon_url} alt="" className="h-12 w-12 rounded-md object-cover" />
                : <div className="h-12 w-12 rounded-md bg-muted" />}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <div className="font-medium truncate">{h.title}</div>
                  {h.author && <Badge variant="outline" className="text-[10px]">{h.author}</Badge>}
                </div>
                <p className="text-xs text-muted-foreground line-clamp-2">{h.description}</p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <a
                  href={`https://modrinth.com/${facetType}/${h.slug}`}
                  target="_blank" rel="noreferrer"
                  className="text-muted-foreground hover:text-foreground"
                >
                  <ExternalLink className="h-4 w-4" />
                </a>
                <Button
                  size="sm"
                  variant={already ? "secondary" : "default"}
                  disabled={already || busy}
                  onClick={() => doInstall(h)}
                >
                  {busy ? <Loader2 className="h-4 w-4 animate-spin" />
                    : already ? "Installed"
                    : <><Download className="h-4 w-4 mr-1" /> Install</>}
                </Button>
              </div>
            </Card>
          );
        })}
        {!loading && results.length === 0 && (
          <div className="text-center py-12 text-sm text-muted-foreground">
            <AlertTriangle className="h-6 w-6 mx-auto mb-2 opacity-50" />
            No {labelPlural} found.
          </div>
        )}
      </div>

      <AlertDialog open={!!conflict} onOpenChange={(o) => !o && setConflict(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>A pack with that filename already exists</AlertDialogTitle>
            <AlertDialogDescription>
              Replace the existing file, or keep both by adding a suffix?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <Button variant="outline" onClick={() => resolveConflict("keep-both")}>Keep both</Button>
            <AlertDialogAction onClick={() => resolveConflict("replace")}>Replace</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
