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
  FolderOpen,
  CheckCircle2,
  Trash2,
  Loader2,
} from "lucide-react";
import { toast } from "sonner";

import ksp1Cover from "@/assets/ksp1-cover.jpg.asset.json";
import ksp2Cover from "@/assets/ksp2-cover.jpg.asset.json";

// ---------- Supported games registry ----------
type Provider = "spacedock" | "thunderstore" | "modio";

type SupportedGame = {
  id: string;
  title: string;
  blurb: string;
  provider: Provider;
  providerLabel: string;
  // Provider-specific game key:
  // - spacedock: "ksp1" | "ksp2"
  // - thunderstore: community slug (e.g. "lethal-company")
  // - modio: numeric game id as string
  apiGameKey: string;
  cover: string;
  status: "live" | "coming-soon";
  // Install behavior (Electron):
  pickerMode: "ksp" | "root";
  folderLabel: string;          // e.g. "GameData folder" or "Game install folder"
  stripHint?: "GameData" | "";  // zip strip mode
  // Subfolder under chosen folder where the mod zip should be extracted.
  // Supports {name} and {author} placeholders (Thunderstore uses author-mod).
  installSubdir?: string;
};

const SUPPORTED_GAMES: SupportedGame[] = [
  // ---- SpaceDock ----
  {
    id: "ksp1",
    title: "Kerbal Space Program",
    blurb: "Squad's original spaceflight simulator. Thousands of mods on SpaceDock.",
    provider: "spacedock",
    providerLabel: "SpaceDock",
    apiGameKey: "ksp1",
    cover: ksp1Cover.url,
    status: "live",
    pickerMode: "ksp",
    folderLabel: "GameData folder",
    stripHint: "GameData",
  },
  {
    id: "ksp2",
    title: "Kerbal Space Program 2",
    blurb: "The KSP sequel. Smaller catalog — early days.",
    provider: "spacedock",
    providerLabel: "SpaceDock",
    apiGameKey: "ksp2",
    cover: ksp2Cover.url,
    status: "live",
    pickerMode: "ksp",
    folderLabel: "GameData folder",
    stripHint: "GameData",
  },
  // ---- Thunderstore (BepInEx-style) ----
  // Install into <gameRoot>/BepInEx/plugins/<owner-name>/
  {
    id: "lethal-company",
    title: "Lethal Company",
    blurb: "Co-op horror by Zeekerss. Massive Thunderstore modding scene.",
    provider: "thunderstore",
    providerLabel: "Thunderstore",
    apiGameKey: "lethal-company",
    cover: "https://gamebanana.com/img/ss/games/65543c10c8b6e.jpg",
    status: "live",
    pickerMode: "root",
    folderLabel: "Game install folder",
    stripHint: "",
    installSubdir: "BepInEx/plugins/{author}-{name}",
  },
  {
    id: "valheim",
    title: "Valheim",
    blurb: "Viking survival. BepInEx plugins via Thunderstore.",
    provider: "thunderstore",
    providerLabel: "Thunderstore",
    apiGameKey: "valheim",
    cover: "https://cdn.akamai.steamstatic.com/steam/apps/892970/header.jpg",
    status: "live",
    pickerMode: "root",
    folderLabel: "Game install folder",
    stripHint: "",
    installSubdir: "BepInEx/plugins/{author}-{name}",
  },
  {
    id: "risk-of-rain-2",
    title: "Risk of Rain 2",
    blurb: "Roguelike shooter. Huge BepInEx mod ecosystem.",
    provider: "thunderstore",
    providerLabel: "Thunderstore",
    apiGameKey: "risk-of-rain-2",
    cover: "https://cdn.akamai.steamstatic.com/steam/apps/632360/header.jpg",
    status: "live",
    pickerMode: "root",
    folderLabel: "Game install folder",
    stripHint: "",
    installSubdir: "BepInEx/plugins/{author}-{name}",
  },
  {
    id: "content-warning",
    title: "Content Warning",
    blurb: "Make spooky videos with friends. Active Thunderstore catalog.",
    provider: "thunderstore",
    providerLabel: "Thunderstore",
    apiGameKey: "content-warning",
    cover: "https://cdn.akamai.steamstatic.com/steam/apps/2881650/header.jpg",
    status: "live",
    pickerMode: "root",
    folderLabel: "Game install folder",
    stripHint: "",
    installSubdir: "BepInEx/plugins/{author}-{name}",
  },
  {
    id: "bonelab",
    title: "BONELAB",
    blurb: "Stress Level Zero's VR sandbox. Mods via MelonLoader / Thunderstore.",
    provider: "thunderstore",
    providerLabel: "Thunderstore",
    apiGameKey: "bonelab",
    cover: "https://cdn.akamai.steamstatic.com/steam/apps/1592190/header.jpg",
    status: "live",
    pickerMode: "root",
    folderLabel: "Game install folder",
    stripHint: "",
    installSubdir: "Mods/{author}-{name}",
  },
  // ---- Mod.io (requires MODIO_API_KEY) ----
  {
    id: "mordhau",
    title: "MORDHAU",
    blurb: "Medieval melee combat. Mods served via Mod.io.",
    provider: "modio",
    providerLabel: "Mod.io",
    apiGameKey: "mordhau",
    cover: "https://cdn.akamai.steamstatic.com/steam/apps/629760/header.jpg",
    status: "live",
    pickerMode: "root",
    folderLabel: "Game install folder",
    stripHint: "",
    installSubdir: "Mordhau/Content/Mods/{name}",
  },
  {
    id: "skater-xl",
    title: "Skater XL",
    blurb: "Skateboarding sim. Community gear & maps via Mod.io.",
    provider: "modio",
    providerLabel: "Mod.io",
    apiGameKey: "159",
    cover: "https://cdn.akamai.steamstatic.com/steam/apps/962730/header.jpg",
    status: "live",
    pickerMode: "root",
    folderLabel: "Game install folder",
    stripHint: "",
    installSubdir: "Mods/{name}",
  },
];

