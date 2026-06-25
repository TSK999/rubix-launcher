import { describe, expect, it } from "vitest";
import { installMod, planInstall } from "@/lib/mods/strategies";
import type { GameDefinition, ModPackage } from "@/lib/mods/types";

const mcGame: GameDefinition = {
  id: "mc",
  name: "Minecraft",
  platform: "manual",
  installPath: "/games/mc",
  modSystemType: "PROFILE_BASED_RUNTIME",
  loader: "FABRIC",
  modSources: ["modrinth"],
  configured: true,
  setupState: "READY",
};

const mcPkg: ModPackage = {
  id: "sodium",
  name: "Sodium",
  version: "0.5.0",
  source: "modrinth",
  gameId: "mc",
  archive: "https://example.com/sodium.jar",
  installStrategy: "PROFILE_ISOLATED",
  dependencies: [{ modId: "fabric-api", version: ">=0.90.0" }],
  requires: { loader: "FABRIC" },
};

describe("phase 5 — dependency resolver wired into installMod", () => {
  it("planInstall flags missing required fabric-loader + fabric-api", () => {
    const r = planInstall(mcGame, mcPkg, []);
    expect(r.ok).toBe(false);
    expect(r.issues.some((i) => i.code === "MISSING_REQUIRED")).toBe(true);
  });

  it("planInstall passes when loader + dep are installed at satisfying versions", () => {
    const r = planInstall(mcGame, mcPkg, [
      { id: "fabric-loader", version: "0.15.0" },
      { id: "fabric-api", version: "0.91.0" },
    ]);
    expect(r.ok).toBe(true);
  });

  it("planInstall surfaces version mismatch", () => {
    const r = planInstall(mcGame, mcPkg, [
      { id: "fabric-loader", version: "0.15.0" },
      { id: "fabric-api", version: "0.80.0" },
    ]);
    expect(r.ok).toBe(false);
    expect(r.issues.some((i) => i.code === "VERSION_MISMATCH")).toBe(true);
  });

  it("installMod blocks with DEPENDENCY_UNRESOLVED when deps missing", async () => {
    const r = await installMod(mcGame, mcPkg);
    expect(r.ok).toBe(false);
    expect(r.error).toContain("DEPENDENCY_UNRESOLVED");
  });

  it("installMod skipDependencyCheck bypasses resolver", async () => {
    const r = await installMod(mcGame, mcPkg, { skipDependencyCheck: true });
    expect(r.ok).toBe(false);
    expect(r.error).not.toContain("DEPENDENCY_UNRESOLVED");
  });
});
