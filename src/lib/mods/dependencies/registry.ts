// Global dependency layer registry. Keyed by ModSystemType, NOT per game.
// Adding a new game requires zero changes here as long as its system type
// is already represented.

import type { ModSystemType } from "../types";
import type { Dependency } from "./types";

const dep = (d: Dependency): Dependency => d;

/** Layer A — System runtimes. Installed once, globally. */
export const SYSTEM_RUNTIME_DEPS: Dependency[] = [
  dep({
    id: "vcredist-x64",
    name: "Microsoft Visual C++ Redistributable (x64)",
    type: "REDISTRIBUTABLE",
    required: false,
    installSource: "download",
    appliesTo: ["*"],
  }),
  dep({
    id: "dotnet-desktop-runtime",
    name: ".NET Desktop Runtime",
    type: "RUNTIME",
    required: false,
    installSource: "download",
    appliesTo: ["*"],
  }),
];

/** Layer C — Mod loader + framework dependencies, indexed by ModSystemType. */
export const LOADER_LAYER_DEPS: Record<ModSystemType, Dependency[]> = {
  FOLDER_INJECTION: [],

  BEPINEX_RUNTIME: [
    dep({
      id: "bepinex-core",
      name: "BepInEx Runtime Core",
      type: "MOD_LOADER",
      required: true,
      installSource: "download",
      appliesTo: ["BEPINEX_RUNTIME"],
      loader: "BEPINEX",
    }),
    dep({
      id: "harmony",
      name: "Harmony Patcher",
      type: "PATCHER",
      required: true,
      installSource: "bundled",
      appliesTo: ["BEPINEX_RUNTIME"],
      dependsOn: ["bepinex-core"],
    }),
    dep({
      id: "monomod-utils",
      name: "MonoMod Utils",
      type: "PATCHER",
      required: false,
      installSource: "bundled",
      appliesTo: ["BEPINEX_RUNTIME"],
      dependsOn: ["bepinex-core"],
    }),
  ],

  MELONLOADER_RUNTIME: [
    dep({
      id: "melonloader-bootstrap",
      name: "MelonLoader Bootstrapper",
      type: "MOD_LOADER",
      required: true,
      installSource: "download",
      appliesTo: ["MELONLOADER_RUNTIME"],
      loader: "MELONLOADER",
    }),
    dep({
      id: "il2cpp-interop",
      name: "Il2CppInterop",
      type: "GAME_ENGINE_EXTENSION",
      required: false,
      installSource: "bundled",
      appliesTo: ["MELONLOADER_RUNTIME"],
      dependsOn: ["melonloader-bootstrap"],
    }),
  ],

  PROFILE_BASED_RUNTIME: [
    // Loader is one-of; resolver picks based on profile.loader.
    dep({
      id: "fabric-loader",
      name: "Fabric Loader",
      type: "MOD_LOADER",
      required: true,
      installSource: "download",
      appliesTo: ["PROFILE_BASED_RUNTIME"],
      loader: "FABRIC",
    }),
    dep({
      id: "forge-loader",
      name: "Minecraft Forge Loader",
      type: "MOD_LOADER",
      required: true,
      installSource: "download",
      appliesTo: ["PROFILE_BASED_RUNTIME"],
      loader: "FORGE",
    }),
    dep({
      id: "neoforge-loader",
      name: "NeoForge Loader",
      type: "MOD_LOADER",
      required: true,
      installSource: "download",
      appliesTo: ["PROFILE_BASED_RUNTIME"],
      loader: "NEOFORGE",
    }),
    dep({
      id: "fabric-api",
      name: "Fabric API",
      type: "API_LAYER",
      required: false,
      installSource: "download",
      appliesTo: ["PROFILE_BASED_RUNTIME"],
      loader: "FABRIC",
      dependsOn: ["fabric-loader"],
    }),
    dep({
      id: "mixin",
      name: "Mixin",
      type: "API_LAYER",
      required: false,
      installSource: "bundled",
      appliesTo: ["PROFILE_BASED_RUNTIME"],
      loader: "FORGE",
      dependsOn: ["forge-loader"],
    }),
  ],

  SMAPI_RUNTIME: [
    dep({
      id: "smapi",
      name: "SMAPI Runtime",
      type: "MOD_LOADER",
      required: true,
      installSource: "download",
      appliesTo: ["SMAPI_RUNTIME"],
      loader: "SMAPI",
    }),
    dep({
      id: "content-patcher",
      name: "Content Patcher",
      type: "FRAMEWORK",
      required: false,
      installSource: "download",
      appliesTo: ["SMAPI_RUNTIME"],
      dependsOn: ["smapi"],
    }),
    dep({
      id: "gmcm",
      name: "Generic Mod Config Menu",
      type: "API_LAYER",
      required: false,
      installSource: "download",
      appliesTo: ["SMAPI_RUNTIME"],
      dependsOn: ["smapi"],
    }),
  ],

  TMODLOADER_RUNTIME: [
    dep({
      id: "tmodloader",
      name: "tModLoader Runtime",
      type: "MOD_LOADER",
      required: true,
      installSource: "game-internal",
      appliesTo: ["TMODLOADER_RUNTIME"],
      loader: "TMODLOADER",
    }),
  ],

  ADDON_FOLDER_SYSTEM: [],
  MODIO_NATIVE_SYNC: [],
  HYBRID_SPECIAL: [],
};

export function getLayerDeps(
  system: ModSystemType,
  loader?: string,
): Dependency[] {
  const all = LOADER_LAYER_DEPS[system] ?? [];
  if (!loader) return all;
  // Keep loader-agnostic deps + ones matching the chosen loader.
  return all.filter((d) => !d.loader || d.loader === loader);
}
