// Generic mod browser proxy. Supports SpaceDock (KSP), Thunderstore, and Mod.io.
// Normalizes responses into a single shape consumed by the RUBIX Mod Manager UI.
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

type Version = {
  friendly_version: string;
  game_version: string;
  id: number;
  created: string;
  download_path: string; // absolute URL (for thunderstore/modio) or spacedock-relative
  changelog?: string;
  downloads?: number;
};

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
  url: string; // absolute URL to provider page
  versions: Version[];
};

type ModDetail = ModSummary & { description: string };

type BrowseResponse = {
  total: number;
  count: number;
  pages: number;
  page: number;
  result: ModSummary[];
};

// ---------- SpaceDock ----------
const SPACEDOCK = "https://spacedock.info";
const SPACEDOCK_GAMES: Record<string, number> = { ksp1: 3102, ksp2: 22407 };

type SortKey = "popular" | "downloads" | "updated" | "name";

async function spacedockBrowse(game: string, q: string | null, page: number, count: number, sort: SortKey = "popular"): Promise<BrowseResponse> {
  const gameId = SPACEDOCK_GAMES[game] ?? SPACEDOCK_GAMES.ksp1;
  const orderby =
    sort === "downloads" ? "downloads" :
    sort === "updated" ? "updated" :
    sort === "name" ? "name" : "followers";
  const order = sort === "name" ? "asc" : "desc";
  const url = q
    ? `${SPACEDOCK}/api/search/mod?query=${encodeURIComponent(q)}&page=${page}`
    : `${SPACEDOCK}/api/browse?game_id=${gameId}&count=${count}&page=${page}&orderby=${orderby}&order=${order}`;
  const r = await fetch(url, { headers: { Accept: "application/json" } });
  const j = await r.json();
  const list = Array.isArray(j) ? j : j.result ?? [];
  const normalized: ModSummary[] = list.map((m: any) => ({
    id: m.id,
    name: m.name,
    short_description: m.short_description ?? "",
    author: m.author ?? "",
    downloads: m.downloads ?? 0,
    followers: m.followers ?? 0,
    background: m.background ?? null,
    license: m.license ?? "",
    website: m.website ?? null,
    source_code: m.source_code ?? null,
    url: m.url ? `${SPACEDOCK}${m.url}` : `${SPACEDOCK}/mod/${m.id}`,
    versions: (m.versions ?? []).map((v: any) => ({
      friendly_version: v.friendly_version,
      game_version: v.game_version,
      id: v.id,
      created: v.created,
      download_path: `${SPACEDOCK}${v.download_path}`,
      changelog: v.changelog,
      downloads: v.downloads,
    })),
  }));
  return {
    total: j.total ?? normalized.length,
    count: j.count ?? normalized.length,
    pages: j.pages ?? 1,
    page: j.page ?? page,
    result: normalized,
  };
}

async function spacedockMod(id: string): Promise<ModDetail> {
  const r = await fetch(`${SPACEDOCK}/api/mod/${encodeURIComponent(id)}`, {
    headers: { Accept: "application/json" },
  });
  const m: any = await r.json();
  return {
    id: m.id,
    name: m.name,
    short_description: m.short_description ?? "",
    description: m.description ?? "",
    author: m.author ?? "",
    downloads: m.downloads ?? 0,
    followers: m.followers ?? 0,
    background: m.background ?? null,
    license: m.license ?? "",
    website: m.website ?? null,
    source_code: m.source_code ?? null,
    url: m.url ? `${SPACEDOCK}${m.url}` : `${SPACEDOCK}/mod/${m.id}`,
    versions: (m.versions ?? []).map((v: any) => ({
      friendly_version: v.friendly_version,
      game_version: v.game_version,
      id: v.id,
      created: v.created,
      download_path: `${SPACEDOCK}${v.download_path}`,
      changelog: v.changelog,
      downloads: v.downloads,
    })),
  };
}

// ---------- Thunderstore ----------
// Use the paginated cyberstorm listing endpoint for browse (small payloads),
// and the experimental /api/experimental/package/<ns>/<name>/ endpoint for
// per-mod detail (which includes the download URL).
//
// Mod IDs are encoded as "<namespace>/<name>" so the detail call can look up
// the right package without an extra index.

const TS_UA = "RUBIX-ModManager/1.0 (+https://rubixlauncher.lovable.app)";

