// MELONLOADER_DLL — BONELAB, Blade & Sorcery, other Unity IL2CPP games.
// Loader: MelonLoader (https://melonwiki.xyz/). Mods are `.dll` files
// dropped into `Mods/`. UserLibs go under `UserLibs/`.

import type { GameDefinition, InstalledManifest, ModPackage } from "../types";
import { modsBridge, versionIdOf } from "./_bridge";
import type { ModStrategy, StrategyResult } from "./types";

const ML_SIGNATURE = ["version.dll", "MelonLoader/net6/MelonLoader.dll"];
const ML_RELEASE_URL =
  "https://github.com/LavaGang/MelonLoader/releases/download/v0.6.6/MelonLoader.x64.zip";
const ML_LOADER_ID = "melonloader-core";

function isLoader(pkg: ModPackage) {
  const n = pkg.name.toLowerCase();
  return n.includes("melonloader") || pkg.id === ML_LOADER_ID;
}

async function ensureLoader(game: GameDefinition): Promise<StrategyResult> {
  const b = modsBridge();
  if (!b) return { ok: false, error: "Desktop app required." };
  if (!game.installPath)
    return { ok: false, error: "Game path not set — run setup wizard." };
  const v = await b.validatePath({
    path: game.installPath,
    signatureFiles: ML_SIGNATURE,
  });
  if (v.ok) return { ok: true };
  const r = await b.install({
    gameKey: game.id,
    modId: ML_LOADER_ID,
    modName: "MelonLoader",
    version: "0.6.6",
    versionId: 66,
    downloadUrl: ML_RELEASE_URL,
    stripHint: "",
    installSubdir: "",
  });
  return r.ok ? { ok: true } : { ok: false, error: r.error };
}

export const melonloaderStrategy: ModStrategy = {
  id: "MELONLOADER_DLL",

  async setup(game) {
    const b = modsBridge();
    if (!b) return { ok: false, error: "Desktop app required." };
    if (!game.installPath)
      return { ok: false, error: "Game path not set." };
    const f = await b.setFolder(game.id, game.installPath);
    if (!f.ok) return { ok: false, error: f.error };
    return ensureLoader(game);
  },

  async verifyLoader(game) {
    const b = modsBridge();
    if (!b) return { ok: false, error: "Desktop app required." };
    if (!game.installPath) return { ok: false, error: "Game path not set." };
    const v = await b.validatePath({
      path: game.installPath,
      signatureFiles: ML_SIGNATURE,
    });
    return v.ok
      ? { ok: true, data: { version: "0.6.x" } }
      : { ok: false, error: "MelonLoader not installed — run setup." };
  },

  async install(game, pkg): Promise<StrategyResult<InstalledManifest>> {
    const b = modsBridge();
    if (!b) return { ok: false, error: "Desktop app required." };
    if (!isLoader(pkg)) {
      const r = await ensureLoader(game);
      if (!r.ok) return { ok: false, error: r.error };
    }
    const target = isLoader(pkg) ? "" : game.modFolder || "Mods";
    const r = await b.install({
      gameKey: game.id,
      modId: pkg.id,
      modName: pkg.name,
      version: pkg.version,
      versionId: versionIdOf(pkg.version),
      downloadUrl: pkg.archive,
      stripHint: "",
      installSubdir: target,
    });
    if (!r.ok) return { ok: false, error: r.error };
    return {
      ok: true,
      data: {
        gameId: game.id,
        modId: pkg.id,
        version: pkg.version,
        strategy: "MELONLOADER_DLL",
        files: [],
        loaderVersion: isLoader(pkg) ? pkg.version : undefined,
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
