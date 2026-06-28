// MODIO_SUBSCRIBE — games with native mod.io integration (Ready or Not,
// Space Engineers, SnowRunner). The game itself syncs subscribed mods on
// next launch, so installation is just a subscribe API call — no file I/O.
//
// Subscribe goes through the existing `mods-api` edge function which is
// already wired for browsing; we re-use the same endpoint with action=subscribe
// so the user's mod.io account (linked via OAuth) handles auth on the server.

import { supabase } from "@/integrations/supabase/client";
import type { GameDefinition, InstalledManifest, ModPackage } from "../types";
import type { ModStrategy, StrategyResult } from "./types";

async function modioCall(
  action: "subscribe" | "unsubscribe",
  game: string,
  modId: string,
): Promise<StrategyResult> {
  try {
    const { data, error } = await supabase.functions.invoke("mods-api", {
      body: { provider: "modio", action, game, modId },
    });
    if (error) return { ok: false, error: error.message };
    if (data && data.error) return { ok: false, error: String(data.error) };
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export const modioStrategy: ModStrategy = {
  id: "MODIO_SUBSCRIBE",

  async setup() {
    // Account linking is handled in the dedicated settings UI; nothing to do
    // on a per-game basis. The game's native client picks up subscriptions.
    return { ok: true };
  },

  async verifyLoader() {
    // mod.io games have no loader.
    return { ok: true, data: { version: undefined } };
  },

  async install(game, pkg): Promise<StrategyResult<InstalledManifest>> {
    const r = await modioCall("subscribe", game.id, pkg.id);
    if (!r.ok) return { ok: false, error: r.error };
    return {
      ok: true,
      data: {
        gameId: game.id,
        modId: pkg.id,
        version: pkg.version,
        strategy: "MODIO_SUBSCRIBE",
        files: [],
        installedAt: Date.now(),
      },
    };
  },

  async uninstall(game, modId) {
    return modioCall("unsubscribe", game.id, modId);
  },

  async validate() {
    return { ok: true };
  },
};
