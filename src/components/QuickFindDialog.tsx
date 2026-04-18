import { useEffect, useState } from "react";
import { Loader2, Search, Sparkles } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { searchRawg, type RawgResult } from "@/lib/rawg";
import type { Game } from "@/lib/game-types";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onAdd: (game: Omit<Game, "id" | "addedAt">) => void;
}

export const QuickFindDialog = ({ open, onOpenChange, onAdd }: Props) => {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<RawgResult[] | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) {
      setQuery("");
      setResults(null);
    }
  }, [open]);

  const runSearch = async () => {
    const q = query.trim();
    if (q.length < 2) {
      toast.error("Type at least 2 characters");
      return;
    }
    setLoading(true);
    try {
      const list = await searchRawg(q, 8);
      setResults(list);
      if (list.length === 0) toast("No matches found");
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Unknown error";
      toast.error("Search failed", { description: msg });
    } finally {
      setLoading(false);
    }
  };

  const addPick = (r: RawgResult) => {
    onAdd({
      title: r.title,
      cover: r.cover,
      genre: r.genre,
      developer: r.developer,
      description: r.description,
    });
    toast.success(`${r.title} added`);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl max-h-[90vh] flex flex-col rounded-3xl bg-card border-border">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5" /> Quick find
          </DialogTitle>
          <DialogDescription>
            Search any game by title — pick a match and it's added with cover and metadata.
          </DialogDescription>
        </DialogHeader>

        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              autoFocus
              placeholder="Game title..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") runSearch();
              }}
              className="pl-9 rounded-xl bg-secondary border-border"
            />
          </div>
          <Button
            onClick={runSearch}
            disabled={loading || query.trim().length < 2}
            className="rounded-xl bg-[image:var(--gradient-primary)] shadow-[var(--glow-primary)]"
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Search"}
          </Button>
        </div>

        {results && (
          <div className="flex-1 overflow-y-auto rounded-xl border border-border divide-y divide-border">
            {results.length === 0 ? (
              <div className="py-10 text-center text-sm text-muted-foreground">
                No matches
              </div>
            ) : (
              results.map((r) => (
                <button
                  key={r.rawgId}
                  type="button"
                  onClick={() => addPick(r)}
                  className="w-full flex items-center gap-3 p-3 text-left hover:bg-secondary/60 transition-colors"
                >
                  {r.cover ? (
                    <img
                      src={r.cover}
                      alt={r.title}
                      className="h-14 w-24 object-cover rounded-lg bg-muted shrink-0"
                      loading="lazy"
                    />
                  ) : (
                    <div className="h-14 w-24 rounded-lg bg-muted shrink-0" />
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="font-medium truncate">{r.title}</div>
                    <div className="text-xs text-muted-foreground truncate">
                      {[r.released?.slice(0, 4), r.genre, r.developer]
                        .filter(Boolean)
                        .join(" · ")}
                    </div>
                    {r.description && (
                      <div className="text-xs text-muted-foreground/80 line-clamp-2 mt-1">
                        {r.description}
                      </div>
                    )}
                  </div>
                </button>
              ))
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};