// ---------- Normalized API types ----------
type ModSummary = {
  id: string | number;
  name: string;
  short_description: string;
  author: string;
  downloads: number;
  followers: number;
  background: string | null;
  license: string;
  website: string | null;
  source_code: string | null;
  url: string; // absolute URL
  versions: ModVersion[];
};

type ModVersion = {
  friendly_version: string;
  game_version: string;
  id: number;
  created: string;
  download_path: string; // absolute URL
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
const ENDPOINT = `https://${PROJECT_ID}.supabase.co/functions/v1/mods-api`;

async function callFn(params: Record<string, string>) {
  const qs = new URLSearchParams(params).toString();
  const { data: { session } } = await supabase.auth.getSession();
  const headers: Record<string, string> = {
    apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string,
  };
  if (session?.access_token) headers.Authorization = `Bearer ${session.access_token}`;
  const res = await fetch(`${ENDPOINT}?${qs}`, { headers });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`Request failed: ${res.status} ${txt}`);
  }
  return res.json();
}

function expandSubdir(template: string | undefined, mod: { name: string; author: string }) {
  if (!template) return undefined;
  const sanitize = (s: string) => s.replace(/[^a-zA-Z0-9._-]+/g, "_");
  return template
    .replace(/\{name\}/g, sanitize(mod.name))
    .replace(/\{author\}/g, sanitize(mod.author || "Unknown"));
}

