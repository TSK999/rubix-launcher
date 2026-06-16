import { useEffect, useState } from "react";
import { Loader2, Plus, Copy, Trash2, Download, Share2, Globe2, Lock, Package } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  createModpack,
  deleteModpack,
  listModpacks,
  redeemModpackCode,
  updateModpack,
  type ModpackWithMods,
  type ModpackMod,
} from "@/lib/modpacks";
import { useRubixAuth } from "@/hooks/useRubixAuth";

type Props = {
  gameSlug: string;
  gameTitle: string;
  /** Optional: pre-fill new modpacks with currently installed mods. */
  installedMods?: Array<Omit<ModpackMod, "id" | "modpack_id" | "position">>;
  compact?: boolean;
};

export function ModpackManager({ gameSlug, gameTitle, installedMods, compact }: Props) {
  const { user } = useRubixAuth();
  const [loading, setLoading] = useState(true);
  const [packs, setPacks] = useState<ModpackWithMods[]>([]);
  const [createOpen, setCreateOpen] = useState(false);
  const [redeemOpen, setRedeemOpen] = useState(false);
  const [name, setName] = useState("");
  const [desc, setDesc] = useState("");
  const [isPublic, setIsPublic] = useState(false);
  const [includeInstalled, setIncludeInstalled] = useState(true);
  const [busy, setBusy] = useState(false);
  const [code, setCode] = useState("");

  const refresh = async () => {
    if (!user) {
      setPacks([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      setPacks(await listModpacks(gameSlug));
    } catch (e) {
      toast.error("Couldn't load modpacks", {
        description: e instanceof Error ? e.message : String(e),
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gameSlug, user?.id]);

  const handleCreate = async () => {
    if (!name.trim()) {
      toast.error("Name required");
      return;
    }
    setBusy(true);
    try {
      await createModpack({
        gameSlug,
        name: name.trim(),
        description: desc.trim() || undefined,
        isPublic,
        mods: includeInstalled ? installedMods : [],
      });
      toast.success("Modpack created");
      setCreateOpen(false);
      setName("");
      setDesc("");
      setIsPublic(false);
      await refresh();
    } catch (e) {
      toast.error("Create failed", { description: e instanceof Error ? e.message : String(e) });
    } finally {
      setBusy(false);
    }
  };

  const handleRedeem = async () => {
    if (!code.trim()) return;
    setBusy(true);
    try {
      await redeemModpackCode(code.trim().toUpperCase());
      toast.success("Modpack imported");
      setRedeemOpen(false);
      setCode("");
      await refresh();
    } catch (e) {
      toast.error("Redeem failed", { description: e instanceof Error ? e.message : String(e) });
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this modpack? This can't be undone.")) return;
    try {
      await deleteModpack(id);
      setPacks((p) => p.filter((x) => x.id !== id));
      toast.success("Modpack deleted");
    } catch (e) {
      toast.error("Delete failed", { description: e instanceof Error ? e.message : String(e) });
    }
  };

  const handleTogglePublic = async (pack: ModpackWithMods) => {
    try {
      await updateModpack(pack.id, { is_public: !pack.is_public });
      setPacks((p) =>
        p.map((x) => (x.id === pack.id ? { ...x, is_public: !pack.is_public } : x)),
      );
    } catch (e) {
      toast.error("Update failed", { description: e instanceof Error ? e.message : String(e) });
    }
  };

  const copyCode = (c: string) => {
    navigator.clipboard.writeText(c);
    toast.success("Share code copied", { description: c });
  };

  if (!user) {
    return (
      <Card className="p-4 text-sm text-muted-foreground">
        Sign in to create and share modpacks for {gameTitle}.
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Package className="h-4 w-4 text-primary" />
          <h3 className={compact ? "text-sm font-semibold" : "text-lg font-semibold"}>
            Modpacks
          </h3>
          <Badge variant="outline" className="text-[10px]">{packs.length}</Badge>
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={() => setRedeemOpen(true)}>
            <Download className="mr-1 h-3.5 w-3.5" /> Redeem code
          </Button>
          <Button size="sm" onClick={() => setCreateOpen(true)}>
            <Plus className="mr-1 h-3.5 w-3.5" /> New modpack
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading modpacks...
        </div>
      ) : packs.length === 0 ? (
        <Card className="border-dashed p-4 text-center text-sm text-muted-foreground">
          No modpacks yet. Create one from your installed mods or redeem a friend's code.
        </Card>
      ) : (
        <div className="space-y-2">
          {packs.map((p) => (
            <Card key={p.id} className="p-3">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-medium truncate">{p.name}</span>
                    <Badge variant="secondary" className="text-[10px]">
                      {p.mods.length} mod{p.mods.length === 1 ? "" : "s"}
                    </Badge>
                    {p.is_public && (
                      <Badge variant="outline" className="gap-1 text-[10px]">
                        <Globe2 className="h-3 w-3" /> Public
                      </Badge>
                    )}
                  </div>
                  {p.description && (
                    <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                      {p.description}
                    </p>
                  )}
                  <div className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
                    <Share2 className="h-3 w-3" />
                    <code className="rounded bg-muted px-1.5 py-0.5">{p.share_code}</code>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-6 px-1.5"
                      onClick={() => copyCode(p.share_code)}
                    >
                      <Copy className="h-3 w-3" />
                    </Button>
                    {p.download_count > 0 && (
                      <span>· {p.download_count} import{p.download_count === 1 ? "" : "s"}</span>
                    )}
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 px-2"
                    onClick={() => handleTogglePublic(p)}
                    title={p.is_public ? "Make private" : "Make public"}
                  >
                    {p.is_public ? <Lock className="h-3.5 w-3.5" /> : <Globe2 className="h-3.5 w-3.5" />}
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 px-2 text-muted-foreground hover:text-destructive"
                    onClick={() => handleDelete(p.id)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New modpack</DialogTitle>
            <DialogDescription>
              Save a named set of mods for {gameTitle}. Share the generated code with
              friends so they can import it.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <label className="mb-1 block text-xs font-medium">Name</label>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="My modpack" />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium">Description (optional)</label>
              <Textarea
                value={desc}
                onChange={(e) => setDesc(e.target.value)}
                placeholder="What's in this modpack?"
                rows={3}
              />
            </div>
            {installedMods && installedMods.length > 0 && (
              <label className="flex items-center justify-between rounded-md border p-2 text-sm">
                <span>Include {installedMods.length} currently installed mods</span>
                <Switch checked={includeInstalled} onCheckedChange={setIncludeInstalled} />
              </label>
            )}
            <label className="flex items-center justify-between rounded-md border p-2 text-sm">
              <span>Make public (discoverable)</span>
              <Switch checked={isPublic} onCheckedChange={setIsPublic} />
            </label>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setCreateOpen(false)}>Cancel</Button>
            <Button onClick={handleCreate} disabled={busy}>
              {busy && <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />}
              Create
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={redeemOpen} onOpenChange={setRedeemOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Redeem modpack code</DialogTitle>
            <DialogDescription>
              Paste an 8-character share code to import a friend's modpack into your account.
            </DialogDescription>
          </DialogHeader>
          <Input
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            placeholder="ABCD1234"
            maxLength={8}
            className="font-mono tracking-widest"
          />
          <DialogFooter>
            <Button variant="ghost" onClick={() => setRedeemOpen(false)}>Cancel</Button>
            <Button onClick={handleRedeem} disabled={busy || code.trim().length < 4}>
              {busy && <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />}
              Redeem
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
