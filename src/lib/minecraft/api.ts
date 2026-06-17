// API helpers for Minecraft: Mojang version manifest, loader version
// listings, and CurseForge Minecraft-aware endpoints (via mods-api edge fn).

import { supabase } from "@/integrations/supabase/client";

export type Loader = "Fabric" | "Forge" | "NeoForge" | "Quilt" | "Vanilla";
export const LOADERS: Loader[] = ["Fabric", "Forge", "NeoForge", "Quilt", "Vanilla"];

export type McVersion = {
  id: string;
  type: "release" | "snapshot" | "old_alpha" | "old_beta";
  releaseTime: string;
};

const MOJANG_MANIFEST = "https://piston-meta.mojang.com/mc/game/version_manifest_v2.json";

let _versionCache: McVersion[] | null = null;
export async function fetchMinecraftVersions(): Promise<McVersion[]> {
  if (_versionCache) return _versionCache;
  const r = await fetch(MOJANG_MANIFEST);
  const j = await r.json();
  _versionCache = (j.versions || []).map((v: any) => ({
    id: v.id, type: v.type, releaseTime: v.releaseTime,
  }));
  return _versionCache!;
}

// -------- Loader versions --------

export async function fetchLoaderVersions(loader: Loader, mc: string): Promise<string[]> {
  try {
    if (loader === "Vanilla") return [""];
    if (loader === "Fabric") {
      const r = await fetch(`https://meta.fabricmc.net/v2/versions/loader/${encodeURIComponent(mc)}`);
      if (!r.ok) return [];
      const j = await r.json();
      return (j || []).map((x: any) => x.loader?.version).filter(Boolean);
    }
    if (loader === "Quilt") {
      const r = await fetch(`https://meta.quiltmc.org/v3/versions/loader/${encodeURIComponent(mc)}`);
      if (!r.ok) return [];
      const j = await r.json();
      return (j || []).map((x: any) => x.loader?.version).filter(Boolean);
    }
    if (loader === "NeoForge") {
      // NeoForge versions are <mc-major>.<minor>.<patch>, e.g. 21.1.x for MC 1.21.1
      const r = await fetch("https://maven.neoforged.net/api/maven/versions/releases/net/neoforged/neoforge");
      if (!r.ok) return [];
      const j = await r.json();
      const all: string[] = j?.versions || [];
      // Heuristic: filter to those whose prefix matches the MC's "minor.patch"
      const parts = mc.split(".");
      const prefix = parts.length >= 2 ? `${parts[1]}.${parts[2] ?? "0"}` : "";
      const matched = prefix ? all.filter((v) => v.startsWith(prefix)) : all;
      return matched.reverse();
    }
    if (loader === "Forge") {
      const r = await fetch("https://files.minecraftforge.net/net/minecraftforge/forge/promotions_slim.json");
      if (!r.ok) return [];
      const j = await r.json();
      const promos: Record<string, string> = j?.promos || {};
      const out: string[] = [];
      const rec = promos[`${mc}-recommended`];
      const latest = promos[`${mc}-latest`];
      if (rec) out.push(rec);
      if (latest && latest !== rec) out.push(latest);
      return out;
    }
  } catch (_e) { /* ignore */ }
  return [];
}

// -------- CurseForge Minecraft --------

const FN = "mods-api";

export type CfMod = {
  id: number; name: string; short_description: string; author: string;
  downloads: number; background: string | null; url: string;
};

export async function cfBrowseMinecraft(query: string, page = 1, sort: "popular" | "downloads" | "updated" | "name" = "popular") {
  const { data, error } = await supabase.functions.invoke(FN, {
    body: null,
    method: "GET",
  } as any);
  // The edge function uses query params; fallback to direct fetch via URL.
  // Using supabase.functions.invoke with query is awkward — use fetch with URL.
  void data; void error;
  const url = `${(supabase as any).functionsUrl ?? ""}/${FN}?provider=curseforge&game=minecraft&query=${encodeURIComponent(query)}&page=${page}&sort=${sort}`;
  // The supabase client doesn't expose functionsUrl; build URL from env.
  const base = `https://${import.meta.env.VITE_SUPABASE_PROJECT_ID}.supabase.co/functions/v1/${FN}`;
  const u = `${base}?provider=curseforge&game=minecraft&query=${encodeURIComponent(query)}&page=${page}&sort=${sort}`;
  const r = await fetch(u, {
    headers: { Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}` },
  });
  if (!r.ok) throw new Error(`Browse failed (${r.status})`);
  return r.json();
}

function fnUrl(qs: string) {
  const base = `https://${import.meta.env.VITE_SUPABASE_PROJECT_ID}.supabase.co/functions/v1/${FN}`;
  return `${base}?${qs}`;
}
async function fnGet(qs: string) {
  const r = await fetch(fnUrl(qs), {
    headers: { Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}` },
  });
  if (!r.ok) throw new Error(`Request failed (${r.status})`);
  return r.json();
}

export async function cfMcFiles(modId: number | string, mcVersion: string, loader: Loader) {
  return fnGet(
    `provider=curseforge&game=minecraft&action=mc-files&id=${encodeURIComponent(String(modId))}&mcVersion=${encodeURIComponent(mcVersion)}&loader=${encodeURIComponent(loader)}`,
  ) as Promise<{ files: any[] }>;
}

export async function cfMcResolve(modId: number | string, mcVersion: string, loader: Loader) {
  return fnGet(
    `provider=curseforge&game=minecraft&action=mc-resolve&id=${encodeURIComponent(String(modId))}&mcVersion=${encodeURIComponent(mcVersion)}&loader=${encodeURIComponent(loader)}`,
  ) as Promise<{
    install: Array<{ modId: number; modName: string; fileId: number; fileName: string; downloadUrl: string; required: boolean }>;
  }>;
}

export async function cfMcFile(modId: number | string, fileId: number | string) {
  return fnGet(
    `provider=curseforge&game=minecraft&action=mc-file&id=${encodeURIComponent(String(modId))}&fileId=${encodeURIComponent(String(fileId))}`,
  ) as Promise<{ file: any }>;
}

export function formatBytes(b: number): string {
  if (!b) return "0 B";
  const u = ["B", "KB", "MB", "GB"];
  let i = 0; let n = b;
  while (n >= 1024 && i < u.length - 1) { n /= 1024; i++; }
  return `${n.toFixed(n >= 10 || i === 0 ? 0 : 1)} ${u[i]}`;
}
