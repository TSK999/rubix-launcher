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
  ArrowDownWideNarrow,
} from "lucide-react";
import { toast } from "sonner";
import { ModpackManager } from "@/components/mods/ModpackManager";
import { GameSetupWizard } from "@/components/mods/GameSetupWizard";
import { getAdapterOrFallback, expandSubdir as adapterExpandSubdir } from "@/lib/mod-adapters";

import ksp1Cover from "@/assets/ksp1-cover.jpg.asset.json";
import ksp2Cover from "@/assets/ksp2-cover.jpg.asset.json";

// ---------- Supported games registry ----------
type Provider = "spacedock" | "thunderstore" | "modio" | "curseforge";

type SupportedGame = {
  id: string;
  title: string;
  blurb: string;
  provider: Provider;
  providerLabel: string;
  // Provider-specific game key:
  // - spacedock: "ksp1" | "ksp2"
  // - thunderstore: community slug (e.g. "lethal-company")
  // - modio: provider slug handled by the backend resolver
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
  ...makeThunderstore([
    { slug: "lethal-company", title: "Lethal Company", steamId: "1966720", blurb: "Co-op horror by Zeekerss. Massive Thunderstore modding scene." },
    { slug: "valheim", title: "Valheim", steamId: "892970", blurb: "Viking survival. BepInEx plugins via Thunderstore." },
    { slug: "risk-of-rain-2", title: "Risk of Rain 2", steamId: "632360", blurb: "Roguelike shooter. Huge BepInEx mod ecosystem." },
    { slug: "content-warning", title: "Content Warning", steamId: "2881650", blurb: "Make spooky videos with friends." },
    { slug: "bonelab", title: "BONELAB", steamId: "1592190", blurb: "Stress Level Zero's VR sandbox.", subdir: "Mods/{author}-{name}" },
    { slug: "repo", title: "R.E.P.O.", steamId: "3241660", blurb: "Co-op physics horror — booming Thunderstore scene." },
    { slug: "peak", title: "PEAK", steamId: "3527290", blurb: "Co-op climbing chaos." },
    { slug: "palworld", title: "Palworld", steamId: "1623730", blurb: "Creature-collector survival." },
    { slug: "gtfo", title: "GTFO", steamId: "493520", blurb: "Hardcore co-op horror shooter." },
    { slug: "deep-rock-galactic", title: "Deep Rock Galactic", steamId: "548430", blurb: "Rock and stone, miner!" },
    { slug: "subnautica", title: "Subnautica", steamId: "264710", blurb: "Underwater survival." },
    { slug: "subnautica-below-zero", title: "Subnautica: Below Zero", steamId: "848450", blurb: "Frozen alien ocean sequel." },
    { slug: "h3vr", title: "H3VR", steamId: "450540", blurb: "Hot Dogs, Horseshoes & Hand Grenades — VR firearms sandbox." },
    { slug: "blade-and-sorcery", title: "Blade & Sorcery", steamId: "629730", blurb: "VR melee combat sandbox.", subdir: "Mods/{author}-{name}" },
    { slug: "outward", title: "Outward", steamId: "794260", blurb: "Open-world hardcore RPG." },
    { slug: "project-zomboid", title: "Project Zomboid", steamId: "108600", blurb: "Isometric zombie survival." },
    { slug: "sons-of-the-forest", title: "Sons of the Forest", steamId: "1326470", blurb: "Cannibal-haunted survival sequel." },
    { slug: "hard-bullet", title: "Hard Bullet", steamId: "1294760", blurb: "VR action sandbox." },
    { slug: "terratech", title: "TerraTech", steamId: "285920", blurb: "Vehicle building sandbox." },
    { slug: "timberborn", title: "Timberborn", steamId: "1062090", blurb: "Lumberpunk beaver city builder." },
    { slug: "dyson-sphere-program", title: "Dyson Sphere Program", steamId: "1366540", blurb: "Interstellar factory builder." },
    { slug: "v-rising", title: "V Rising", steamId: "1604030", blurb: "Vampire survival sandbox." },
    { slug: "lethal-league-blaze", title: "Lethal League Blaze", steamId: "553310", blurb: "Anti-gravity ball fighter." },
    { slug: "ravenfield", title: "Ravenfield", steamId: "636480", blurb: "Singleplayer Battlefield-style shooter." },
    { slug: "totally-accurate-battle-simulator", title: "TABS", steamId: "508440", blurb: "Wobbly physics battles." },
    { slug: "ultrakill", title: "ULTRAKILL", steamId: "1229490", blurb: "Blood-fueled FPS." },
    { slug: "muck", title: "Muck", steamId: "1625450", blurb: "Free survival roguelike." },
    { slug: "rounds", title: "ROUNDS", steamId: "1557740", blurb: "Local-multiplayer card-deck duelling." },
    { slug: "noita", title: "Noita", steamId: "881100", blurb: "Pixel-perfect physics roguelite." },
    { slug: "wrestling-empire", title: "Wrestling Empire", steamId: "1620340", blurb: "Career wrestling sim." },
    // ---- New additions ----
    { slug: "webfishing", title: "WEBFISHING", steamId: "1608690", blurb: "Fishing with friends — massive Thunderstore modding scene." },
    { slug: "bopl-battle", title: "Bopl Battle", steamId: "802870", blurb: "Multiplayer arrow-shooting platformer." },
    { slug: "brotato", title: "Brotato", steamId: "1629450", blurb: "Top-down arena shooter roguelite." },
    { slug: "schedule-i", title: "Schedule I", steamId: "2001010", blurb: "Run a drug empire solo or co-op." },
    { slug: "for-the-king", title: "For The King", steamId: "527230", blurb: "Turn-based roguelike tabletop RPG." },
    { slug: "skul-the-hero-slayer", title: "Skul: The Hero Slayer", steamId: "1147560", blurb: "Action roguelite platformer." },
    { slug: "dome-keeper", title: "Dome Keeper", steamId: "1637320", blurb: "Defend your dome, dig for resources." },
    { slug: "across-the-obelisk", title: "Across the Obelisk", steamId: "1385380", blurb: "Co-op deck-builder RPG." },
    { slug: "dredge", title: "Dredge", steamId: "1562430", blurb: "Lovecraftian fishing adventure." },
    { slug: "cobalt-core", title: "Cobalt Core", steamId: "1664910", blurb: "Sci-fi deck-building roguelike." },
  ]),
  // ---- Mod.io (requires MODIO_API_KEY) ----
  ...makeModio([
    { slug: "mordhau", title: "MORDHAU", steamId: "629760", blurb: "Medieval melee combat.", subdir: "Mordhau/Content/Mods/{name}" },
    { slug: "skaterxl", title: "Skater XL", steamId: "962730", blurb: "Skateboarding sim with massive community catalog." },
    { slug: "snowrunner", title: "SnowRunner", steamId: "1465360", blurb: "Off-road trucking sim." },
    { slug: "expeditions", title: "Expeditions: A MudRunner Game", steamId: "2477340", blurb: "Off-road exploration sequel." },
    { slug: "riftbreaker", title: "The Riftbreaker", steamId: "780310", blurb: "Base-building action-RPG." },
    { slug: "openxcom", title: "OpenXcom", steamId: "7670", blurb: "Open-source XCOM engine." },
    // ---- New mod.io additions ----
    { slug: "stalker2", title: "S.T.A.L.K.E.R. 2", steamId: "1643320", blurb: "Survival horror shooter." },
    { slug: "spaceengineers", title: "Space Engineers", steamId: "244850", blurb: "Voxel-based space engineering sandbox." },
    { slug: "readyornot", title: "Ready or Not", steamId: "1144200", blurb: "Tactical FPS SWAT simulator." },
    { slug: "anno-1800", title: "Anno 1800", steamId: "916440", blurb: "City-building strategy in the Industrial Age." },
    { slug: "melvoridle", title: "Melvor Idle", steamId: "1267910", blurb: "Feature-rich idle RPG inspired by RuneScape." },
    { slug: "talespire", title: "TaleSpire", steamId: "720620", blurb: "Digital tabletop RPG with 3D terrain." },
    { slug: "dying-light-2", title: "Dying Light 2", steamId: "534380", blurb: "Parkour zombie survival RPG." },
    { slug: "pavlov", title: "Pavlov VR", steamId: "555160", blurb: "Multiplayer VR shooter with custom maps." },
    { slug: "contractors", title: "Contractors VR", steamId: "963930", blurb: "Competitive VR military shooter." },
    { slug: "hf2", title: "House Flipper 2", steamId: "1190970", blurb: "Renovation sim with UGC interiors." },
  ]),
  // ---- CurseForge (requires CURSEFORGE_API_KEY) ----
  ...makeCurseforge([
    { slug: "minecraft", title: "Minecraft", steamId: "", blurb: "The biggest modding scene on the planet — Forge, Fabric, NeoForge.", subdir: "mods/{name}" },
    { slug: "sims-4", title: "The Sims 4", steamId: "1222670", blurb: "Custom content, mods and gameplay tweaks for The Sims 4.", subdir: "Mods/{name}" },
    { slug: "stardew-valley", title: "Stardew Valley", steamId: "413150", blurb: "SMAPI mods, expansions and content packs.", subdir: "Mods/{name}" },
    { slug: "wow", title: "World of Warcraft", steamId: "", blurb: "Addons for WoW Retail and Classic.", subdir: "Interface/AddOns/{name}" },
    { slug: "rimworld", title: "RimWorld", steamId: "294100", blurb: "Mods for the sci-fi colony sim.", subdir: "Mods/{name}" },
    { slug: "terraria", title: "Terraria", steamId: "105600", blurb: "tModLoader mods for Terraria.", subdir: "tModLoader/Mods/{name}" },
  ]),
];