function tsListingToSummary(r: any, community: string): ModSummary {
  return {
    id: `${r.namespace}/${r.name}`,
    name: r.name ?? "",
    short_description: r.description ?? "",
    author: r.namespace ?? "",
    downloads: r.download_count ?? 0,
    followers: r.rating_count ?? 0,
    background: r.icon_url ?? null,
    license: "",
    website: null,
    source_code: null,
    url: `https://thunderstore.io/c/${community}/p/${r.namespace}/${r.name}/`,
    versions: [], // populated in detail view
  };
}

async function thunderstoreBrowse(community: string, q: string | null, page: number, count: number, sort: SortKey = "popular"): Promise<BrowseResponse> {
  // Cyberstorm caps page_size at 20 — fan out pages to honour the requested count
  const PAGE_SIZE = 20;
  const need = Math.min(count, 60);
  const startIdx = (page - 1) * need;
  const firstPage = Math.floor(startIdx / PAGE_SIZE) + 1;
  const offsetInFirst = startIdx % PAGE_SIZE;
  const ordering =
    sort === "downloads" ? "most-downloaded" :
    sort === "updated" ? "newest" :
    sort === "name" ? "name" : "top-rated";
  const params = new URLSearchParams({
    ordering,
    deprecated: "False",
    nsfw: "False",
    page_size: String(PAGE_SIZE),
  });
  if (q && q.trim()) params.set("search", q.trim());

  const all: any[] = [];
  let total = 0;
  let pageIdx = firstPage;
  while (all.length - offsetInFirst < need) {
    params.set("page", String(pageIdx));
    const r = await fetch(
      `https://thunderstore.io/api/cyberstorm/listing/${encodeURIComponent(community)}/?${params}`,
      { headers: { Accept: "application/json", "User-Agent": TS_UA } },
    );
    if (!r.ok) throw new Error(`Thunderstore HTTP ${r.status}`);
    const j: any = await r.json();
    total = j.count ?? total;
    const batch: any[] = j.results ?? [];
    all.push(...batch);
    if (batch.length < PAGE_SIZE || !j.next) break;
    pageIdx++;
    if (pageIdx - firstPage > 4) break; // safety: at most 5 upstream pages per request
  }

  const slice = all.slice(offsetInFirst, offsetInFirst + need);
  const pages = Math.max(1, Math.ceil(total / need));
  return {
    total,
    count: slice.length,
    pages,
    page,
    result: slice.map((r) => tsListingToSummary(r, community)),
  };
}

function tsHashId(s: string): number {
  let h = 0xcbf29ce4n;
  for (let i = 0; i < s.length; i++) {
    h = (h * 1099511628211n) ^ BigInt(s.charCodeAt(i));
    h &= (1n << 53n) - 1n;
  }
  return Number(h);
}

async function thunderstoreMod(community: string, id: string): Promise<ModDetail | null> {
  // id is "namespace/name"
  const [ns, name] = String(id).split("/");
  if (!ns || !name) return null;
  const r = await fetch(
    `https://thunderstore.io/api/experimental/package/${encodeURIComponent(ns)}/${encodeURIComponent(name)}/`,
    { headers: { Accept: "application/json", "User-Agent": TS_UA } },
  );
  if (!r.ok) return null;
  const p: any = await r.json();
  const latest = p.latest;
  const versions: Version[] = latest
    ? [
        {
          friendly_version: latest.version_number,
          game_version: "",
          id: tsHashId(latest.full_name ?? `${ns}-${name}-${latest.version_number}`),
          created: latest.date_created,
          download_path: latest.download_url,
          changelog: "",
          downloads: latest.downloads ?? 0,
        },
      ]
    : [];
  return {
    id: `${ns}/${name}`,
    name: p.name ?? name,
    short_description: latest?.description ?? "",
    description: latest?.description ?? "",
    author: p.owner ?? ns,
    downloads: latest?.downloads ?? 0,
    followers: p.rating_score ?? 0,
    background: latest?.icon ?? null,
    license: "",
    website: latest?.website_url || null,
    source_code: null,
    url: p.package_url ?? `https://thunderstore.io/c/${community}/p/${ns}/${name}/`,
    versions,
  };
}



// ---------- Mod.io ----------
const MODIO_KEY = Deno.env.get("MODIO_API_KEY") ?? "";

