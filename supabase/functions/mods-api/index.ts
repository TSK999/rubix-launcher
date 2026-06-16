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
// Community-scoped: e.g. lethal-company, valheim, risk-of-rain-2, content-warning, bonelab
function tsHashId(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

// Cache packages per community for 5 minutes (per-instance, best effort)
const tsCache = new Map<string, { ts: number; data: any[] }>();
async function tsFetchAll(community: string): Promise<any[]> {
  const cached = tsCache.get(community);
  if (cached && Date.now() - cached.ts < 5 * 60 * 1000) return cached.data;
  const r = await fetch(`https://thunderstore.io/c/${encodeURIComponent(community)}/api/v1/package/`, {
    headers: { Accept: "application/json" },
  });
  const j = await r.json();
  const arr = Array.isArray(j) ? j : [];
  tsCache.set(community, { ts: Date.now(), data: arr });
  return arr;
}

function tsToSummary(p: any): ModSummary {
  const latest = p.versions?.[0];
  return {
    id: p.uuid4 ?? tsHashId(p.full_name ?? p.name),
    name: p.name ?? latest?.name ?? "",
    short_description: latest?.description ?? "",
    author: p.owner ?? "",
    downloads: (p.versions ?? []).reduce((a: number, v: any) => a + (v.downloads ?? 0), 0),
    followers: p.rating_score ?? 0,
    background: latest?.icon ?? null,
    license: "",
    website: latest?.website_url || null,
    source_code: null,
    url: p.package_url,
    versions: (p.versions ?? []).map((v: any) => ({
      friendly_version: v.version_number,
      game_version: "",
      id: tsHashId(v.full_name ?? v.uuid4 ?? `${p.full_name}-${v.version_number}`),
      created: v.date_created,
      download_path: v.download_url,
      changelog: "",
      downloads: v.downloads,
    })),
  };
}

async function thunderstoreBrowse(community: string, q: string | null, page: number, count: number): Promise<BrowseResponse> {
  let arr = await tsFetchAll(community);
  arr = arr.filter((p) => !p.is_deprecated);
  if (q && q.trim()) {
    const needle = q.toLowerCase();
    arr = arr.filter(
      (p) =>
        (p.name ?? "").toLowerCase().includes(needle) ||
        (p.full_name ?? "").toLowerCase().includes(needle) ||
        (p.owner ?? "").toLowerCase().includes(needle) ||
        (p.versions?.[0]?.description ?? "").toLowerCase().includes(needle),
    );
  }
  // Sort by total downloads desc
  arr.sort((a, b) => {
    const ad = (a.versions ?? []).reduce((s: number, v: any) => s + (v.downloads ?? 0), 0);
    const bd = (b.versions ?? []).reduce((s: number, v: any) => s + (v.downloads ?? 0), 0);
    return bd - ad;
  });
  const total = arr.length;
  const pages = Math.max(1, Math.ceil(total / count));
  const start = (page - 1) * count;
  const slice = arr.slice(start, start + count);
  return {
    total,
    count: slice.length,
    pages,
    page,
    result: slice.map(tsToSummary),
  };
}

async function thunderstoreMod(community: string, id: string): Promise<ModDetail | null> {
  const arr = await tsFetchAll(community);
  // id may be uuid or our hashed numeric id
  const idStr = String(id);
  const idNum = Number(idStr);
  const found = arr.find((p) => {
    if (p.uuid4 === idStr) return true;
    if (!Number.isNaN(idNum) && tsHashId(p.full_name ?? p.name) === idNum) return true;
    return false;
  });
  if (!found) return null;
  const summary = tsToSummary(found);
  return { ...summary, description: found.versions?.[0]?.description ?? "" };
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

async function modioBrowse(gameId: string, q: string | null, page: number, count: number): Promise<BrowseResponse> {
  if (!MODIO_KEY) throw new Error("MODIO_API_KEY is not configured");
  const offset = (page - 1) * count;
  const params = new URLSearchParams({
    api_key: MODIO_KEY,
    _limit: String(count),
    _offset: String(offset),
    _sort: "-downloads",
  });
  if (q) params.set("_q", q);
  const r = await fetch(`https://api.mod.io/v1/games/${encodeURIComponent(gameId)}/mods?${params}`, {
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

async function modioMod(gameId: string, id: string): Promise<ModDetail | null> {
  if (!MODIO_KEY) throw new Error("MODIO_API_KEY is not configured");
  const r = await fetch(
    `https://api.mod.io/v1/games/${encodeURIComponent(gameId)}/mods/${encodeURIComponent(id)}?api_key=${MODIO_KEY}`,
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