// Helpers to keep the registry tidy.
type TsEntry = { slug: string; title: string; steamId: string; blurb: string; subdir?: string };
function makeThunderstore(items: TsEntry[]): SupportedGame[] {
  return items.map((it) => ({
    id: it.slug,
    title: it.title,
    blurb: it.blurb,
    provider: "thunderstore",
    providerLabel: "Thunderstore",
    apiGameKey: it.slug,
    cover: it.steamId
      ? `https://cdn.akamai.steamstatic.com/steam/apps/${it.steamId}/header.jpg`
      : "",
    status: "live",
    pickerMode: "root",
    folderLabel: "Game install folder",
    stripHint: "",
    installSubdir: it.subdir ?? "BepInEx/plugins/{author}-{name}",
  }));
}

type ModioEntry = { slug: string; title: string; steamId: string; blurb: string; subdir?: string };
function makeModio(items: ModioEntry[]): SupportedGame[] {
  return items.map((it) => ({
    id: it.slug,
    title: it.title,
    blurb: it.blurb,
    provider: "modio",
    providerLabel: "Mod.io",
    apiGameKey: it.slug,
    cover: it.steamId
      ? `https://cdn.akamai.steamstatic.com/steam/apps/${it.steamId}/header.jpg`
      : "",
    status: "live",
    pickerMode: "root",
    folderLabel: "Game install folder",
    stripHint: "",
    installSubdir: it.subdir ?? "Mods/{name}",
  }));
}