function modioToSummary(m: any): ModSummary {
  const mf = m.modfile ?? {};
  const ver = mf.version || "1.0.0";
  return {
    id: m.id,
    name: m.name,
    short_description: m.summary ?? "",
    author: m.submitted_by?.username ?? "",
    downloads: m.stats?.downloads_total ?? 0,
    followers: m.stats?.subscribers_total ?? 0,
    background: m.logo?.thumb_640x360 || m.logo?.thumb_320x180 || null,
    license: "",
    website: m.homepage_url || null,
    source_code: null,
    url: m.profile_url,
    versions: mf?.download?.binary_url
      ? [
          {
            friendly_version: ver,
            game_version: "",
            id: mf.id,
            created: new Date((mf.date_added ?? 0) * 1000).toISOString(),
            download_path: mf.download.binary_url,
            changelog: mf.changelog ?? "",
            downloads: m.stats?.downloads_total ?? 0,
          },
        ]
      : [],
  };
}

const modioGameIdCache = new Map<string, string>();
const MODIO_GAME_IDS: Record<string, string> = {
  mordhau: "169",
  skaterxl: "629",
  "skater-xl": "629",
  snowrunner: "306",
  openxcom: "51",
  riftbreaker: "3951",
  expeditions: "5734",
  stalker2: "5761",
  bonelab: "3809",
  "blade-and-sorcery": "3852",
  "crosshair-x": "11309",
  "gorilla-tag": "6657",
  pavlov: "3959",
  "downshot-vr": "5674",
  sledders: "11371",
  tabs: "152",
  "dying-light-2": "3992",
  drg: "2475",
  incredibox: "10779",
  spaceengineers: "264",
  battletalent: "2340",
  "beyond-sandbox": "7025",
  contractors: "251",
  "carx-dro": "5892",
  hf2: "3615",
  talespire: "3963",
  virtualskate: "10065",
  readyornot: "3791",
  dummynation: "5041",
  fireworksmania: "2691",
  "anno-1800": "4169",
  melvoridle: "2869",
  "anno-117-pax-romana": "11358",
};

async function resolveModioGameId(game: string): Promise<string> {
  const key = game.trim().toLowerCase();
  if (/^\d+$/.test(key)) return key;
  const knownId = MODIO_GAME_IDS[key];
  if (knownId) return knownId;
  const cached = modioGameIdCache.get(key);
  if (cached) return cached;
  if (!MODIO_KEY) throw new Error("MODIO_API_KEY is not configured");
  const params = new URLSearchParams({ api_key: MODIO_KEY, _q: key, _limit: "25" });
  const r = await fetch(`https://api.mod.io/v1/games?${params}`, { headers: { Accept: "application/json" } });
  if (!r.ok) throw new Error(`mod.io game lookup HTTP ${r.status}`);
  const j: any = await r.json();
  const match = (j?.data ?? []).find((g: any) => {
    const nameId = String(g.name_id ?? "").toLowerCase();
    const profileSlug = String(g.profile_url ?? "").toLowerCase().split("/g/").pop();
    return nameId === key || profileSlug === key;
  });
  const id = match?.id;
  if (!id) throw new Error(`mod.io game not found: ${game}`);
  const out = String(id);
  modioGameIdCache.set(key, out);
  return out;
}

async function modioBrowse(gameKey: string, q: string | null, page: number, count: number, sort: SortKey = "popular"): Promise<BrowseResponse> {
  if (!MODIO_KEY) throw new Error("MODIO_API_KEY is not configured");
  const gameId = await resolveModioGameId(gameKey);
  const offset = (page - 1) * count;
  const sortValue =
    sort === "downloads" ? "-downloads" :
    sort === "updated" ? "-date_updated" :
    sort === "name" ? "name" : "-popular";
  const params = new URLSearchParams({
    api_key: MODIO_KEY,
    _limit: String(count),
    _offset: String(offset),
    _sort: sortValue,
  });
  if (q) params.set("_q", q);
  const r = await fetch(`https://api.mod.io/v1/games/${gameId}/mods?${params}`, {
    headers: { Accept: "application/json" },
  });
  if (!r.ok) throw new Error(`mod.io HTTP ${r.status}`);
  const j: any = await r.json();
  const total = j.result_total ?? j.data?.length ?? 0;
  return {
    total,
    count: (j.data ?? []).length,
    pages: Math.max(1, Math.ceil(total / count)),
    page,
    result: (j.data ?? []).map(modioToSummary),
  };
}

