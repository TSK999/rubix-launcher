import { useEffect, useMemo, useState } from "react";
import { Plus, Gamepad2, Search, Download, Sparkles, Wand2, Store, Gamepad, MoreHorizontal } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  DndContext,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import { SortableContext, arrayMove, rectSortingStrategy } from "@dnd-kit/sortable";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { GameCard } from "@/components/GameCard";
import { GameFormDialog } from "@/components/GameFormDialog";
import { GameDetail } from "@/components/GameDetail";
import { Sidebar, type Collection } from "@/components/Sidebar";
import { SteamImportDialog, type SteamGameDetail } from "@/components/SteamImportDialog";
import { EpicImportDialog, type EpicImportGame } from "@/components/EpicImportDialog";
import { EaImportDialog, type EaImportGame } from "@/components/EaImportDialog";
import { QuickFindDialog } from "@/components/QuickFindDialog";
import { searchRawg } from "@/lib/rawg";
import { STORAGE_KEY, getGameSource, type Game, type GameSource } from "@/lib/game-types";

const RECENT_WINDOW_DAYS = 30;

const Index = () => {
  const [games, setGames] = useState<Game[]>([]);
  const [search, setSearch] = useState("");
  const [collection, setCollection] = useState<Collection>("all");
  const [genre, setGenre] = useState<string | null>(null);
  const [source, setSource] = useState<GameSource | null>(null);

  const [formOpen, setFormOpen] = useState(false);
  const [steamOpen, setSteamOpen] = useState(false);
  const [epicOpen, setEpicOpen] = useState(false);
  const [eaOpen, setEaOpen] = useState(false);
  const [findOpen, setFindOpen] = useState(false);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [editing, setEditing] = useState<Game | null>(null);
  const [detailId, setDetailId] = useState<string | null>(null);

  // Load
  useEffect(() => {
    document.title = "RUBIX Launcher — Your game library";
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) setGames(JSON.parse(raw));
    } catch {}
  }, []);

  // Persist
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(games));
  }, [games]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } })
  );

  const upsertGame = (data: Omit<Game, "id" | "addedAt"> & { id?: string }) => {
    if (data.id) {
      setGames((g) => g.map((x) => (x.id === data.id ? { ...x, ...data, id: x.id } : x)));
      toast.success("Game updated");
    } else {
      const game: Game = {
        ...data,
        id: crypto.randomUUID(),
        addedAt: Date.now(),
      };
      setGames((g) => [game, ...g]);
      toast.success(`${game.title} added to library`);
    }
  };

  const removeGame = (id: string) => {
    setGames((g) => g.filter((x) => x.id !== id));
    toast("Game removed");
  };

  const updateGame = (id: string, patch: Partial<Game>) => {
    setGames((g) => g.map((x) => (x.id === id ? { ...x, ...patch } : x)));
  };

  const addFromQuickFind = (data: Omit<Game, "id" | "addedAt">) => {
    setGames((g) => [
      { ...data, id: crypto.randomUUID(), addedAt: Date.now() },
      ...g,
    ]);
  };

  const fixMissingCovers = async () => {
    const targets = games.filter((g) => !g.cover);
    if (targets.length === 0) {
      toast("All games already have covers");
      return;
    }
    setBulkBusy(true);
    toast(`Looking up ${targets.length} games...`);
    let fixed = 0;
    try {
      for (const g of targets) {
        try {
          const [top] = await searchRawg(g.title, 1);
          if (top?.cover) {
            updateGame(g.id, {
              cover: top.cover,
              genre: g.genre ?? top.genre,
              developer: g.developer ?? top.developer,
              description: g.description ?? top.description,
            });
            fixed++;
          }
        } catch {
          /* skip individual failures */
        }
      }
      toast.success(`Updated ${fixed} of ${targets.length} games`);
    } finally {
      setBulkBusy(false);
    }
  };

  const importFromSteam = (incoming: SteamGameDetail[]) => {
    setGames((current) => {
      const byAppId = new Map<number, Game>();
      current.forEach((g) => {
        if (g.steamAppId) byAppId.set(g.steamAppId, g);
      });

      const updated = [...current];
      let added = 0;
      let refreshed = 0;

      for (const s of incoming) {
        const existing = byAppId.get(s.appId);
        if (existing) {
          const idx = updated.findIndex((x) => x.id === existing.id);
          if (idx !== -1) {
            updated[idx] = {
              ...existing,
              title: s.title,
              cover: s.cover,
              path: s.launchPath,
              description: s.description ?? existing.description,
              genre: s.genre ?? existing.genre,
              developer: s.developer ?? existing.developer,
              lastPlayedAt: s.lastPlayedAt ?? existing.lastPlayedAt,
              steamAppId: s.appId,
            };
            refreshed++;
          }
        } else {
          updated.unshift({
            id: crypto.randomUUID(),
            title: s.title,
            cover: s.cover,
            path: s.launchPath,
            description: s.description,
            genre: s.genre,
            developer: s.developer,
            lastPlayedAt: s.lastPlayedAt,
            steamAppId: s.appId,
            addedAt: Date.now(),
          });
          added++;
        }
      }

      toast.success("Steam library synced", {
        description: `${added} added · ${refreshed} updated`,
      });
      return updated;
    });
  };

  const toggleFavorite = (id: string) => {
    setGames((g) => g.map((x) => (x.id === id ? { ...x, favorite: !x.favorite } : x)));
  };

  const launchGame = async (g: Game) => {
    // Update stats first
    setGames((all) =>
      all.map((x) =>
        x.id === g.id
          ? { ...x, lastPlayedAt: Date.now(), playCount: (x.playCount ?? 0) + 1 }
          : x
      )
    );

    // Epic Games — use dedicated launcher URI in desktop app
    if (window.rubix?.isElectron && g.epicAppName && g.epicCatalogNamespace && g.epicCatalogItemId) {
      const res = await window.rubix.epic.launch({
        appName: g.epicAppName,
        catalogNamespace: g.epicCatalogNamespace,
        catalogItemId: g.epicCatalogItemId,
      });
      if (res.ok) toast.success(`Launching ${g.title} via Epic`);
      else toast.error(`Failed to launch ${g.title}`, { description: res.error });
      return;
    }

    // EA app — launch via origin2:// URI
    if (window.rubix?.isElectron && g.eaAppId) {
      const res = await window.rubix.ea.launch({
        appId: g.eaAppId,
        contentId: g.eaContentId,
      });
      if (res.ok) toast.success(`Launching ${g.title} via EA app`);
      else toast.error(`Failed to launch ${g.title}`, { description: res.error });
      return;
    }

    if (!g.path) {
      toast(`No launch path set for ${g.title}`, {
        description: "Edit the game to add a path or URL.",
      });
      return;
    }
    if (window.rubix?.isElectron) {
      const res = await window.rubix.launchGame(g.path);
      if (res.ok) toast.success(`Launching ${g.title}`);
      else toast.error(`Failed to launch ${g.title}`, { description: res.error });
      return;
    }
    if (/^[a-z][a-z0-9+.-]*:\/\//i.test(g.path)) {
      window.open(g.path, "_blank");
      toast.success(`Opening ${g.title}`);
    } else {
      toast.error("Local files can only be launched in the desktop app", {
        description: "Build the RUBIX desktop app to launch .exe files.",
      });
    }
  };

  const importFromEpic = (incoming: EpicImportGame[]) => {
    setGames((current) => {
      const byAppName = new Map<string, Game>();
      current.forEach((g) => {
        if (g.epicAppName) byAppName.set(g.epicAppName, g);
      });
      const updated = [...current];
      let added = 0;
      let refreshed = 0;
      for (const e of incoming) {
        const existing = e.epicAppName ? byAppName.get(e.epicAppName) : undefined;
        if (existing) {
          const idx = updated.findIndex((x) => x.id === existing.id);
          if (idx !== -1) {
            updated[idx] = { ...existing, ...e };
            refreshed++;
          }
        } else {
          updated.unshift({ ...e, id: crypto.randomUUID(), addedAt: Date.now() });
          added++;
        }
      }
      toast.success("Epic library synced", {
        description: `${added} added · ${refreshed} updated`,
      });
      return updated;
    });
  };

  const importFromEa = (incoming: EaImportGame[]) => {
    setGames((current) => {
      const byAppId = new Map<string, Game>();
      current.forEach((g) => {
        if (g.eaAppId) byAppId.set(g.eaAppId, g);
      });
      const updated = [...current];
      let added = 0;
      let refreshed = 0;
      for (const e of incoming) {
        const existing = e.eaAppId ? byAppId.get(e.eaAppId) : undefined;
        if (existing) {
          const idx = updated.findIndex((x) => x.id === existing.id);
          if (idx !== -1) {
            updated[idx] = { ...existing, ...e };
            refreshed++;
          }
        } else {
          updated.unshift({ ...e, id: crypto.randomUUID(), addedAt: Date.now() });
          added++;
        }
      }
      toast.success("EA library synced", {
        description: `${added} added · ${refreshed} updated`,
      });
      return updated;
    });
  };

  // Derived data
  const genres = useMemo(() => {
    const s = new Set<string>();
    games.forEach((g) => g.genre && s.add(g.genre));
    return Array.from(s).sort();
  }, [games]);

  const counts = useMemo(() => {
    const recentCutoff = Date.now() - RECENT_WINDOW_DAYS * 86400 * 1000;
    return {
      all: games.length,
      favorites: games.filter((g) => g.favorite).length,
      recent: games.filter((g) => (g.lastPlayedAt ?? 0) >= recentCutoff).length,
    };
  }, [games]);

  const sourceCounts = useMemo(() => {
    const c = { steam: 0, epic: 0, ea: 0, other: 0 };
    games.forEach((g) => {
      c[getGameSource(g)]++;
    });
    return c;
  }, [games]);

  const filtered = useMemo(() => {
    const recentCutoff = Date.now() - RECENT_WINDOW_DAYS * 86400 * 1000;
    let list = games;
    if (collection === "favorites") list = list.filter((g) => g.favorite);
    if (collection === "recent") {
      list = list
        .filter((g) => (g.lastPlayedAt ?? 0) >= recentCutoff)
        .sort((a, b) => (b.lastPlayedAt ?? 0) - (a.lastPlayedAt ?? 0));
    }
    if (genre) list = list.filter((g) => g.genre === genre);
    if (source) list = list.filter((g) => getGameSource(g) === source);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(
        (g) =>
          g.title.toLowerCase().includes(q) ||
          g.developer?.toLowerCase().includes(q) ||
          g.genre?.toLowerCase().includes(q)
      );
    }
    return list;
  }, [games, collection, genre, source, search]);

  const handleDragEnd = (e: DragEndEvent) => {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    // Only allow reordering when viewing the full unsorted "all" library
    if (collection !== "all" || genre || search.trim()) {
      toast("Clear filters to reorder games");
      return;
    }
    setGames((g) => {
      const oldIndex = g.findIndex((x) => x.id === active.id);
      const newIndex = g.findIndex((x) => x.id === over.id);
      return arrayMove(g, oldIndex, newIndex);
    });
  };

  const detailGame = games.find((g) => g.id === detailId) ?? null;
  const showEmptyLibrary = games.length === 0;
  const showEmptyFiltered = !showEmptyLibrary && filtered.length === 0;

  return (
    <div className="min-h-screen bg-background text-foreground flex">
      <Sidebar
        collection={collection}
        onCollection={setCollection}
        genres={genres}
        selectedGenre={genre}
        onGenre={setGenre}
        counts={counts}
        selectedSource={source}
        onSource={setSource}
        sourceCounts={sourceCounts}
      />

      <div className="flex-1 flex flex-col min-w-0">
        {/* Header */}
        <header className="sticky top-0 z-30 backdrop-blur-xl bg-background/70 border-b border-border">
          <div className="flex items-center justify-between gap-4 px-6 lg:px-10 py-5">
            <div className="md:hidden flex items-center gap-3">
              <div className="h-10 w-10 rounded-2xl bg-[image:var(--gradient-primary)] grid place-items-center shadow-[var(--glow-primary)]">
                <Gamepad2 className="h-5 w-5 text-primary-foreground" />
              </div>
              <h1 className="text-lg font-bold tracking-tight">RUBIX</h1>
            </div>

            <div className="hidden md:block">
              <h2 className="text-2xl font-bold tracking-tight capitalize">
                {collection === "all" ? "All games" : collection === "favorites" ? "Favorites" : "Recently played"}
                {genre && <span className="text-muted-foreground font-light"> · {genre}</span>}
              </h2>
              <p className="text-xs text-muted-foreground mt-0.5">
                {filtered.length} {filtered.length === 1 ? "game" : "games"}
              </p>
            </div>

            <div className="flex items-center gap-2 flex-1 max-w-md md:ml-auto md:mr-4">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search library..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-9 rounded-2xl bg-secondary border-border h-11"
                />
              </div>
            </div>

            <Button
              onClick={() => {
                setEditing(null);
                setFormOpen(true);
              }}
              className="rounded-2xl h-11 px-5 bg-[image:var(--gradient-primary)] hover:opacity-90 shadow-[var(--glow-primary)]"
            >
              <Plus className="h-4 w-4 mr-2" />
              <span className="hidden sm:inline">Add Game</span>
            </Button>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="outline"
                  size="icon"
                  className="rounded-2xl h-11 w-11 shrink-0"
                  title="More actions"
                >
                  <MoreHorizontal className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuLabel>Find & fix</DropdownMenuLabel>
                <DropdownMenuItem onClick={() => setFindOpen(true)}>
                  <Sparkles className="h-4 w-4 mr-2" /> Find a game
                </DropdownMenuItem>
                <DropdownMenuItem onClick={fixMissingCovers} disabled={bulkBusy}>
                  <Wand2 className="h-4 w-4 mr-2" />
                  {bulkBusy ? "Fixing covers..." : "Fix missing covers"}
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuLabel>Import library</DropdownMenuLabel>
                <DropdownMenuItem onClick={() => setSteamOpen(true)}>
                  <Download className="h-4 w-4 mr-2" /> Import from Steam
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setEpicOpen(true)}>
                  <Store className="h-4 w-4 mr-2" /> Import from Epic
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setEaOpen(true)}>
                  <Gamepad className="h-4 w-4 mr-2" /> Import from EA
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </header>

        {/* Library */}
        <main className="flex-1 px-6 lg:px-10 py-8">
          {showEmptyLibrary ? (
            <EmptyState
              title="Your library is empty"
              body="Add your first game to get started. Set a title, cover and launch path."
              cta={
                <Button
                  onClick={() => {
                    setEditing(null);
                    setFormOpen(true);
                  }}
                  className="rounded-2xl bg-[image:var(--gradient-primary)] shadow-[var(--glow-primary)]"
                >
                  <Plus className="h-4 w-4 mr-2" /> Add your first game
                </Button>
              }
            />
          ) : showEmptyFiltered ? (
            <EmptyState
              title="No games match"
              body="Try clearing the search or selecting a different collection."
            />
          ) : (
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
              <SortableContext items={filtered.map((g) => g.id)} strategy={rectSortingStrategy}>
                <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-6">
                  {filtered.map((g) => (
                    <GameCard
                      key={g.id}
                      game={g}
                      onOpen={(x) => setDetailId(x.id)}
                      onLaunch={launchGame}
                      onToggleFavorite={toggleFavorite}
                    />
                  ))}
                </div>
              </SortableContext>
            </DndContext>
          )}
        </main>
      </div>

      <GameFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        initial={editing}
        onSubmit={upsertGame}
      />

      <SteamImportDialog
        open={steamOpen}
        onOpenChange={setSteamOpen}
        onImport={importFromSteam}
      />

      <EpicImportDialog
        open={epicOpen}
        onOpenChange={setEpicOpen}
        onImport={importFromEpic}
      />

      <EaImportDialog
        open={eaOpen}
        onOpenChange={setEaOpen}
        onImport={importFromEa}
      />

      <QuickFindDialog
        open={findOpen}
        onOpenChange={setFindOpen}
        onAdd={addFromQuickFind}
      />

      <GameDetail
        game={detailGame}
        onClose={() => setDetailId(null)}
        onLaunch={launchGame}
        onEdit={(g) => {
          setEditing(g);
          setDetailId(null);
          setFormOpen(true);
        }}
        onDelete={removeGame}
        onToggleFavorite={toggleFavorite}
        onUpdate={updateGame}
      />
    </div>
  );
};

const EmptyState = ({
  title,
  body,
  cta,
}: {
  title: string;
  body: string;
  cta?: React.ReactNode;
}) => (
  <div className="flex flex-col items-center justify-center py-32 text-center">
    <div className="h-20 w-20 rounded-3xl bg-secondary grid place-items-center mb-6">
      <Gamepad2 className="h-9 w-9 text-muted-foreground" />
    </div>
    <h2 className="text-2xl font-semibold mb-2">{title}</h2>
    <p className="text-muted-foreground max-w-sm mb-6">{body}</p>
    {cta}
  </div>
);

export default Index;
