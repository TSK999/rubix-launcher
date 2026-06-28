import { describe, expect, it } from "vitest";
import { getStrategy, installMod } from "@/lib/mods/strategies";
import type { GameDefinition, ModPackage } from "@/lib/mods/types";

const game: GameDefinition = {
  id: "g-bep",
  name: "Lethal Company",
  platform: "steam",
  installPath: "/games/lc",
  modSystemType: "BEPINEX_RUNTIME",
  loader: "BEPINEX",
  modSources: ["thunderstore"],
  configured: true,
  setupState: "READY",
};

const pkg: ModPackage = {
  id: "m1",
  name: "Test",
  version: "1.0.0",
  source: "thunderstore",
  gameId: game.id,
  archive: "https://example.com/x.zip",
  installStrategy: "BEPINEX_MAP",
  requires: { loader: "BEPINEX" },
};

describe("strategy dispatcher", () => {
  it("returns a real strategy for every supported InstallStrategy", () => {
    for (const id of [
      "DIRECT_COPY",
      "PROFILE_ISOLATED",
      "BEPINEX_MAP",
      "MELONLOADER_DLL",
      "SMAPI_DEPLOY",
      "TMODLOADER_DEPLOY",
      "ADDON_COPY",
      "MODIO_SUBSCRIBE",
    ] as const) {
      expect(getStrategy(id).id).toBe(id);
    }
  });

  it("falls back to notImplemented stub for unknown strategies", async () => {
    const r = await getStrategy("DOES_NOT_EXIST").install(game, pkg);
    expect(r.ok).toBe(false);
    expect(r.error).toContain("not implemented");
  });

  it("installMod surfaces guardrail errors before dispatch", async () => {
    const r = await installMod({ ...game, setupState: "UNCONFIGURED" }, pkg);
    expect(r.ok).toBe(false);
    expect(r.error).toContain("Setup Wizard");
  });

  it("strategies require the desktop bridge when run in a node env", async () => {
    // No window.rubix in vitest → bepinex install short-circuits cleanly.
    const r = await getStrategy("BEPINEX_MAP").install(game, {
      ...pkg,
      installStrategy: "BEPINEX_MAP",
    });
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/Desktop app required/);
  });
});