async function modioMod(gameKey: string, id: string): Promise<ModDetail | null> {
  if (!MODIO_KEY) throw new Error("MODIO_API_KEY is not configured");
  const gameId = await resolveModioGameId(gameKey);
  const r = await fetch(
    `https://api.mod.io/v1/games/${gameId}/mods/${encodeURIComponent(id)}?api_key=${MODIO_KEY}`,
    { headers: { Accept: "application/json" } },
  );
  if (!r.ok) return null;
  const m: any = await r.json();
  const s = modioToSummary(m);
  return { ...s, description: m.description_plaintext ?? m.summary ?? "" };
}


// ---------- CurseForge ----------
const CF_KEY = Deno.env.get("CURSEFORGE_API_KEY") ?? "";
const CF_BASE = "https://api.curseforge.com/v1";

// Known CurseForge game IDs (gameId is required by every endpoint).
// Anything not listed is resolved dynamically via /games?gameId=slug match.
const CURSEFORGE_GAME_IDS: Record<string, number> = {
  minecraft: 432,
  "sims-4": 78,
  sims4: 78,
  "stardew-valley": 669,
  stardewvalley: 669,
  wow: 1,
  "world-of-warcraft": 1,
  "wow-classic": 1,
  rimworld: 1149,
  terraria: 431,
  kerbal: 4401,
  factorio: 432, // placeholder; factorio is 432 -- removed
};
delete (CURSEFORGE_GAME_IDS as any).factorio;

const cfGameIdCache = new Map<string, number>();

async function resolveCurseforgeGameId(game: string): Promise<number> {
  const key = game.trim().toLowerCase();
  if (/^\d+$/.test(key)) return parseInt(key, 10);
  if (CURSEFORGE_GAME_IDS[key]) return CURSEFORGE_GAME_IDS[key];
  const cached = cfGameIdCache.get(key);
  if (cached) return cached;
  if (!CF_KEY) throw new Error("CURSEFORGE_API_KEY is not configured");
  const r = await fetch(`${CF_BASE}/games?pageSize=50`, {
    headers: { Accept: "application/json", "x-api-key": CF_KEY },
  });
  if (!r.ok) throw new Error(`CurseForge games HTTP ${r.status}`);
  const j: any = await r.json();
  const match = (j?.data ?? []).find((g: any) => {
    const slug = String(g.slug ?? "").toLowerCase();
    const name = String(g.name ?? "").toLowerCase().replace(/\s+/g, "-");
    return slug === key || name === key;
  });
  if (!match) throw new Error(`CurseForge game not found: ${game}`);
  cfGameIdCache.set(key, match.id);
  return match.id;
}

function cfToSummary(m: any): ModSummary {
  const latest = (m.latestFiles ?? [])[0];
  const ver: Version[] = latest
    ? [
        {
          friendly_version: latest.displayName ?? latest.fileName ?? "latest",
          game_version: (latest.gameVersions ?? [])[0] ?? "",
          id: latest.id,
          created: latest.fileDate ?? new Date().toISOString(),
          download_path: latest.downloadUrl ?? "",
          changelog: "",
          downloads: latest.downloadCount ?? 0,
        },
      ]
    : [];
  const logo = m.logo?.thumbnailUrl || m.logo?.url || null;
  return {
    id: m.id,
    name: m.name ?? "",
    short_description: m.summary ?? "",
    author: (m.authors ?? [])[0]?.name ?? "",
    downloads: m.downloadCount ?? 0,
    followers: m.thumbsUpCount ?? 0,
    background: logo,
    license: "",
    website: m.links?.websiteUrl ?? null,
    source_code: m.links?.sourceUrl ?? null,
    url: m.links?.websiteUrl ?? `https://www.curseforge.com/`,
    versions: ver,
  };
}