// ---------- Sidebar boilerplate ----------
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
const GamePicker = ({ onPick }: { onPick: (g: SupportedGame) => void }) => {
  const grouped = useMemo(() => {
    const by: Record<Provider, SupportedGame[]> = {
      spacedock: [],
      thunderstore: [],
      modio: [],
    };
    SUPPORTED_GAMES.forEach((g) => by[g.provider].push(g));
    return by;
  }, []);

  const sections: { provider: Provider; label: string; items: SupportedGame[] }[] = [
    { provider: "spacedock", label: "SpaceDock (KSP)", items: grouped.spacedock },
    { provider: "thunderstore", label: "Thunderstore (BepInEx games)", items: grouped.thunderstore },
    { provider: "modio", label: "Mod.io", items: grouped.modio },
  ];

  return (
    <div className="mx-auto max-w-6xl px-6 py-10">
      <header className="mb-8 flex flex-col gap-2">
        <div className="flex items-center gap-3">
          <Package className="h-7 w-7 text-primary" />
          <h1 className="text-3xl font-bold tracking-tight">Mod Manager</h1>
          <Badge variant="secondary">Beta</Badge>
        </div>
        <p className="max-w-2xl text-sm text-muted-foreground">
          Browse, search and install mods for your favourite games. One-click installs work in the
          RUBIX desktop app; the browser opens the mod page on the source site.
        </p>
      </header>

      {sections.map((section) => (
        <section key={section.provider} className="mb-10">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
            {section.label}
          </h2>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
            {section.items.map((g) => (
              <Card
                key={g.id}
                className="group cursor-pointer overflow-hidden transition-colors hover:border-primary/60"
                onClick={() => onPick(g)}
              >
                <div
                  className="relative h-36 w-full bg-cover bg-center"
                  style={{ backgroundImage: `url(${g.cover})` }}
                >
                  <div className="absolute inset-0 bg-gradient-to-t from-card via-card/30 to-transparent" />
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
          </div>
        </section>
      ))}

      <Card className="flex flex-col items-center justify-center gap-2 border-dashed p-6 text-center text-muted-foreground">
        <Sparkles className="h-6 w-6" />
        <p className="text-sm font-medium">More games coming soon</p>
        <p className="text-xs">Nexus Mods and CurseForge integrations are next.</p>
      </Card>
    </div>
  );
};

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
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<ModDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [gameVersion, setGameVersion] = useState<string>("any");

  const isElectron = typeof window !== "undefined" && window.rubix?.isElectron === true;
  const [installDir, setInstallDir] = useState<string | null>(null);
  const [installed, setInstalled] = useState<Record<string, { version: string; versionId: number }>>({});
  const [installingId, setInstallingId] = useState<number | null>(null);

  const storageKey = `${game.provider}-${game.apiGameKey}`;

  const refreshInstalled = async () => {
    if (!isElectron || !window.rubix?.mods) return;
    const res = await window.rubix.mods.listInstalled(storageKey);
    if (res.ok) {
      const next: Record<string, { version: string; versionId: number }> = {};
      for (const [k, v] of Object.entries(res.installed)) {
        next[k] = { version: v.version, versionId: v.versionId };
      }
      setInstalled(next);
    }
  };

  useEffect(() => {
    setPage(1);
    setCommittedQuery("");
    setQuery("");
    setGameVersion("any");
    if (isElectron && window.rubix?.mods) {
      window.rubix.mods.getFolder(storageKey).then((r) => setInstallDir(r.gameDataDir));
      refreshInstalled();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [game.id]);

  const pickFolder = async () => {
    if (!window.rubix?.mods) return;
    const r = await window.rubix.mods.pickFolder(
      storageKey,
      `Select ${game.title} ${game.folderLabel}`,
      game.pickerMode,
    );
    if (r.ok && r.gameDataDir) {
      setInstallDir(r.gameDataDir);
      toast.success(`${game.folderLabel} set`, { description: r.gameDataDir });
    }
  };

  const installVersion = async (mod: ModDetail | ModSummary, v: ModVersion) => {
    if (!window.rubix?.mods) return;
    if (!installDir) {
      toast.error(`Pick your ${game.folderLabel} first`);
      return;
    }
    setInstallingId(v.id);
    const r = await window.rubix.mods.install({
      gameKey: storageKey,
      modId: String(mod.id),
      modName: mod.name,
      version: v.friendly_version,
      versionId: v.id,
      downloadUrl: v.download_path,
      stripHint: game.stripHint,
      installSubdir: expandSubdir(game.installSubdir, { name: mod.name, author: mod.author }),
    });
    setInstallingId(null);
    if (r.ok) {
      toast.success(`Installed ${mod.name}`, { description: `${r.files} files written` });
      refreshInstalled();
    } else {
      toast.error("Install failed", { description: r.error });
    }
  };

  const uninstallMod = async (mod: ModDetail | ModSummary) => {
    if (!window.rubix?.mods) return;
    const r = await window.rubix.mods.uninstall(storageKey, String(mod.id));
    if (r.ok) {
      toast.success(`Uninstalled ${mod.name}`, { description: `${r.removed} files removed` });
      refreshInstalled();
    } else {
      toast.error("Uninstall failed", { description: r.error });
    }
  };

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    const params: Record<string, string> = {
      provider: game.provider,
      action: "browse",
      game: game.apiGameKey,
      page: String(page),
      count: "30",
    };
    if (committedQuery) params.query = committedQuery;
    callFn(params)
      .then((j) => {
        if (cancelled) return;
        if (j?.error) {
          setError(String(j.error));
          setData({ total: 0, count: 0, pages: 1, page: 1, result: [] });
        } else if (Array.isArray(j)) {
          setData({ total: j.length, count: j.length, pages: 1, page: 1, result: j });
        } else {
          setData(j as BrowseResponse);
        }
      })
      .catch((e) => {
        if (cancelled) return;
        setError(String(e?.message ?? e));
        setData({ total: 0, count: 0, pages: 1, page: 1, result: [] });
      })
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [game.provider, game.apiGameKey, page, committedQuery]);

  useEffect(() => {
    if (selectedId === null) {
      setDetail(null);
      return;
    }
    setDetailLoading(true);
    callFn({
      provider: game.provider,
      action: "mod",
      game: game.apiGameKey,
      id: String(selectedId),
    })
      .then((j) => setDetail(j as ModDetail))
      .catch(() => setDetail(null))
      .finally(() => setDetailLoading(false));
  }, [selectedId, game.provider, game.apiGameKey]);

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

        {isElectron ? (
          <div className="flex flex-wrap items-center gap-2 rounded-md border bg-card/50 p-3">
            <FolderOpen className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm">
              {installDir ? (
                <>
                  {game.folderLabel}:{" "}
                  <code className="rounded bg-muted px-1.5 py-0.5 text-xs">{installDir}</code>
                </>
              ) : (
                <span className="text-muted-foreground">No {game.folderLabel} set.</span>
              )}
            </span>
            <div className="ml-auto flex gap-2">
              <Button size="sm" variant="outline" onClick={pickFolder}>
                {installDir ? "Change folder" : "Choose folder"}
              </Button>
              {installDir && (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => window.rubix?.mods?.openFolder(storageKey)}
                >
                  Open
                </Button>
              )}
            </div>
          </div>
        ) : (
          <div className="rounded-md border border-dashed bg-muted/30 p-3 text-xs text-muted-foreground">
            One-click install is available in the RUBIX desktop app. In the browser, downloads open
            on {game.providerLabel} and you'll need to extract the archive into your{" "}
            <code>{game.folderLabel}</code> yourself.
          </div>
        )}
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

        {gameVersions.length > 0 && (
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
        )}
      </div>

      {error && (
        <Card className="mb-4 border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive">
          <p className="font-medium">Couldn't load mods</p>
          <p className="text-xs opacity-80">{error}</p>
          {game.provider === "modio" && /MODIO_API_KEY/.test(error) && (
            <p className="mt-2 text-xs text-muted-foreground">
              Mod.io needs a free API key. Ask RUBIX to add the <code>MODIO_API_KEY</code> secret.
            </p>
          )}
        </Card>
      )}

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
                key={String(mod.id)}
                className="group cursor-pointer overflow-hidden transition-colors hover:border-primary/60"
                onClick={() => setSelectedId(String(mod.id))}
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
                    <div className="flex shrink-0 flex-col items-end gap-1">
                      {latest?.game_version && (
                        <Badge variant="outline" className="text-xs">
                          v{latest.game_version}
                        </Badge>
                      )}
                      {installed[String(mod.id)] && (
                        <Badge variant="secondary" className="gap-1 text-[10px]">
                          <CheckCircle2 className="h-3 w-3" /> Installed
                        </Badge>
                      )}
                    </div>
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

      {data && data.pages > 1 && (
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
                  {detail.license && (
                    <span className="flex items-center gap-1">
                      <Tag className="h-3 w-3" /> {detail.license}
                    </span>
                  )}
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
                  <a href={detail.url} target="_blank" rel="noreferrer">
                    <ExternalLink className="mr-1 h-3 w-3" /> {game.providerLabel} page
                  </a>
                </Button>
              </div>

              <div>
                <h4 className="mb-2 text-sm font-semibold">Versions</h4>
                <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
                  {detail.versions?.map((v) => {
                    const installedEntry = installed[String(detail.id)];
                    const isThis = installedEntry?.versionId === v.id;
                    const isBusy = installingId === v.id;
                    return (
                      <div
                        key={v.id}
                        className="flex items-center justify-between rounded-md border bg-card/50 px-3 py-2 text-sm"
                      >
                        <div className="flex flex-col">
                          <span className="font-medium flex items-center gap-2">
                            {v.friendly_version}
                            {isThis && (
                              <Badge variant="secondary" className="h-5 gap-1 text-[10px]">
                                <CheckCircle2 className="h-3 w-3" /> Installed
                              </Badge>
                            )}
                          </span>
                          <span className="text-xs text-muted-foreground">
                            {v.game_version ? `Game v${v.game_version} · ` : ""}
                            {v.created ? new Date(v.created).toLocaleDateString() : ""}
                          </span>
                        </div>
                        <div className="flex gap-2">
                          {isElectron ? (
                            <>
                              {isThis ? (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => uninstallMod(detail)}
                                >
                                  <Trash2 className="mr-1 h-3 w-3" /> Uninstall
                                </Button>
                              ) : (
                                <Button
                                  size="sm"
                                  variant="secondary"
                                  disabled={isBusy || !installDir}
                                  onClick={() => installVersion(detail, v)}
                                >
                                  {isBusy ? (
                                    <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                                  ) : (
                                    <Download className="mr-1 h-3 w-3" />
                                  )}
                                  {installedEntry ? "Update" : "Install"}
                                </Button>
                              )}
                            </>
                          ) : (
                            <Button asChild size="sm" variant="secondary">
                              <a href={v.download_path} target="_blank" rel="noreferrer">
                                <Download className="mr-1 h-3 w-3" /> Download
                              </a>
                            </Button>
                          )}
                        </div>
                      </div>
                    );
                  })}
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
