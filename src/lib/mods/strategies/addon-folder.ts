// ADDON_COPY — World of Warcraft AddOns.
// AddOns are folders containing a `.toc` file, extracted directly into
// `<WoW>/_retail_/Interface/AddOns/` (or _classic_, _classic_era_).
// The user picks the flavor folder during setup; we drop archives straight in.

import type { GameDefinition, InstalledManifest, ModPackage } from "../types";
import { modsBridge, versionIdOf } from "./_bridge";
import type { ModStrategy, StrategyResult } from "./types";

const ADDONS_SIGNATURE = ["Blizzard_UI"]; // present in default AddOns dir

export const addonFolderStrategy: ModStrategy = {
  id: "ADDON_COPY",

  async setup(game) {
    const b = modsBridge();
    if (!b) return { ok: false, error: "Desktop app required." };
    if (!game.installPath) return { ok: false, error: "Game path not set." };
    const f = await b.setFolder(game.id, game.installPath);
    return f.ok ? { ok: true } : { ok: false, error: f.error };
  },

  async verifyLoader() {
    // No loader — AddOns are loaded by the WoW client directly.
    return { ok: true, data: { version: undefined } };
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
      installSubdir: game.modFolder || "Interface/AddOns",
    });
    if (!r.ok) return { ok: false, error: r.error };
    return {
      ok: true,
      data: {
        gameId: game.id,
        modId: pkg.id,
        version: pkg.version,
        strategy: "ADDON_COPY",
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
    if (game.installPath) {
      await b.validatePath({
        path: game.installPath,
        signatureFiles: ADDONS_SIGNATURE,
      });
    }
    const r = await b.listInstalled(game.id);
    return { ok: r.ok };
  },
};