async function curseforgeBrowse(gameKey: string, q: string | null, page: number, count: number, sort: SortKey = "popular"): Promise<BrowseResponse> {
  if (!CF_KEY) throw new Error("CURSEFORGE_API_KEY is not configured");
  const gameId = await resolveCurseforgeGameId(gameKey);
  // sortField: 1=Featured, 2=Popularity, 3=LastUpdated, 4=Name, 6=TotalDownloads
  const sortField =
    sort === "downloads" ? 6 :
    sort === "updated" ? 3 :
    sort === "name" ? 4 : 2;
  const sortOrder = sort === "name" ? "asc" : "desc";
  const params = new URLSearchParams({
    gameId: String(gameId),
    pageSize: String(count),
    index: String((page - 1) * count),
    sortField: String(sortField),
    sortOrder,
  });
  if (q && q.trim()) params.set("searchFilter", q.trim());
  const r = await fetch(`${CF_BASE}/mods/search?${params}`, {
    headers: { Accept: "application/json", "x-api-key": CF_KEY },
  });
  if (!r.ok) throw new Error(`CurseForge HTTP ${r.status}`);
  const j: any = await r.json();
  const total = j?.pagination?.totalCount ?? (j?.data?.length ?? 0);
  return {
    total,
    count: (j.data ?? []).length,
    pages: Math.max(1, Math.ceil(total / count)),
    page,
    result: (j.data ?? []).map(cfToSummary),
  };
}

async function curseforgeMod(_gameKey: string, id: string): Promise<ModDetail | null> {
  if (!CF_KEY) throw new Error("CURSEFORGE_API_KEY is not configured");
  const r = await fetch(`${CF_BASE}/mods/${encodeURIComponent(id)}`, {
    headers: { Accept: "application/json", "x-api-key": CF_KEY },
  });
  if (!r.ok) return null;
  const j: any = await r.json();
  const m = j?.data;
  if (!m) return null;
  // Pull full file list for richer version selection.
  let versions = cfToSummary(m).versions;
  try {
    const fr = await fetch(`${CF_BASE}/mods/${m.id}/files?pageSize=20&index=0`, {
      headers: { Accept: "application/json", "x-api-key": CF_KEY },
    });
    if (fr.ok) {
      const fj: any = await fr.json();
      versions = (fj?.data ?? []).map((f: any) => ({
        friendly_version: f.displayName ?? f.fileName ?? "file",
        game_version: (f.gameVersions ?? [])[0] ?? "",
        id: f.id,
        created: f.fileDate ?? new Date().toISOString(),
        download_path: f.downloadUrl ?? "",
        changelog: "",
        downloads: f.downloadCount ?? 0,
      }));
    }
  } catch (_e) { /* ignore, keep latest */ }
  const s = cfToSummary(m);
  return {
    ...s,
    versions,
    description: m.summary ?? "",
  };
}

// ---------- CurseForge Minecraft helpers ----------
// Files for a Minecraft project filtered by mcVersion + loader.
// CurseForge `gameVersions` strings include the MC version and one of
// "Fabric" | "Forge" | "NeoForge" | "Quilt".
async function curseforgeMcFiles(modId: string, mcVersion: string, loader: string) {
  if (!CF_KEY) throw new Error("CURSEFORGE_API_KEY is not configured");
  const r = await fetch(`${CF_BASE}/mods/${encodeURIComponent(modId)}/files?pageSize=50&index=0`, {
    headers: { Accept: "application/json", "x-api-key": CF_KEY },
  });
  if (!r.ok) throw new Error(`CurseForge files HTTP ${r.status}`);
  const j: any = await r.json();
  const wantLoader = loader.toLowerCase();
  const files = (j?.data ?? []).filter((f: any) => {
    const gv = (f.gameVersions ?? []).map((s: string) => s.toLowerCase());
    const hasMc = !mcVersion || gv.includes(mcVersion.toLowerCase());
    const hasLoader = wantLoader === "vanilla" || gv.includes(wantLoader);
    return hasMc && hasLoader;
  });
  files.sort((a: any, b: any) => new Date(b.fileDate).getTime() - new Date(a.fileDate).getTime());
  return { files };
}

async function curseforgeFile(modId: string, fileId: string) {
  if (!CF_KEY) throw new Error("CURSEFORGE_API_KEY is not configured");
  const r = await fetch(`${CF_BASE}/mods/${encodeURIComponent(modId)}/files/${encodeURIComponent(fileId)}`, {
    headers: { Accept: "application/json", "x-api-key": CF_KEY },
  });
  if (!r.ok) throw new Error(`CurseForge file HTTP ${r.status}`);
  const j: any = await r.json();
  return j?.data ?? null;
}

