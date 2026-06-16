import { useEffect, useMemo, useState } from "react";
import { Sidebar } from "@/components/Sidebar";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import {
  Search,
  Download,
  ExternalLink,
  Rocket,
  Tag,
  User,
  Code2,
  ArrowLeft,
  Package,
  Sparkles,
} from "lucide-react";

// ---------- Supported games registry ----------
// Add more entries here as new mod providers are wired up.
type SupportedGame = {
  id: string;            // route-style id e.g. "ksp1"
  title: string;
  blurb: string;
  provider: "spacedock"; // future: "nexus" | "thunderstore" | "github"
  providerLabel: string;
  apiGameKey: "ksp1" | "ksp2"; // value passed to the edge function
  accent: string;        // tailwind gradient classes
  status: "live" | "coming-soon";
};

const SUPPORTED_GAMES: SupportedGame[] = [
  {
    id: "ksp1",
    title: "Kerbal Space Program",
    blurb: "Squad's original spaceflight simulator. Thousands of mods on SpaceDock.",
    provider: "spacedock",
    providerLabel: "SpaceDock",
    apiGameKey: "ksp1",
    accent: "from-indigo-600/40 to-fuchsia-600/30",
    status: "live",
  },
  {
    id: "ksp2",
    title: "Kerbal Space Program 2",
    blurb: "The KSP sequel. Smaller catalog — early days.",
    provider: "spacedock",
    providerLabel: "SpaceDock",
    apiGameKey: "ksp2",
    accent: "from-sky-600/40 to-emerald-500/30",
    status: "live",
  },
];

// ---------- API types ----------
type ModSummary = {
  id: number;
  name: string;
  short_description: string;
  author: string;
  downloads: number;
  followers: number;
  background: string | null;
  license: string;
  website: string | null;
  source_code: string | null;
  url: string;
  versions: ModVersion[];
};

type ModVersion = {
  friendly_version: string;
  game_version: string;
  id: number;
  created: string;
  download_path: string;
  changelog?: string;
  downloads?: number;
};

type ModDetail = ModSummary & { description: string };

type BrowseResponse = {
  total: number;
  count: number;
  pages: number;
  page: number;
  result: ModSummary[];
};

const PROJECT_ID = import.meta.env.VITE_SUPABASE_PROJECT_ID as string;
const ENDPOINT = `https://${PROJECT_ID}.supabase.co/functions/v1/ksp-mods`;

async function callFn(params: Record<string, string>) {
  const qs = new URLSearchParams(params).toString();
  const { data: { session } } = await supabase.auth.getSession();
  const headers: Record<string, string> = {
    apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string,
  };
  if (session?.access_token) headers.Authorization = `Bearer ${session.access_token}`;
  const res = await fetch(`${ENDPOINT}?${qs}`, { headers });
  if (!res.ok) throw new Error(`Request failed: ${res.status}`);
  return res.json();
}

// ---------- Sidebar boilerplate shared by both views ----------
const sidebarProps = {
  collection: "all" as const,
  onCollection: () => {},
  genres: [],
  selectedGenre: null,
  onGenre: () => {},
  counts: { all: 0, favorites: 0, recent: 0 },
  selectedSource: null,
  onSource: () => {},
  sourceCounts: { steam: 0, epic: 0, ea: 0, xbox: 0, riot: 0, other: 0 },
};

// ---------- Game picker ----------
const GamePicker = ({ onPick }: { onPick: (g: SupportedGame) => void }) => (
  <div className="mx-auto max-w-6xl px-6 py-10">
    <header className="mb-8 flex flex-col gap-2">
      <div className="flex items-center gap-3">
        <Package className="h-7 w-7 text-primary" />
        <h1 className="text-3xl font-bold tracking-tight">Mod Manager</h1>
        <Badge variant="secondary">Beta</Badge>
      </div>
      <p className="max-w-2xl text-sm text-muted-foreground">
        Browse, search and download mods for your favourite games. Pick a game to get started —
        more games are being added.
      </p>
    </header>

    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
      {SUPPORTED_GAMES.map((g) => (
        <Card
          key={g.id}
          className="group cursor-pointer overflow-hidden transition-colors hover:border-primary/60"
          onClick={() => onPick(g)}
        >
          <div className={`relative h-32 w-full bg-gradient-to-br ${g.accent}`}>
            <Rocket className="absolute right-4 top-4 h-10 w-10 text-white/70" />
          </div>
          <div className="p-4">
            <div className="mb-1 flex items-center justify-between gap-2">
              <h3 className="font-semibold leading-tight">{g.title}</h3>
              <Badge variant="outline" className="text-[10px]">
                {g.providerLabel}
              </Badge>
            </div>
            <p className="line-clamp-2 text-xs text-muted-foreground">{g.blurb}</p>
          </div>
        </Card>
      ))}

      <Card className="flex flex-col items-center justify-center gap-2 border-dashed p-6 text-center text-muted-foreground">
        <Sparkles className="h-6 w-6" />
        <p className="text-sm font-medium">More games coming soon</p>
        <p className="text-xs">Nexus, Thunderstore and Steam Workshop integrations are next.</p>
      </Card>
    </div>
  </div>
);

