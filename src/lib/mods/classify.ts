// Section 4 decision tree. Profile registry first, then heuristic fallbacks.

import { findProfile } from "./profiles";
import type { GameDefinition, ModSystemType } from "./types";

export interface ClassifySignals {
  hasBepInExFiles?: boolean;
  hasMelonLoaderFiles?: boolean;
  hasForgeOrFabric?: boolean;
  hasSmapiFiles?: boolean;
  hasTModLoader?: boolean;
  hasAddonsFolder?: boolean;
  supportsModIo?: boolean;
}

export function classifyGame(
  game: Pick<GameDefinition, "id" | "name">,
  signals: ClassifySignals = {},
): ModSystemType {
  // 1) Known profile wins.
  const profile = findProfile(game);
  if (profile.modSystemType !== "FOLDER_INJECTION" || profile !== undefined) {
    // profile is never undefined; we still want fallback heuristic below if it landed on default
  }
  if (profile.match(game) && profile.modSystemType) return profile.modSystemType;

  // 2) Signature-based heuristic (Section 4).
  if (signals.hasBepInExFiles) return "BEPINEX_RUNTIME";
  if (signals.hasMelonLoaderFiles) return "MELONLOADER_RUNTIME";
  if (signals.hasForgeOrFabric) return "PROFILE_BASED_RUNTIME";
  if (signals.hasSmapiFiles) return "SMAPI_RUNTIME";
  if (signals.hasTModLoader) return "TMODLOADER_RUNTIME";
  if (signals.hasAddonsFolder) return "ADDON_FOLDER_SYSTEM";
  if (signals.supportsModIo) return "MODIO_NATIVE_SYNC";

  return "FOLDER_INJECTION";
}
