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
  it("returns notImplemented stub for unimplemented strategies", async () => {
    const r = await getStrategy("BEPINEX_MAP").install(game, pkg);
    expect(r.ok).toBe(false);
    expect(r.error).toContain("not implemented");
  });

  it("installMod surfaces guardrail errors before dispatch", async () => {
    const r = await installMod({ ...game, setupState: "UNCONFIGURED" }, pkg);
    expect(r.ok).toBe(false);
    expect(r.error).toContain("Setup Wizard");
  });
});
