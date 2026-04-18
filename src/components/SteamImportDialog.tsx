import { useEffect, useMemo, useState } from "react";
import { Loader2, Search, Gamepad2 } from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import { STEAM_ID_KEY } from "@/lib/game-types";

export type SteamLibraryItem = {
  appId: number;
  title: string;
  cover: string;
  header?: string;
  playtimeMinutes: number;
  lastPlayedAt?: number;
  launchPath: string;
};

export type SteamGameDetail = SteamLibraryItem & {
  description?: string;
  genre?: string;
  developer?: string;
};

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onImport: (games: SteamGameDetail[]) => void;
}

const formatPlaytime = (mins: number) => {
  if (mins < 60) return `${mins}m`;
  const h = Math.floor(mins / 60);
  return `${h}h`;
};

export const SteamImportDialog = ({ open, onOpenChange, onImport }: Props) => {
  const [steamId, setSteamId] = useState("");
  const [library, setLibrary] = useState<SteamLibraryItem[] | null>(null);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [filter, setFilter] = useState("");
  const [loading, setLoading] = useState(false);
  const [importing, setImporting] = useState(false);

  useEffect(() => {
    if (open) {
      const stored = localStorage.getItem(STEAM_ID_KEY);
      if (stored) setSteamId(stored);
    } else {
      // reset on close
      setLibrary(null);
      setSelected(new Set());
      setFilter("");
    }
  }, [open]);

  const fetchLibrary = async () => {
    if (!/^\d{17}$/.test(steamId.trim())) {
      toast.error("Invalid Steam ID", {
        description: "Must be a 17-digit SteamID64.",
      });
      return;
    }
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("steam-import", {
        body: { steamId: steamId.trim() },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      const games: SteamLibraryItem[] = data?.games ?? [];
      setLibrary(games);
      setSelected(new Set(games.map((g) => g.appId))); // pre-select all
      localStorage.setItem(STEAM_ID_KEY, steamId.trim());

      if (games.length === 0) {
        toast.warning("No games found", {
          description:
            data?.warning ??
            "Make sure your Steam profile and game details are public.",
        });
      } else {
        toast.success(`Found ${games.length} games`);
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Unknown error";
      toast.error("Failed to fetch library", { description: msg });
    } finally {
      setLoading(false);
    }
  };

  const importSelected = async () => {
    if (selected.size === 0) {
      toast("Select at least one game");
      return;
    }
    setImporting(true);
    try {
      const { data, error } = await supabase.functions.invoke("steam-import", {
        body: { steamId: steamId.trim(), appIds: Array.from(selected) },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      const games: SteamGameDetail[] = data?.games ?? [];
      onImport(games);
      onOpenChange(false);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Unknown error";
      toast.error("Import failed", { description: msg });
    } finally {
      setImporting(false);
    }
  };

  const filtered = useMemo(() => {
    if (!library) return [];
    const q = filter.trim().toLowerCase();
    if (!q) return library;
    return library.filter((g) => g.title.toLowerCase().includes(q));
  }, [library, filter]);

  const allFilteredSelected =
    filtered.length > 0 && filtered.every((g) => selected.has(g.appId));

  const toggleAllFiltered = () => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (allFilteredSelected) {
        filtered.forEach((g) => next.delete(g.appId));
      } else {
        filtered.forEach((g) => next.add(g.appId));
      }
      return next;
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Gamepad2 className="h-5 w-5" /> Import from Steam
          </DialogTitle>
          <DialogDescription>
            Sync your owned games. Your Steam profile and game details must be set to{" "}
            <span className="font-medium">Public</span>.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2">
          <Label htmlFor="steam-id">SteamID64 (17 digits)</Label>
          <div className="flex gap-2">
            <Input
              id="steam-id"
              placeholder="76561198000000000"
              value={steamId}
              onChange={(e) => setSteamId(e.target.value.replace(/\D/g, "").slice(0, 17))}
              className="font-mono"
            />
            <Button onClick={fetchLibrary} disabled={loading || !steamId}>
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Fetch"}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Find yours at steamid.io — paste your profile URL there.
          </p>
        </div>

        {library && (
          <>
            <div className="flex items-center gap-2 pt-2">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Filter games..."
                  value={filter}
                  onChange={(e) => setFilter(e.target.value)}
                  className="pl-9"
                />
              </div>
              <Button variant="outline" size="sm" onClick={toggleAllFiltered}>
                {allFilteredSelected ? "Deselect all" : "Select all"}
              </Button>
            </div>

            <ScrollArea className="flex-1 -mx-6 px-6 border-y border-border">
              <ul className="divide-y divide-border">
                {filtered.map((g) => {
                  const checked = selected.has(g.appId);
                  return (
                    <li
                      key={g.appId}
                      className="flex items-center gap-3 py-2 cursor-pointer"
                      onClick={() => {
                        setSelected((prev) => {
                          const next = new Set(prev);
                          if (next.has(g.appId)) next.delete(g.appId);
                          else next.add(g.appId);
                          return next;
                        });
                      }}
                    >
                      <Checkbox checked={checked} />
                      <img
                        src={g.cover}
                        alt={`${g.title} cover`}
                        className="h-12 w-9 object-cover rounded bg-secondary"
                        loading="lazy"
                        onError={(e) => {
                          (e.target as HTMLImageElement).src =
                            g.header ?? "/placeholder.svg";
                        }}
                      />
                      <div className="flex-1 min-w-0">
                        <div className="font-medium truncate">{g.title}</div>
                        <div className="text-xs text-muted-foreground">
                          {formatPlaytime(g.playtimeMinutes)} played
                        </div>
                      </div>
                    </li>
                  );
                })}
                {filtered.length === 0 && (
                  <li className="py-6 text-center text-sm text-muted-foreground">
                    No games match
                  </li>
                )}
              </ul>
            </ScrollArea>

            <div className="text-xs text-muted-foreground">
              {selected.size} of {library.length} selected
            </div>
          </>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={importSelected}
            disabled={!library || selected.size === 0 || importing}
            className="bg-[image:var(--gradient-primary)] shadow-[var(--glow-primary)]"
          >
            {importing ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" /> Importing...
              </>
            ) : (
              `Import ${selected.size || ""}`.trim()
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
