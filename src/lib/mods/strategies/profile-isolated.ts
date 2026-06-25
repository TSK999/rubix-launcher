// PROFILE_ISOLATED — Minecraft. Each instance is its own profile dir.
// Wraps the existing window.rubix.minecraft bridge.

import type { GameDefinition, InstalledManifest, ModPackage } from "../types";
import type { ModStrategy, StrategyResult } from "./types";

function mc() {
  if (typeof window === "undefined" || !window.rubix?.minecraft) return null;
  return window.rubix.minecraft;
}

type McExtras = {
  instance?: string;
  fileId?: number;
  fileName?: string;
  displayName?: string;
};
function mcExtras(pkg: ModPackage): McExtras {
  return (pkg as ModPackage & McExtras) ?? {};
}
function instanceOf(pkg: ModPackage): string {
  return mcExtras(pkg).instance ?? "default";
}

export const profileIsolatedStrategy: ModStrategy = {
  id: "PROFILE_ISOLATED",

  async setup(): Promise<StrategyResult> {
    const b = mc();
    if (!b) return { ok: false, error: "Desktop app required." };
    const env = await b.env();
    return { ok: !!env.ok, error: env.ok ? undefined : "Minecraft root unavailable." };
  },

  async verifyLoader(_game: GameDefinition) {
    const b = mc();
    if (!b) return { ok: false, error: "Desktop app required." };
    const env = await b.env();
    return { ok: !!env.ok, data: { version: env.java?.version } };
  },

  async install(game: GameDefinition, pkg: ModPackage): Promise<StrategyResult<InstalledManifest>> {
    const b = mc();
    if (!b) return { ok: false, error: "Desktop app required." };
    const extras = mcExtras(pkg);
    const projectId = Number.parseInt(pkg.id, 10);
    const fileId = extras.fileId ?? (Number.parseInt(pkg.version.replace(/\D/g, ""), 10) || Date.now());
    const r = await b.installMod({
      instance: instanceOf(pkg),
      projectId: Number.isFinite(projectId) ? projectId : 0,
      fileId,
      fileName: extras.fileName ?? pkg.name,
      name: extras.displayName ?? pkg.name,
      downloadUrl: pkg.archive,
      dependencies: pkg.dependencies
        ?.map((d) => Number.parseInt(d.modId, 10))
        .filter((n) => Number.isFinite(n)),
    });
    if (!r.ok) return { ok: false, error: r.error };
    return {
      ok: true,
      data: {
        gameId: game.id,
        modId: pkg.id,
        version: pkg.version,
        strategy: "PROFILE_ISOLATED",
        files: [],
        profileId: instanceOf(pkg),
        installedAt: Date.now(),
      },
    };
  },

  async uninstall(_game, modId) {
    const b = mc();
    if (!b) return { ok: false, error: "Desktop app required." };
    const projectId = Number.parseInt(modId, 10);
    if (!Number.isFinite(projectId))
      return { ok: false, error: "Minecraft uninstall requires numeric projectId." };
    const r = await b.uninstallMod("default", projectId);
    return { ok: r.ok, error: r.error };
  },

  async validate() {
    const b = mc();
    if (!b) return { ok: false, error: "Desktop app required." };
    const r = await b.listInstances();
    return { ok: r.ok, error: r.error };
  },
};
