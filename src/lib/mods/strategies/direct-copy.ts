// DIRECT_COPY — FOLDER_INJECTION games (KSP1, KSP2, generic drop-in mods).
// Wraps the existing window.rubix.mods bridge so nothing on disk changes.

import type { GameDefinition, InstalledManifest, ModPackage } from "../types";
import type { ModStrategy, StrategyResult } from "./types";

type DirectCopyModsBridge = {
  setFolder: (gameKey: string, path: string) => Promise<{ ok: boolean; error?: string }>;
  listInstalled: (gameKey: string) => Promise<{ ok: boolean }>;
  install: (payload: {
    gameKey: string;
    modId: string;
    modName: string;
    version: string;
    versionId: number;
    downloadUrl: string;
    stripHint?: string;
    installSubdir?: string;
  }) => Promise<{ ok: boolean; error?: string }>;
  uninstall: (gameKey: string, modId: string) => Promise<{ ok: boolean; error?: string }>;
};

function bridge(): DirectCopyModsBridge | null {
  if (typeof window === "undefined" || !window.rubix?.mods) return null;
  return window.rubix.mods as DirectCopyModsBridge;
}

export const directCopyStrategy: ModStrategy = {
  id: "DIRECT_COPY",

  async setup(game): Promise<StrategyResult> {
    const b = bridge();
    if (!b) return { ok: false, error: "Desktop app required." };
    if (!game.installPath)
      return { ok: false, error: "Game path not set — run setup wizard." };
    const r = await b.setFolder(game.id, game.installPath);
    return { ok: r.ok, error: r.error };
  },

  async verifyLoader() {
    // Folder-injection games need no loader.
    return { ok: true, data: { version: undefined } };
  },

  async install(game: GameDefinition, pkg: ModPackage): Promise<StrategyResult<InstalledManifest>> {
    const b = bridge();
    if (!b) return { ok: false, error: "Desktop app required." };
    const versionIdNum = Number.parseInt(pkg.version.replace(/\D/g, ""), 10) || Date.now();
    const r = await b.install({
      gameKey: game.id,
      modId: pkg.id,
      modName: pkg.name,
      version: pkg.version,
      versionId: versionIdNum,
      downloadUrl: pkg.archive,
      stripHint: game.stripHint ?? (game.modFolder === "GameData" ? "GameData" : ""),
      installSubdir: game.modFolder,
    });
    if (!r.ok) return { ok: false, error: r.error };
    return {
      ok: true,
      data: {
        gameId: game.id,
        modId: pkg.id,
        version: pkg.version,
        strategy: "DIRECT_COPY",
        files: [],
        installedAt: Date.now(),
      },
    };
  },

  async uninstall(game, modId) {
    const b = bridge();
    if (!b) return { ok: false, error: "Desktop app required." };
    const r = await b.uninstall(game.id, modId);
    return { ok: r.ok, error: r.error };
  },

  async validate(game) {
    const b = bridge();
    if (!b) return { ok: false, error: "Desktop app required." };
    const r = await b.listInstalled(game.id);
    return { ok: r.ok };
  },
};
