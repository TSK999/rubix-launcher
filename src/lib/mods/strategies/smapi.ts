// SMAPI_DEPLOY — Stardew Valley.
// Mods are folders containing `manifest.json`, placed under `Mods/`.
// SMAPI itself must be installed manually (Steam launch options patching is
// out of scope here); we verify it and surface a clear error if missing.

import type { GameDefinition, InstalledManifest, ModPackage } from "../types";
import { modsBridge, versionIdOf } from "./_bridge";
import type { ModStrategy, StrategyResult } from "./types";

const SMAPI_SIGNATURE = ["StardewModdingAPI.exe", "Mods"];

function modSubdir(pkg: ModPackage) {
  const safe = pkg.name.replace(/[^a-zA-Z0-9._ -]/g, "_").trim();
  return `Mods/${safe || pkg.id}`;
}

export const smapiStrategy: ModStrategy = {
  id: "SMAPI_DEPLOY",

  async setup(game) {
    const b = modsBridge();
    if (!b) return { ok: false, error: "Desktop app required." };
    if (!game.installPath) return { ok: false, error: "Game path not set." };
    const f = await b.setFolder(game.id, game.installPath);
    if (!f.ok) return { ok: false, error: f.error };
    const v = await b.validatePath({
      path: game.installPath,
      signatureFiles: SMAPI_SIGNATURE,
    });
    return v.ok
      ? { ok: true }
      : {
          ok: false,
          error:
            "SMAPI not installed. Install SMAPI from smapi.io, then re-run setup.",
        };
  },

  async verifyLoader(game) {
    const b = modsBridge();
    if (!b) return { ok: false, error: "Desktop app required." };
    if (!game.installPath) return { ok: false, error: "Game path not set." };
    const v = await b.validatePath({
      path: game.installPath,
      signatureFiles: SMAPI_SIGNATURE,
    });
    return v.ok
      ? { ok: true, data: { version: undefined } }
      : { ok: false, error: "SMAPI missing." };
  },

  async install(game, pkg): Promise<StrategyResult<InstalledManifest>> {
    const b = modsBridge();
    if (!b) return { ok: false, error: "Desktop app required." };
    const r = await b.install({
      gameKey: game.id,
      modId: pkg.id,
      modName: pkg.name,
      version: pkg.version,
      versionId: versionIdOf(pkg.version),
      downloadUrl: pkg.archive,
      stripHint: "",
      installSubdir: modSubdir(pkg),
    });
    if (!r.ok) return { ok: false, error: r.error };
    return {
      ok: true,
      data: {
        gameId: game.id,
        modId: pkg.id,
        version: pkg.version,
        strategy: "SMAPI_DEPLOY",
        files: [],
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
