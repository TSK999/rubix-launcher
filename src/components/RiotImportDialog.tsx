import { useEffect, useMemo, useState } from "react";
import { FolderSearch, Loader2, Search } from "lucide-react";
import { toast } from "sonner";

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
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import { StoreIcon } from "@/components/StoreIcon";
import { searchRawg } from "@/lib/rawg";
import type { Game } from "@/lib/game-types";
import type { RiotScanGame } from "@/types/electron";

export type RiotImportGame = Omit<Game, "id" | "addedAt">;

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onImport: (games: RiotImportGame[]) => void;
}

const formatSize = (bytes: number) => {
  if (!bytes) return "";
  const gb = bytes / 1024 ** 3;
  if (gb >= 1) return `${gb.toFixed(1)} GB`;
  const mb = bytes / 1024 ** 2;
  return `${mb.toFixed(0)} MB`;
};

const buildRiotPath = (g: RiotScanGame) =>
  `riot://${g.productId}/${g.patchline || "live"}`;

export const RiotImportDialog = ({ open, onOpenChange, onImport }: Props) => {
  const [scanning, setScanning] = useState(false);
  const [importing, setImporting] = useState(false);
  const [scanned, setScanned] = useState<RiotScanGame[] | null>(null);
  const [scannedDir, setScannedDir] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [filter, setFilter] = useState("");

  useEffect(() => {
    if (!open) {
      setScanned(null);
      setScannedDir(null);
      setSelected(new Set());
      setFilter("");
    }
  }, [open]);

  const gameKey = (g: RiotScanGame) => `${g.productId}:${g.patchline || "live"}`;

  const runScan = async () => {
    if (!window.rubix?.isElectron) {
      toast.error("Desktop app required", {
        description: "Riot library scanning only works in the RUBIX desktop app on Windows.",
      });
      return;
    }
    setScanning(true);
    try {
      const riot = window.rubix.riot;
      if (!riot) throw new Error("Riot bridge not available — rebuild the desktop app");
      const res = await riot.scanInstalled();
      if (!res.ok) throw new Error(res.error || "Scan failed");
      setScanned(res.games);
      setScannedDir(res.scannedDir);
      setSelected(new Set(res.games.map(gameKey)));
      if (res.games.length === 0) {
        toast.warning("No Riot games found", {
          description: "Make sure Riot Client and supported games are installed.",
        });
      } else {
        toast.success(`Found ${res.games.length} installed Riot games`);
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Unknown error";
      toast.error("Scan failed", { description: msg });
    } finally {
      setScanning(false);
    }
  };

  const filtered = useMemo(() => {
    if (!scanned) return [];
    const q = filter.trim().toLowerCase();
    if (!q) return scanned;
    return scanned.filter((g) => g.displayName.toLowerCase().includes(q));
  }, [scanned, filter]);

  const allFilteredSelected = filtered.length > 0 && filtered.every((g) => selected.has(gameKey(g)));

  const toggleAllFiltered = () => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (allFilteredSelected) filtered.forEach((g) => next.delete(gameKey(g)));
      else filtered.forEach((g) => next.add(gameKey(g)));
      return next;
    });
  };

  const importSelected = async () => {
    if (!scanned || selected.size === 0) {
      toast("Select at least one game");
      return;
    }
    setImporting(true);
    const picks = scanned.filter((g) => selected.has(gameKey(g)));
    const out: RiotImportGame[] = [];
    let coverHits = 0;

    for (const g of picks) {
      let cover: string | undefined;
      let genre: string | undefined;
      let developer: string | undefined;
      let description: string | undefined;
      try {
        const [top] = await searchRawg(g.displayName, 1);
        if (top) {
          cover = top.cover;
          genre = top.genre;
          developer = top.developer;
          description = top.description;
          if (cover) coverHits++;
        }
      } catch {
        /* skip individual cover failures */
      }

      out.push({
        title: g.displayName,
        cover,
        genre,
        developer: developer ?? "Riot Games",
        description,
        path: buildRiotPath(g),
        riotProductId: g.productId,
        riotPatchline: g.patchline || "live",
        riotClientPath: g.clientPath,
        riotLaunchUri: buildRiotPath(g),
      });
    }

    onImport(out);
    toast.success(`Imported ${out.length} Riot games`, {
      description: `${coverHits} covers fetched from RAWG.`,
    });
    setImporting(false);
    onOpenChange(false);
  };

  const isElectron = !!window.rubix?.isElectron;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <StoreIcon source="riot" className="h-5 w-5" /> Import from Riot
          </DialogTitle>
          <DialogDescription>
            Scans Riot Client metadata for installed titles. Covers are pulled from RAWG.
          </DialogDescription>
        </DialogHeader>

        {!isElectron ? (
          <div className="rounded-xl border border-border bg-secondary/40 p-6 text-center text-sm text-muted-foreground">
            <StoreIcon source="riot" className="h-8 w-8 mx-auto mb-3 opacity-70" />
            Riot library scanning requires the RUBIX desktop app on Windows. You can still add Riot
            games manually and launch them from the desktop app.
          </div>
        ) : (
          <>
            <div className="flex gap-2">
              <Button onClick={runScan} disabled={scanning} className="rounded-xl">
                {scanning ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" /> Scanning...
                  </>
                ) : (
                  <>
                    <FolderSearch className="h-4 w-4 mr-2" /> Scan installed games
                  </>
                )}
              </Button>
              {scannedDir && (
                <p className="text-[11px] text-muted-foreground self-center truncate" title={scannedDir}>
                  {scannedDir}
                </p>
              )}
            </div>

            {scanned && scanned.length > 0 && (
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
                      const key = gameKey(g);
                      const checked = selected.has(key);
                      return (
                        <li
                          key={key}
                          className="flex items-center gap-3 py-2 cursor-pointer"
                          onClick={() => {
                            setSelected((prev) => {
                              const next = new Set(prev);
                              if (next.has(key)) next.delete(key);
                              else next.add(key);
                              return next;
                            });
                          }}
                        >
                          <Checkbox checked={checked} />
                          <div className="h-12 w-9 rounded bg-secondary grid place-items-center shrink-0">
                            <StoreIcon source="riot" className="h-5 w-5 opacity-70" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="font-medium truncate">{g.displayName}</div>
                            <div className="text-xs text-muted-foreground truncate">
                              {[g.patchline, formatSize(g.installSize), g.installLocation]
                                .filter(Boolean)
                                .join(" · ")}
                            </div>
                          </div>
                        </li>
                      );
                    })}
                    {filtered.length === 0 && (
                      <li className="py-6 text-center text-sm text-muted-foreground">No games match</li>
                    )}
                  </ul>
                </ScrollArea>

                <div className="text-xs text-muted-foreground">
                  {selected.size} of {scanned.length} selected
                </div>
              </>
            )}
          </>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={importSelected} disabled={!scanned || selected.size === 0 || importing}>
            {importing ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
            Import selected
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