async function curseforgeModRaw(modId: string) {
  if (!CF_KEY) throw new Error("CURSEFORGE_API_KEY is not configured");
  const r = await fetch(`${CF_BASE}/mods/${encodeURIComponent(modId)}`, {
    headers: { Accept: "application/json", "x-api-key": CF_KEY },
  });
  if (!r.ok) return null;
  const j: any = await r.json();
  return j?.data ?? null;
}

// Recursively resolve required dependencies for a mod file on a given instance.
// Returns ordered install list (deps first, root last). De-duped by modId.
async function curseforgeMcResolve(rootModId: string, mcVersion: string, loader: string) {
  const seen = new Set<string>();
  const ordered: Array<{
    modId: number; modName: string; fileId: number;
    fileName: string; downloadUrl: string; required: boolean;
  }> = [];

  async function walk(modId: string, required: boolean) {
    if (seen.has(modId)) return;
    seen.add(modId);
    const mod = await curseforgeModRaw(modId);
    if (!mod) return;
    const { files } = await curseforgeMcFiles(modId, mcVersion, loader);
    const best = files[0];
    if (!best || !best.downloadUrl) return;
    // Walk required deps first (relationType 3 = RequiredDependency)
    const reqDeps = (best.dependencies ?? []).filter((d: any) => d.relationType === 3);
    for (const d of reqDeps) {
      await walk(String(d.modId), true);
    }
    ordered.push({
      modId: mod.id, modName: mod.name ?? `mod-${mod.id}`,
      fileId: best.id, fileName: best.fileName ?? `${best.id}.jar`,
      downloadUrl: best.downloadUrl, required,
    });
  }

  await walk(rootModId, true);
  return { install: ordered };
}

// ---------- HTTP entrypoint ----------
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const url = new URL(req.url);
    const provider = (url.searchParams.get("provider") ?? "spacedock").toLowerCase();
    const action = url.searchParams.get("action") ?? "browse";
    const game = url.searchParams.get("game") ?? "";
    const q = url.searchParams.get("query");
    const page = parseInt(url.searchParams.get("page") ?? "1", 10) || 1;
    const count = Math.min(60, parseInt(url.searchParams.get("count") ?? "30", 10) || 30);
    const id = url.searchParams.get("id") ?? "";
    const sortRaw = (url.searchParams.get("sort") ?? "popular").toLowerCase();
    const sort: SortKey = (["popular","downloads","updated","name"].includes(sortRaw) ? sortRaw : "popular") as SortKey;

    let body: unknown;
    if (provider === "spacedock") {
      body = action === "mod" ? await spacedockMod(id) : await spacedockBrowse(game || "ksp1", q, page, count, sort);
    } else if (provider === "thunderstore") {
      if (!game) throw new Error("Thunderstore community required");
      body = action === "mod" ? await thunderstoreMod(game, id) : await thunderstoreBrowse(game, q, page, count, sort);
    } else if (provider === "modio") {
      if (!game) throw new Error("Mod.io game id required");
      body = action === "mod" ? await modioMod(game, id) : await modioBrowse(game, q, page, count, sort);
    } else if (provider === "curseforge") {
      if (!game) throw new Error("CurseForge game key required");
      if (action === "mc-files") {
        const mc = url.searchParams.get("mcVersion") ?? "";
        const loader = url.searchParams.get("loader") ?? "Fabric";
        body = await curseforgeMcFiles(id, mc, loader);
      } else if (action === "mc-resolve") {
        const mc = url.searchParams.get("mcVersion") ?? "";
        const loader = url.searchParams.get("loader") ?? "Fabric";
        body = await curseforgeMcResolve(id, mc, loader);
      } else if (action === "mc-file") {
        const fileId = url.searchParams.get("fileId") ?? "";
        body = { file: await curseforgeFile(id, fileId) };
      } else {
        body = action === "mod" ? await curseforgeMod(game, id) : await curseforgeBrowse(game, q, page, count, sort);
      }
    } else {
      return new Response(JSON.stringify({ error: `unknown provider: ${provider}` }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify(body), {
      headers: { ...corsHeaders, "Content-Type": "application/json", "Cache-Control": "public, max-age=120" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e?.message ?? e) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
