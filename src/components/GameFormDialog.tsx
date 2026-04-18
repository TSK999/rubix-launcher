import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Loader2, Sparkles } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { Game } from "@/lib/game-types";

type RawgResult = {
  rawgId: number;
  title: string;
  released?: string;
  cover?: string;
  genre?: string;
  developer?: string;
  description?: string;
};

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initial?: Game | null;
  onSubmit: (data: Omit<Game, "id" | "addedAt"> & { id?: string }) => void;
};

const empty = {
  title: "",
  cover: "",
  path: "",
  genre: "",
  description: "",
  developer: "",
  status: "none" as "none" | "early-access" | "beta",
};

export const GameFormDialog = ({ open, onOpenChange, initial, onSubmit }: Props) => {
  const [form, setForm] = useState(empty);
  const [searching, setSearching] = useState(false);
  const [results, setResults] = useState<RawgResult[] | null>(null);

  useEffect(() => {
    if (open) {
      setForm({
        title: initial?.title ?? "",
        cover: initial?.cover ?? "",
        path: initial?.path ?? "",
        genre: initial?.genre ?? "",
        description: initial?.description ?? "",
        developer: initial?.developer ?? "",
        status: initial?.status ?? "none",
      });
      setResults(null);
    }
  }, [open, initial]);

  const handleCoverUpload = (file: File) => {
    const reader = new FileReader();
    reader.onload = () => setForm((f) => ({ ...f, cover: String(reader.result) }));
    reader.readAsDataURL(file);
  };

  const findCover = async () => {
    const q = form.title.trim();
    if (q.length < 2) {
      toast.error("Enter a title first");
      return;
    }
    setSearching(true);
    try {
      const { data, error } = await supabase.functions.invoke("rawg-search", {
        body: { query: q, pageSize: 6 },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      const list: RawgResult[] = data?.results ?? [];
      setResults(list);
      if (list.length === 0) toast("No matches found");
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Unknown error";
      toast.error("Search failed", { description: msg });
    } finally {
      setSearching(false);
    }
  };

  const applyResult = (r: RawgResult) => {
    setForm((f) => ({
      ...f,
      title: r.title || f.title,
      cover: r.cover || f.cover,
      genre: r.genre || f.genre,
      developer: r.developer || f.developer,
      description: r.description || f.description,
    }));
    setResults(null);
    toast.success(`Applied: ${r.title}`);
  };

  const pickExecutable = async () => {
    if (!window.rubix?.isElectron) {
      toast("File picker only available in the desktop app");
      return;
    }
    const p = await window.rubix.pickExecutable();
    if (p) setForm((f) => ({ ...f, path: p }));
  };

  const submit = () => {
    if (!form.title.trim()) {
      toast.error("Game title is required");
      return;
    }
    onSubmit({
      id: initial?.id,
      title: form.title.trim(),
      cover: form.cover || undefined,
      path: form.path || undefined,
      genre: form.genre || undefined,
      description: form.description || undefined,
      developer: form.developer || undefined,
      favorite: initial?.favorite,
      lastPlayedAt: initial?.lastPlayedAt,
      playCount: initial?.playCount,
      status: form.status === "none" ? undefined : form.status,
    });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="rounded-3xl bg-card border-border max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{initial ? "Edit game" : "Add a game"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="title">Title *</Label>
            <div className="flex gap-2">
              <Input
                id="title"
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                placeholder="e.g. Cyberpunk 2077"
                className="rounded-xl bg-secondary border-border"
              />
              <Button
                type="button"
                variant="secondary"
                onClick={findCover}
                disabled={searching || form.title.trim().length < 2}
                className="rounded-xl shrink-0"
                title="Auto-fill cover & details from RAWG"
              >
                {searching ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <>
                    <Sparkles className="h-4 w-4 mr-2" /> Find
                  </>
                )}
              </Button>
            </div>

            {results && results.length > 0 && (
              <div className="rounded-xl border border-border bg-secondary/40 divide-y divide-border max-h-72 overflow-y-auto">
                {results.map((r) => (
                  <button
                    key={r.rawgId}
                    type="button"
                    onClick={() => applyResult(r)}
                    className="w-full flex items-center gap-3 p-2 text-left hover:bg-secondary transition-colors"
                  >
                    {r.cover ? (
                      <img
                        src={r.cover}
                        alt={r.title}
                        className="h-12 w-20 object-cover rounded bg-muted shrink-0"
                        loading="lazy"
                      />
                    ) : (
                      <div className="h-12 w-20 rounded bg-muted shrink-0" />
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-medium truncate">{r.title}</div>
                      <div className="text-xs text-muted-foreground truncate">
                        {[r.released?.slice(0, 4), r.genre, r.developer]
                          .filter(Boolean)
                          .join(" · ")}
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="genre">Genre</Label>
              <Input
                id="genre"
                value={form.genre}
                onChange={(e) => setForm({ ...form, genre: e.target.value })}
                placeholder="RPG, FPS..."
                className="rounded-xl bg-secondary border-border"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="developer">Developer</Label>
              <Input
                id="developer"
                value={form.developer}
                onChange={(e) => setForm({ ...form, developer: e.target.value })}
                placeholder="Studio name"
                className="rounded-xl bg-secondary border-border"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="path">Launch path / URL</Label>
            <div className="flex gap-2">
              <Input
                id="path"
                value={form.path}
                onChange={(e) => setForm({ ...form, path: e.target.value })}
                placeholder="C:\Games\game.exe or steam://run/..."
                className="rounded-xl bg-secondary border-border"
              />
              {typeof window !== "undefined" && window.rubix?.isElectron && (
                <Button
                  type="button"
                  variant="secondary"
                  onClick={pickExecutable}
                  className="rounded-xl shrink-0"
                >
                  Browse
                </Button>
              )}
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">Description</Label>
            <Textarea
              id="description"
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              placeholder="Short description of the game..."
              rows={3}
              className="rounded-xl bg-secondary border-border resize-none"
            />
          </div>

          <div className="space-y-2">
            <Label>Release status</Label>
            <div className="flex gap-2">
              {(["none", "early-access", "beta"] as const).map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setForm({ ...form, status: s })}
                  className={`flex-1 rounded-xl px-3 py-2 text-sm border transition-colors ${
                    form.status === s
                      ? "bg-primary text-primary-foreground border-primary shadow-[var(--glow-primary)]"
                      : "bg-secondary border-border text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {s === "none" ? "Released" : s === "early-access" ? "Early Access" : "Beta"}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="cover">Cover image (horizontal works best)</Label>
            <Input
              id="cover"
              type="file"
              accept="image/*"
              onChange={(e) => e.target.files?.[0] && handleCoverUpload(e.target.files[0])}
              className="rounded-xl bg-secondary border-border file:text-foreground file:bg-transparent file:border-0"
            />
            {form.cover && (
              <img
                src={form.cover}
                alt="preview"
                className="aspect-video w-full object-cover rounded-xl border border-border"
              />
            )}
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} className="rounded-xl">
            Cancel
          </Button>
          <Button
            onClick={submit}
            className="rounded-xl bg-[image:var(--gradient-primary)] shadow-[var(--glow-primary)]"
          >
            {initial ? "Save changes" : "Add to library"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