// ---------- Mod browser for a single game ----------
const GameModBrowser = ({
  game,
  onBack,
}: {
  game: SupportedGame;
  onBack: () => void;
}) => {
  const [query, setQuery] = useState("");
  const [committedQuery, setCommittedQuery] = useState("");
  const [page, setPage] = useState(1);
  const [data, setData] = useState<BrowseResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [detail, setDetail] = useState<ModDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [gameVersion, setGameVersion] = useState<string>("any");

  useEffect(() => {
    setPage(1);
    setCommittedQuery("");
    setQuery("");
    setGameVersion("any");
  }, [game.id]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    const params: Record<string, string> = {
      action: "browse",
      game: game.apiGameKey,
      page: String(page),
      count: "30",
    };
    if (committedQuery) params.query = committedQuery;
    callFn(params)
      .then((j) => {
        if (cancelled) return;
        if (Array.isArray(j)) {
          setData({ total: j.length, count: j.length, pages: 1, page: 1, result: j });
        } else {
          setData(j as BrowseResponse);
        }
      })
      .catch(() => setData({ total: 0, count: 0, pages: 1, page: 1, result: [] }))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [game.apiGameKey, page, committedQuery]);

  useEffect(() => {
    if (selectedId === null) {
      setDetail(null);
      return;
    }
    setDetailLoading(true);
    callFn({ action: "mod", id: String(selectedId) })
      .then((j) => setDetail(j as ModDetail))
      .catch(() => setDetail(null))
      .finally(() => setDetailLoading(false));
  }, [selectedId]);

  const gameVersions = useMemo(() => {
    const set = new Set<string>();
    data?.result.forEach((m) =>
      m.versions?.forEach((v) => v.game_version && set.add(v.game_version)),
    );
    return Array.from(set).sort((a, b) => b.localeCompare(a, undefined, { numeric: true }));
  }, [data]);

  const filtered = useMemo(() => {
    if (!data) return [] as ModSummary[];
    if (gameVersion === "any") return data.result;
    return data.result.filter((m) =>
      m.versions?.some((v) => v.game_version === gameVersion),
    );
  }, [data, gameVersion]);

  return (
    <div className="mx-auto max-w-7xl px-6 py-8">
      <header className="mb-6 flex flex-col gap-3">
        <Button
          variant="ghost"
          size="sm"
          className="w-fit -ml-2 text-muted-foreground"
          onClick={onBack}
        >
          <ArrowLeft className="mr-1 h-4 w-4" /> All games
        </Button>
        <div className="flex items-center gap-3">
          <Rocket className="h-7 w-7 text-primary" />
          <h1 className="text-3xl font-bold tracking-tight">{game.title}</h1>
          <Badge variant="outline">{game.providerLabel}</Badge>
        </div>
        <p className="max-w-2xl text-sm text-muted-foreground">{game.blurb}</p>
      </header>

      <div className="mb-6 flex flex-wrap gap-3">
        <form
          className="flex flex-1 min-w-[260px] gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            setPage(1);
            setCommittedQuery(query.trim());
          }}
        >
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={`Search ${game.title} mods...`}
              className="pl-9"
            />
          </div>
          <Button type="submit">Search</Button>
        </form>

        <Select value={gameVersion} onValueChange={setGameVersion}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Game version" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="any">Any version</SelectItem>
            {gameVersions.map((v) => (
              <SelectItem key={v} value={v}>
                {v}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 9 }).map((_, i) => (
            <Skeleton key={i} className="h-44 w-full" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <Card className="p-10 text-center text-muted-foreground">
          No mods found. Try a different search or game version.
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((mod) => {
            const latest = mod.versions?.[0];
            return (
              <Card
                key={mod.id}
                className="group cursor-pointer overflow-hidden transition-colors hover:border-primary/60"
                onClick={() => setSelectedId(mod.id)}
              >
                <div
                  className="h-28 w-full bg-muted bg-cover bg-center"
                  style={
                    mod.background
                      ? { backgroundImage: `url(${mod.background})` }
                      : undefined
                  }
                />
                <div className="p-4">
                  <div className="mb-1 flex items-start justify-between gap-2">
                    <h3 className="font-semibold leading-tight">{mod.name}</h3>
                    {latest && (
                      <Badge variant="outline" className="shrink-0 text-xs">
                        v{latest.game_version}
                      </Badge>
                    )}
                  </div>
                  <p className="mb-3 line-clamp-2 text-xs text-muted-foreground">
                    {mod.short_description}
                  </p>
                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <User className="h-3 w-3" /> {mod.author}
                    </span>
                    <span className="flex items-center gap-1">
                      <Download className="h-3 w-3" /> {mod.downloads.toLocaleString()}
                    </span>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {data && data.pages > 1 && !committedQuery && (
        <div className="mt-6 flex items-center justify-center gap-3">
          <Button
            variant="outline"
            disabled={page <= 1}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
          >
            Previous
          </Button>
          <span className="text-sm text-muted-foreground">
            Page {data.page} of {data.pages}
          </span>
          <Button
            variant="outline"
            disabled={page >= data.pages}
            onClick={() => setPage((p) => p + 1)}
          >
            Next
          </Button>
        </div>
      )}

      <Dialog open={selectedId !== null} onOpenChange={(o) => !o && setSelectedId(null)}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          {detailLoading || !detail ? (
            <div className="space-y-3">
              <Skeleton className="h-8 w-2/3" />
              <Skeleton className="h-40 w-full" />
              <Skeleton className="h-24 w-full" />
            </div>
          ) : (
            <>
              <DialogHeader>
                <DialogTitle className="text-2xl">{detail.name}</DialogTitle>
                <DialogDescription className="flex flex-wrap items-center gap-3 text-xs">
                  <span className="flex items-center gap-1">
                    <User className="h-3 w-3" /> {detail.author}
                  </span>
                  <span className="flex items-center gap-1">
                    <Tag className="h-3 w-3" /> {detail.license}
                  </span>
                  <span className="flex items-center gap-1">
                    <Download className="h-3 w-3" /> {detail.downloads.toLocaleString()}
                  </span>
                </DialogDescription>
              </DialogHeader>

              {detail.background && (
                <div
                  className="h-40 w-full rounded-md bg-cover bg-center"
                  style={{ backgroundImage: `url(${detail.background})` }}
                />
              )}

              <p className="text-sm text-muted-foreground whitespace-pre-wrap">
                {detail.short_description}
              </p>

              <div className="flex flex-wrap gap-2">
                {detail.website && (
                  <Button asChild variant="outline" size="sm">
                    <a href={detail.website} target="_blank" rel="noreferrer">
                      <ExternalLink className="mr-1 h-3 w-3" /> Website
                    </a>
                  </Button>
                )}
                {detail.source_code && (
                  <Button asChild variant="outline" size="sm">
                    <a href={detail.source_code} target="_blank" rel="noreferrer">
                      <Code2 className="mr-1 h-3 w-3" /> Source
                    </a>
                  </Button>
                )}
                <Button asChild variant="outline" size="sm">
                  <a href={`https://spacedock.info${detail.url}`} target="_blank" rel="noreferrer">
                    <ExternalLink className="mr-1 h-3 w-3" /> {game.providerLabel} page
                  </a>
                </Button>
              </div>

              <div>
                <h4 className="mb-2 text-sm font-semibold">Versions</h4>
                <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
                  {detail.versions?.map((v) => (
                    <div
                      key={v.id}
                      className="flex items-center justify-between rounded-md border bg-card/50 px-3 py-2 text-sm"
                    >
                      <div className="flex flex-col">
                        <span className="font-medium">{v.friendly_version}</span>
                        <span className="text-xs text-muted-foreground">
                          Game v{v.game_version} · {new Date(v.created).toLocaleDateString()}
                        </span>
                      </div>
                      <Button asChild size="sm" variant="secondary">
                        <a
                          href={`https://spacedock.info${v.download_path}`}
                          target="_blank"
                          rel="noreferrer"
                        >
                          <Download className="mr-1 h-3 w-3" /> Download
                        </a>
                      </Button>
                    </div>
                  ))}
                </div>
              </div>

              <p className="text-[10px] text-muted-foreground">
                Mod data from {game.providerLabel}. RUBIX does not host or modify these files;
                downloads come directly from the mod authors' pages, subject to each mod's own
                license.
              </p>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

// ---------- Top-level page ----------
const ModManager = () => {
  const [game, setGame] = useState<SupportedGame | null>(null);

  useEffect(() => {
    document.title = game
      ? `${game.title} mods — RUBIX Mod Manager`
      : "Mod Manager — RUBIX";
  }, [game]);

  return (
    <div className="flex min-h-screen bg-background">
      <Sidebar {...sidebarProps} />
      <main className="flex-1 overflow-y-auto">
        {game ? (
          <GameModBrowser game={game} onBack={() => setGame(null)} />
        ) : (
          <GamePicker onPick={setGame} />
        )}
      </main>
    </div>
  );
};

export default ModManager;
