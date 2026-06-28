// TMODLOADER_DEPLOY — Terraria via tModLoader.
// tModLoader stores enabled mods as `.tmod` files in the user's
// `Documents/My Games/Terraria/tModLoader/Mods/` folder. The game install
// itself contains the loader binaries.
//
// We treat the configured `installPath` as the tModLoader Mods directory the
// user picked in setup (the wizard's `pickerMode: 'root'` already supports
// this). All installs drop the `.tmod` file straight into it.

import type { GameDefinition, InstalledManifest, ModPackage } from "../types";
import { modsBridge, versionIdOf } from "./_bridge";
import type { ModStrategy, StrategyResult } from "./types";

const TML_SIGNATURE = ["tModLoader.exe", "tModLoader.dll", "Terraria.exe"];

export const tmodloaderStrategy: ModStrategy = {
  id: "TMODLOADER_DEPLOY",

  async setup(game) {
    const b = modsBridge();
    if (!b) return { ok: false, error: "Desktop app required." };
    if (!game.installPath) return { ok: false, error: "Game path not set." };
    const f = await b.setFolder(game.id, game.installPath);
    if (!f.ok) return { ok: false, error: f.error };
    const v = await b.validatePath({
      path: game.installPath,
      signatureFiles: TML_SIGNATURE,
    });
    return v.ok
      ? { ok: true }
      : {
          ok: false,
          error:
            "tModLoader not detected. Install it via Steam, then re-run setup.",
        };
  },

  async verifyLoader(game) {
    const b = modsBridge();
    if (!b) return { ok: false, error: "Desktop app required." };
    if (!game.installPath) return { ok: false, error: "Game path not set." };
    const v = await b.validatePath({
      path: game.installPath,
      signatureFiles: TML_SIGNATURE,
    });
    return v.ok ? { ok: true } : { ok: false, error: "tModLoader missing." };
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
      installSubdir: game.modFolder || "Mods",
    });
    if (!r.ok) return { ok: false, error: r.error };
    return {
      ok: true,
      data: {
        gameId: game.id,
        modId: pkg.id,
        version: pkg.version,
        strategy: "TMODLOADER_DEPLOY",
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
