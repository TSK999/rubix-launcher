import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Search, Download, AlertTriangle, Loader2, ExternalLink, CheckCircle2, XCircle, Package,
} from "lucide-react";
import { toast } from "sonner";
import {
  cfBrowseMinecraft, cfMcResolve, type CfResolveResult, type CfResolveItem,
} from "@/lib/minecraft/api";
import type { Instance } from "@/lib/minecraft/bridge";
import { installMod as installMinecraftMod } from "@/lib/minecraft/bridge";

type Props = {
  instance: Instance;
  installedIds: Set<number>;
  onChanged: () => void;
};

type PlanState = {
  mod: any;
  plan: CfResolveResult;
  picked: Record<number, boolean>; // optional deps -> include?
};

export function MinecraftModBrowser({ instance, installedIds, onChanged }: Props) {
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<any[]>([]);
  const [resolving, setResolving] = useState<number | null>(null);
  const [installing, setInstalling] = useState(false);
  const [planState, setPlanState] = useState<PlanState | null>(null);

  async function search(q = query) {
    setLoading(true);
    try {
      // CurseForge filters results server-side to the instance's MC + loader.
      const data = await cfBrowseMinecraft(q, 1, "popular", instance.mcVersion, instance.loader);
      setResults(data.result || []);
    } catch (e: any) {
      toast.error("Browse failed", { description: e?.message });
    } finally { setLoading(false); }
  }

  useEffect(() => { search(""); /* refetch when instance changes */ /* eslint-disable-next-line react-hooks/exhaustive-deps */ },
    [instance.name, instance.mcVersion, instance.loader]);

  async function preview(mod: any) {
    setResolving(mod.id);
    try {
      const plan = await cfMcResolve(mod.id, instance.mcVersion, instance.loader);
      if (!plan.install.length && !plan.issues.length) {
        toast.error(`No compatible file for ${instance.loader} ${instance.mcVersion}`);
        return;
      }
      const picked: Record<number, boolean> = {};
      for (const o of plan.optional) picked[o.modId] = false;
      setPlanState({ mod, plan, picked });
    } catch (e: any) {
      toast.error("Resolve failed", { description: e?.message });
    } finally { setResolving(null); }
  }

  async function confirmInstall() {
    if (!planState) return;
    const { plan, picked, mod } = planState;
    if (plan.issues.length) {
      toast.error("Cannot install: dependency issues", {
        description: plan.issues.map((i) => i.message).join("; "),
      });
      return;
    }
    setInstalling(true);
    try {
      const queue: CfResolveItem[] = [
        ...plan.install,
        ...plan.optional.filter((o) => picked[o.modId]),
      ];
      for (const f of queue) {
        if (installedIds.has(f.modId)) continue;
        if (!f.downloadUrl) throw new Error(`${f.modName} has no download URL`);
        const r = await installMinecraftMod({
          instance: instance.name,
          projectId: f.modId,
          fileId: f.fileId,
          fileName: f.fileName,
          name: f.modName,
          downloadUrl: f.downloadUrl,
          dependencies: [],
        });
        if (!r.ok) throw new Error(r.error || `Install failed for ${f.modName}`);
      }
      const extra = queue.length - 1;
      toast.success(`Installed ${mod.name}${extra > 0 ? ` (+${extra} deps)` : ""}`);
      setPlanState(null);
      onChanged();
    } catch (e: any) {
      toast.error("Install failed", { description: e?.message });
    } finally { setInstalling(false); }
  }

  const blocked = !!planState?.plan.issues.length;
  const installedIncompat = planState?.plan.incompatible.filter((i) => installedIds.has(i.modId)) ?? [];

  return (
    <div className="space-y-3">
      <form onSubmit={(e) => { e.preventDefault(); search(); }} className="flex gap-2">
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
        <span>Results filtered by CurseForge to this instance's loader and version.</span>
      </div>

      <div className="grid gap-2">
        {results.map((m) => {
          const already = installedIds.has(m.id);
          const isResolving = resolving === m.id;
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
                  disabled={already || isResolving}
                  onClick={() => preview(m)}
                >
                  {isResolving ? <Loader2 className="h-4 w-4 animate-spin" /> :
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

      <Dialog open={!!planState} onOpenChange={(o) => !o && !installing && setPlanState(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Package className="h-5 w-5" /> Install {planState?.mod.name}
            </DialogTitle>
            <DialogDescription>
              Dependency plan for {instance.loader} {instance.mcVersion} — sourced from CurseForge.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 text-sm max-h-[50vh] overflow-y-auto">
            {planState && (
              <>
                <div>
                  <div className="text-xs uppercase tracking-wide text-muted-foreground mb-1">
                    Install queue ({planState.plan.install.length})
                  </div>
                  <div className="rounded-md border divide-y">
                    {planState.plan.install.map((it, i) => {
                      const already = installedIds.has(it.modId);
                      return (
                        <div key={it.modId} className="flex items-center gap-2 p-2">
                          <span className="text-xs text-muted-foreground w-5">{i + 1}.</span>
                          <div className="flex-1 min-w-0">
                            <div className="truncate">{it.modName}</div>
                            <div className="flex items-center gap-1 mt-0.5">
                              <Badge variant={it.mcVersionMatched ? "outline" : "destructive"} className="text-[9px] px-1 py-0">
                                MC {instance.mcVersion} {it.mcVersionMatched ? "✓" : "✗"}
                              </Badge>
                              <Badge variant={it.loaderMatched ? "outline" : "destructive"} className="text-[9px] px-1 py-0">
                                {instance.loader} {it.loaderMatched ? "✓" : "✗"}
                              </Badge>
                            </div>
                          </div>
                          <span className="text-xs text-muted-foreground truncate max-w-[30%]">{it.fileName}</span>
                          {already
                            ? <Badge variant="secondary" className="text-[10px]">already</Badge>
                            : it.required
                              ? <Badge variant="outline" className="text-[10px]">required</Badge>
                              : <Badge className="text-[10px]">root</Badge>}
                        </div>
                      );
                    })}

                  </div>
                </div>

                {planState.plan.issues.length > 0 && (
                  <div>
                    <div className="text-xs uppercase tracking-wide text-destructive mb-1 flex items-center gap-1">
                      <XCircle className="h-3 w-3" /> Blocking issues
                    </div>
                    <ul className="text-xs text-destructive list-disc pl-5 space-y-0.5">
                      {planState.plan.issues.map((i, idx) => <li key={idx}>{i.message}</li>)}
                    </ul>
                  </div>
                )}

                {installedIncompat.length > 0 && (
                  <div>
                    <div className="text-xs uppercase tracking-wide text-amber-500 mb-1 flex items-center gap-1">
                      <AlertTriangle className="h-3 w-3" /> Conflicts with installed mods
                    </div>
                    <ul className="text-xs list-disc pl-5">
                      {installedIncompat.map((i) => <li key={i.modId}>{i.modName}</li>)}
                    </ul>
                  </div>
                )}

                {planState.plan.optional.length > 0 && (
                  <div>
                    <div className="text-xs uppercase tracking-wide text-muted-foreground mb-1">
                      Optional add-ons
                    </div>
                    <div className="rounded-md border divide-y">
                      {planState.plan.optional.map((o) => (
                        <label key={o.modId} className="flex items-center gap-2 p-2 cursor-pointer">
                          <Checkbox
                            checked={!!planState.picked[o.modId]}
                            onCheckedChange={(v) => setPlanState({
                              ...planState,
                              picked: { ...planState.picked, [o.modId]: !!v },
                            })}
                          />
                          <span className="flex-1 truncate">{o.modName}</span>
                          <span className="text-xs text-muted-foreground truncate max-w-[40%]">{o.fileName}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                )}

                {!planState.plan.issues.length && (
                  <div className="text-xs text-emerald-500 flex items-center gap-1">
                    <CheckCircle2 className="h-3 w-3" /> All dependencies resolved.
                  </div>
                )}
              </>
            )}
          </div>

          <DialogFooter>
            <Button variant="ghost" onClick={() => setPlanState(null)} disabled={installing}>
              Cancel
            </Button>
            <Button onClick={confirmInstall} disabled={installing || blocked}>
              {installing && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              Install {planState ? planState.plan.install.length + Object.values(planState.picked).filter(Boolean).length : 0} mod(s)
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
