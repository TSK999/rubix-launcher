import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Search, Download, AlertTriangle, Loader2, ExternalLink } from "lucide-react";
import { toast } from "sonner";
import { cfBrowseMinecraft, cfMcResolve } from "@/lib/minecraft/api";
import type { Instance } from "@/lib/minecraft/bridge";
import { installMod as dispatchInstallMod } from "@/lib/mods/strategies";
import type { GameDefinition, ModPackage } from "@/lib/mods/types";

type Props = {
  instance: Instance;
  installedIds: Set<number>;
  onChanged: () => void;
};

export function MinecraftModBrowser({ instance, installedIds, onChanged }: Props) {
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<any[]>([]);
  const [installing, setInstalling] = useState<number | null>(null);

  async function search(q = query) {
    setLoading(true);
    try {
      const data = await cfBrowseMinecraft(q, 1, "popular");
      setResults(data.result || []);
    } catch (e: any) {
      toast.error("Browse failed", { description: e?.message });
    } finally { setLoading(false); }
  }

  useEffect(() => { search(""); /* initial */ /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

  async function install(mod: any) {
    setInstalling(mod.id);
    try {
      const resolved = await cfMcResolve(mod.id, instance.mcVersion, instance.loader);
      if (!resolved.install.length) {
        toast.error(`This mod requires ${instance.loader} ${instance.mcVersion}`);
        return;
      }
      for (const f of resolved.install) {
        const r = await installMod({
          instance: instance.name,
          projectId: f.modId,
          fileId: f.fileId,
          fileName: f.fileName,
          name: f.modName,
          downloadUrl: f.downloadUrl,
          dependencies: [],
        });
        if (!r.ok) throw new Error(r.error || "Install failed");
      }
      toast.success(`Installed ${mod.name}${resolved.install.length > 1 ? ` (+${resolved.install.length - 1} deps)` : ""}`);
      onChanged();
    } catch (e: any) {
      toast.error("Install failed", { description: e?.message });
    } finally { setInstalling(null); }
  }

  return (
    <div className="space-y-3">
      <form
        onSubmit={(e) => { e.preventDefault(); search(); }}
        className="flex gap-2"
      >
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            className="pl-9"
            placeholder="Search CurseForge mods…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <Button type="submit" disabled={loading}>
          {loading && <Loader2 className="h-4 w-4 animate-spin mr-2" />}Search
        </Button>
      </form>

      <div className="text-xs text-muted-foreground flex items-center gap-2">
        <Badge variant="outline">{instance.loader}</Badge>
        <Badge variant="outline">MC {instance.mcVersion}</Badge>
        <span>Only compatible files will install.</span>
      </div>

      <div className="grid gap-2">
        {results.map((m) => {
          const already = installedIds.has(m.id);
          const isInstalling = installing === m.id;
          return (
            <Card key={m.id} className="p-3 flex items-start gap-3">
              {m.background ? (
                <img src={m.background} alt="" className="h-12 w-12 rounded-md object-cover" />
              ) : (
                <div className="h-12 w-12 rounded-md bg-muted" />
              )}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <div className="font-medium truncate">{m.name}</div>
                  {m.author && <Badge variant="outline" className="text-[10px]">{m.author}</Badge>}
                </div>
                <p className="text-xs text-muted-foreground line-clamp-2">{m.short_description}</p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {m.url && (
                  <a href={m.url} target="_blank" rel="noreferrer" className="text-muted-foreground hover:text-foreground">
                    <ExternalLink className="h-4 w-4" />
                  </a>
                )}
                <Button
                  size="sm"
                  variant={already ? "secondary" : "default"}
                  disabled={already || isInstalling}
                  onClick={() => install(m)}
                >
                  {isInstalling ? <Loader2 className="h-4 w-4 animate-spin" /> :
                    already ? "Installed" : <><Download className="h-4 w-4 mr-1" /> Install</>}
                </Button>
              </div>
            </Card>
          );
        })}
        {!loading && results.length === 0 && (
          <div className="text-center py-12 text-sm text-muted-foreground">
            <AlertTriangle className="h-6 w-6 mx-auto mb-2 opacity-50" />
            No mods found.
          </div>
        )}
      </div>
    </div>
  );
}
