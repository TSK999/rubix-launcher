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

async function spacedockBrowse(game: string, q: string | null, page: number, count: number): Promise<BrowseResponse> {
  const gameId = SPACEDOCK_GAMES[game] ?? SPACEDOCK_GAMES.ksp1;
  const url = q
    ? `${SPACEDOCK}/api/search/mod?query=${encodeURIComponent(q)}&page=${page}`
    : `${SPACEDOCK}/api/browse?game_id=${gameId}&count=${count}&page=${page}&orderby=downloads&order=desc`;
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

async function thunderstoreBrowse(community: string, q: string | null, page: number, count: number): Promise<BrowseResponse> {
  // Cyberstorm caps page_size at 20 — fan out pages to honour the requested count
  const PAGE_SIZE = 20;
  const need = Math.min(count, 60);
  const startIdx = (page - 1) * need;
  const firstPage = Math.floor(startIdx / PAGE_SIZE) + 1;
  const offsetInFirst = startIdx % PAGE_SIZE;
  const params = new URLSearchParams({
    ordering: "most-downloaded",
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

async function modioBrowse(gameKey: string, q: string | null, page: number, count: number): Promise<BrowseResponse> {
  if (!MODIO_KEY) throw new Error("MODIO_API_KEY is not configured");
  const gameId = await resolveModioGameId(gameKey);
  const offset = (page - 1) * count;
  const params = new URLSearchParams({
    api_key: MODIO_KEY,
    _limit: String(count),
    _offset: String(offset),
    _sort: "-downloads",
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

    let body: unknown;
    if (provider === "spacedock") {
      body = action === "mod" ? await spacedockMod(id) : await spacedockBrowse(game || "ksp1", q, page, count);
    } else if (provider === "thunderstore") {
      if (!game) throw new Error("Thunderstore community required");
      body = action === "mod" ? await thunderstoreMod(game, id) : await thunderstoreBrowse(game, q, page, count);
    } else if (provider === "modio") {
      if (!game) throw new Error("Mod.io game id required");
      body = action === "mod" ? await modioMod(game, id) : await modioBrowse(game, q, page, count);
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
