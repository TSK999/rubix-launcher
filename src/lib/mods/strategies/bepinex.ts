// BEPINEX_MAP — Thunderstore-style BepInEx games (Lethal Company, Valheim,
// Risk of Rain 2, Deep Rock Galactic, …).
//
// Layout rule:
//   * The `BepInExPack` mod itself extracts at the GAME ROOT (its archive
//     ships a `BepInExPack/` folder with `winhttp.dll` + `BepInEx/`).
//   * Every other mod gets dropped under `BepInEx/plugins/{author}-{name}/`.
//
// First install of any non-loader mod will lazily bootstrap BepInEx via the
// canonical Thunderstore pack URL if the loader is missing.

import type { GameDefinition, InstalledManifest, ModPackage } from "../types";
import { modsBridge, versionIdOf } from "./_bridge";
import type { ModStrategy, StrategyResult } from "./types";

const BEPINEX_SIGNATURE = ["winhttp.dll", "BepInEx/core/BepInEx.dll"];
const BEPINEX_PACK_URL =
  "https://thunderstore.io/package/download/BepInEx/BepInExPack/5.4.2100/";
const BEPINEX_LOADER_ID = "bepinex-core";

function isLoaderPackage(pkg: ModPackage) {
  const n = pkg.name.toLowerCase();
  return n.includes("bepinexpack") || n === "bepinex" || pkg.id === BEPINEX_LOADER_ID;
}

function pluginSubdir(pkg: ModPackage) {
  // Thunderstore packages encode "Author-Name" in id; fall back to name.
  const safe = (pkg.id || pkg.name).replace(/[^a-zA-Z0-9._-]/g, "_");
  return `BepInEx/plugins/${safe}`;
}

async function ensureLoader(game: GameDefinition): Promise<StrategyResult> {
  const b = modsBridge();
  if (!b) return { ok: false, error: "Desktop app required." };
  if (!game.installPath)
    return { ok: false, error: "Game path not set — run setup wizard." };
  const v = await b.validatePath({
    path: game.installPath,
    signatureFiles: BEPINEX_SIGNATURE,
  });
  if (v.ok) return { ok: true };
  const r = await b.install({
    gameKey: game.id,
    modId: BEPINEX_LOADER_ID,
    modName: "BepInExPack",
    version: "5.4.2100",
    versionId: 542100,
    downloadUrl: BEPINEX_PACK_URL,
    // Thunderstore packs ship as `BepInExPack/` at the archive root.
    stripHint: "BepInExPack",
    installSubdir: "",
  });
  return r.ok ? { ok: true } : { ok: false, error: r.error };
}

export const bepinexStrategy: ModStrategy = {
  id: "BEPINEX_MAP",

  async setup(game) {
    const b = modsBridge();
    if (!b) return { ok: false, error: "Desktop app required." };
    if (!game.installPath)
      return { ok: false, error: "Game path not set — run setup wizard." };
    const r = await b.setFolder(game.id, game.installPath);
    if (!r.ok) return { ok: false, error: r.error };
    return ensureLoader(game);
  },

  async verifyLoader(game) {
    const b = modsBridge();
    if (!b) return { ok: false, error: "Desktop app required." };
    if (!game.installPath) return { ok: false, error: "Game path not set." };
    const v = await b.validatePath({
      path: game.installPath,
      signatureFiles: BEPINEX_SIGNATURE,
    });
    return v.ok
      ? { ok: true, data: { version: "5.x" } }
      : { ok: false, error: "BepInEx not installed — run setup." };
  },

  async install(game, pkg): Promise<StrategyResult<InstalledManifest>> {
    const b = modsBridge();
    if (!b) return { ok: false, error: "Desktop app required." };
    if (!isLoaderPackage(pkg)) {
      const loader = await ensureLoader(game);
      if (!loader.ok) return { ok: false, error: loader.error };
    }
    const isLoader = isLoaderPackage(pkg);
    const r = await b.install({
      gameKey: game.id,
      modId: pkg.id,
      modName: pkg.name,
      version: pkg.version,
      versionId: versionIdOf(pkg.version),
      downloadUrl: pkg.archive,
      stripHint: isLoader ? "BepInExPack" : "",
      installSubdir: isLoader ? "" : pluginSubdir(pkg),
    });
    if (!r.ok) return { ok: false, error: r.error };
    return {
      ok: true,
      data: {
        gameId: game.id,
        modId: pkg.id,
        version: pkg.version,
        strategy: "BEPINEX_MAP",
        files: [],
        loaderVersion: isLoader ? pkg.version : undefined,
        installedAt: Date.now(),
      },
    };
  },

  async uninstall(game, modId) {
    const b = modsBridge();
    if (!b) return { ok: false, error: "Desktop app required." };
    const r = await b.uninstall(game.id, modId);
    return { ok: r.ok, error: r.error };
  },

  async validate(game) {
    const b = modsBridge();
    if (!b) return { ok: false, error: "Desktop app required." };
    const r = await b.listInstalled(game.id);
    return { ok: r.ok };
  },
};
