// Central dispatcher. UI imports installMod/uninstallMod from here.

import { preInstallGuardrails } from "../state-machine";
import type { GameDefinition, InstalledManifest, ModPackage } from "../types";
import { ModInstallError } from "../types";
import { directCopyStrategy } from "./direct-copy";
import { profileIsolatedStrategy } from "./profile-isolated";
import { notImplemented, type ModStrategy, type StrategyResult } from "./types";

const STRATEGIES: Record<string, ModStrategy> = {
  DIRECT_COPY: directCopyStrategy,
  PROFILE_ISOLATED: profileIsolatedStrategy,
  BEPINEX_MAP: notImplemented("BEPINEX_MAP"),
  MELONLOADER_DLL: notImplemented("MELONLOADER_DLL"),
  SMAPI_DEPLOY: notImplemented("SMAPI_DEPLOY"),
  TMODLOADER_DEPLOY: notImplemented("TMODLOADER_DEPLOY"),
  ADDON_COPY: notImplemented("ADDON_COPY"),
  MODIO_SUBSCRIBE: notImplemented("MODIO_SUBSCRIBE"),
};

export function getStrategy(strategyId: string): ModStrategy {
  return STRATEGIES[strategyId] ?? notImplemented(strategyId);
}

function strategyForGame(game: GameDefinition): string {
  switch (game.modSystemType) {
    case "FOLDER_INJECTION": return "DIRECT_COPY";
    case "BEPINEX_RUNTIME": return "BEPINEX_MAP";
    case "MELONLOADER_RUNTIME": return "MELONLOADER_DLL";
    case "PROFILE_BASED_RUNTIME": return "PROFILE_ISOLATED";
    case "SMAPI_RUNTIME": return "SMAPI_DEPLOY";
    case "TMODLOADER_RUNTIME": return "TMODLOADER_DEPLOY";
    case "ADDON_FOLDER_SYSTEM": return "ADDON_COPY";
    case "MODIO_NATIVE_SYNC": return "MODIO_SUBSCRIBE";
    default: return "DIRECT_COPY";
  }
}

export async function setupGame(game: GameDefinition): Promise<StrategyResult> {
  return getStrategy(strategyForGame(game)).setup(game);
}

export async function verifyLoader(game: GameDefinition): Promise<StrategyResult<{ version?: string }>> {
  return getStrategy(strategyForGame(game)).verifyLoader(game);
}

export async function installMod(
  game: GameDefinition,
  pkg: ModPackage,
): Promise<StrategyResult<InstalledManifest>> {
  const guard = preInstallGuardrails(game, pkg);
  if (guard) return { ok: false, error: guard.message };
  try {
    return await getStrategy(pkg.installStrategy).install(game, pkg);
  } catch (e) {
    if (e instanceof ModInstallError) return { ok: false, error: `${e.code}: ${e.message}` };
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export async function uninstallMod(
  game: GameDefinition,
  modId: string,
  strategy?: string,
): Promise<StrategyResult> {
  return getStrategy(strategy ?? strategyForGame(game)).uninstall(game, modId);
}

export type { ModStrategy, StrategyResult } from "./types";