type CfEntry = { slug: string; title: string; steamId: string; blurb: string; subdir?: string };
function makeCurseforge(items: CfEntry[]): SupportedGame[] {
  return items.map((it) => ({
    id: it.slug,
    title: it.title,
    blurb: it.blurb,
    provider: "curseforge",
    providerLabel: "CurseForge",
    apiGameKey: it.slug,
    cover: it.steamId
      ? `https://cdn.akamai.steamstatic.com/steam/apps/${it.steamId}/header.jpg`
      : "",
    status: "live",
    pickerMode: "root",
    folderLabel: "Game install folder",
    stripHint: "",
    installSubdir: it.subdir ?? "mods/{name}",
  }));
}

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
const GamePicker = ({
  onPick,
  configuredKeys,
}: {
  onPick: (g: SupportedGame) => void;
  configuredKeys: Set<string>;
}) => {
  const [search, setSearch] = useState("");

  const grouped = useMemo(() => {
    const by: Record<Provider, SupportedGame[]> = {
      spacedock: [],
      thunderstore: [],
      modio: [],
      curseforge: [],
    };
    SUPPORTED_GAMES.forEach((g) => by[g.provider].push(g));
    return by;
  }, []);

  const filterGames = (items: SupportedGame[]) => {
    if (!search.trim()) return items;
    const q = search.toLowerCase().trim();
    return items.filter(
      (g) =>
        g.title.toLowerCase().includes(q) ||
        g.blurb.toLowerCase().includes(q) ||
        g.providerLabel.toLowerCase().includes(q)
    );
  };

  const sections: { provider: Provider; label: string; items: SupportedGame[] }[] = [
    { provider: "spacedock", label: "SpaceDock (KSP)", items: filterGames(grouped.spacedock) },
    { provider: "thunderstore", label: "Thunderstore (BepInEx games)", items: filterGames(grouped.thunderstore) },
    { provider: "modio", label: "Mod.io", items: filterGames(grouped.modio) },
    { provider: "curseforge", label: "CurseForge", items: filterGames(grouped.curseforge) },
  ];

  const totalFiltered = sections.reduce((sum, s) => sum + s.items.length, 0);

  return (
    <div className="mx-auto max-w-6xl px-6 py-10">
      <header className="mb-8 flex flex-col gap-2">
        <div className="flex items-center gap-3">
          <Package className="h-7 w-7 text-primary" />
          <h1 className="text-3xl font-bold tracking-tight">Mod Manager</h1>
          <Badge variant="secondary">Beta</Badge>
        </div>
        <p className="max-w-2xl text-sm text-muted-foreground">
          Browse, search and install mods for your favourite games with one-click installs
        </p>
      </header>

      <div className="mb-8">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search games by title, description, or provider..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
      </div>

      {totalFiltered === 0 && (
        <Card className="flex flex-col items-center justify-center gap-2 border-dashed p-6 text-center text-muted-foreground">
          <Search className="h-6 w-6" />
          <p className="text-sm font-medium">No games found</p>
          <p className="text-xs">Try a different search term.</p>
        </Card>
      )}

      {sections.map(
        (section) =>
          section.items.length > 0 && (
            <section key={section.provider} className="mb-10">
              <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                {section.label}
              </h2>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
                {section.items.map((g) => {
                  const isConfigured = configuredKeys.has(`${g.provider}-${g.apiGameKey}`);
                  return (
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
                        {isConfigured && (
                          <Badge className="absolute right-2 top-2 bg-emerald-500/85 text-emerald-50 hover:bg-emerald-500/85">
                            <CheckCircle2 className="mr-1 h-3 w-3" /> Configured
                          </Badge>
                        )}
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
                  );
                })}
              </div>
            </section>
          )
      )}

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
  const [sort, setSort] = useState<"popular" | "downloads" | "updated" | "name">("popular");

  const isElectron = typeof window !== "undefined" && window.rubix?.isElectron === true;
  const [installDir, setInstallDir] = useState<string | null>(null);
  const [installed, setInstalled] = useState<Record<string, { version: string; versionId: number }>>({});
  const [installingId, setInstallingId] = useState<number | null>(null);
  const [wizardOpen, setWizardOpen] = useState(false);

  const storageKey = `${game.provider}-${game.apiGameKey}`;
  const adapter = useMemo(
    () => getAdapterOrFallback(storageKey, game.provider, game.apiGameKey, game.title),
    [storageKey, game.provider, game.apiGameKey, game.title],
  );

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
      window.rubix.mods.getFolder(storageKey).then((r) => {
        setInstallDir(r.gameDataDir);
        // First-run setup: open the wizard automatically when the game has
        // never been configured.
        if (!r.gameDataDir) setWizardOpen(true);
      });
      refreshInstalled();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [game.id]);

  const installVersion = async (mod: ModDetail | ModSummary, v: ModVersion) => {
    if (!window.rubix?.mods) return;
    if (!installDir) {
      setWizardOpen(true);
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
      stripHint: adapter.stripHint,
      installSubdir: adapterExpandSubdir(adapter.installSubdir, {
        name: mod.name,
        author: mod.author,
      }),
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
      sort,
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
  }, [game.provider, game.apiGameKey, page, committedQuery, sort]);

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
                  <Badge className="mr-2 bg-emerald-500/15 text-emerald-400 hover:bg-emerald-500/15">
                    <CheckCircle2 className="mr-1 h-3 w-3" /> Configured
                  </Badge>
                  <span className="text-muted-foreground">{adapter.loaderLabel}:</span>{" "}
                  <code className="rounded bg-muted px-1.5 py-0.5 text-xs">{installDir}</code>
                </>
              ) : (
                <span className="text-muted-foreground">
                  Not configured — run setup to install mods.
                </span>
              )}
            </span>
            <div className="ml-auto flex gap-2">
              <Button size="sm" variant="outline" onClick={() => setWizardOpen(true)}>
                {installDir ? "Change directory" : "Run setup"}
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
            <code>{adapter.folderLabel}</code> yourself.
          </div>
        )}
      </header>

      <GameSetupWizard
        open={wizardOpen}
        onOpenChange={setWizardOpen}
        storageKey={storageKey}
        provider={game.provider}
        slug={game.apiGameKey}
        title={game.title}
        currentPath={installDir}
        onConfigured={(p) => setInstallDir(p)}
      />



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

        <Select value={sort} onValueChange={(v) => { setPage(1); setSort(v as typeof sort); }}>
          <SelectTrigger className="w-[180px]">
            <ArrowDownWideNarrow className="mr-1 h-4 w-4" />
            <SelectValue placeholder="Sort by" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="popular">Most popular</SelectItem>
            <SelectItem value="downloads">Most downloads</SelectItem>
            <SelectItem value="updated">Recently updated</SelectItem>
            <SelectItem value="name">Name (A–Z)</SelectItem>
          </SelectContent>
        </Select>

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

      <div className="mb-6">
        <ModpackManager
          gameSlug={game.apiGameKey}
          gameTitle={game.title}
          installedMods={Object.entries(installed).map(([modId, v]) => ({
            mod_source: game.provider,
            mod_id: modId,
            mod_name: modId,
            version: v.version,
            enabled: true,
          }))}
        />
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
          {game.provider === "curseforge" && /CURSEFORGE_API_KEY/.test(error) && (
            <p className="mt-2 text-xs text-muted-foreground">
              CurseForge needs an API key. Ask RUBIX to add the <code>CURSEFORGE_API_KEY</code> secret.
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
  const [configuredKeys, setConfiguredKeys] = useState<Set<string>>(new Set());

  const refreshConfigured = async () => {
    if (typeof window === "undefined" || !window.rubix?.mods?.listConfigured) {
      setConfiguredKeys(new Set());
      return;
    }
    const r = await window.rubix.mods.listConfigured();
    if (r.ok) setConfiguredKeys(new Set(Object.keys(r.configured)));
  };

  useEffect(() => {
    document.title = game
      ? `${game.title} mods — RUBIX Mod Manager`
      : "Mod Manager — RUBIX";
  }, [game]);

  // Refresh whenever we return to the picker so badges update after the wizard.
  useEffect(() => {
    if (!game) refreshConfigured();
  }, [game]);

  return (
    <div className="flex min-h-screen bg-background">
      <Sidebar {...sidebarProps} />
      <main className="flex-1 overflow-y-auto">
        {game ? (
          <GameModBrowser game={game} onBack={() => setGame(null)} />
        ) : (
          <GamePicker onPick={setGame} configuredKeys={configuredKeys} />
        )}
      </main>
    </div>
  );
};

export default ModManager;

export default ModManager;
