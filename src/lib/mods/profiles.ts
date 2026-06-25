// Static registry mapping known games → Mod Handling Profile.
// New games: add an entry here. No code changes required elsewhere.

import type { InstallStrategy, LoaderType, ModSource, ModSystemType } from "./types";

export interface ModProfile {
  /** Match by lowercase game name substring OR known id. */
  match: (game: { id?: string; name?: string }) => boolean;
  modSystemType: ModSystemType;
  defaultLoader?: LoaderType;
  defaultStrategy: InstallStrategy;
  modFolder?: string;
  sources: ModSource[];
}

const nameIs = (...names: string[]) => (g: { name?: string }) =>
  !!g.name && names.some((n) => g.name!.toLowerCase().includes(n));

export const MOD_PROFILES: ModProfile[] = [
  // FOLDER_INJECTION — KSP family
  {
    match: nameIs("kerbal space program 2", "ksp2"),
    modSystemType: "FOLDER_INJECTION",
    defaultLoader: "NONE",
    defaultStrategy: "DIRECT_COPY",
    modFolder: "BepInEx/plugins",
    sources: ["spacedock", "manual"],
  },
  {
    match: nameIs("kerbal space program", "ksp"),
    modSystemType: "FOLDER_INJECTION",
    defaultLoader: "NONE",
    defaultStrategy: "DIRECT_COPY",
    modFolder: "GameData",
    sources: ["spacedock", "curseforge", "manual"],
  },

  // BEPINEX_RUNTIME
  {
    match: nameIs("lethal company", "valheim", "risk of rain 2", "deep rock galactic"),
    modSystemType: "BEPINEX_RUNTIME",
    defaultLoader: "BEPINEX",
    defaultStrategy: "BEPINEX_MAP",
    sources: ["thunderstore"],
  },

  // MELONLOADER_RUNTIME
  {
    match: nameIs("bonelab", "blade & sorcery", "blade and sorcery"),
    modSystemType: "MELONLOADER_RUNTIME",
    defaultLoader: "MELONLOADER",
    defaultStrategy: "MELONLOADER_DLL",
    modFolder: "Mods",
    sources: ["thunderstore", "nexus", "manual"],
  },

  // PROFILE_BASED_RUNTIME
  {
    match: nameIs("minecraft"),
    modSystemType: "PROFILE_BASED_RUNTIME",
    defaultLoader: "FABRIC",
    defaultStrategy: "PROFILE_ISOLATED",
    sources: ["modrinth", "curseforge"],
  },

  // SMAPI
  {
    match: nameIs("stardew valley"),
    modSystemType: "SMAPI_RUNTIME",
    defaultLoader: "SMAPI",
    defaultStrategy: "SMAPI_DEPLOY",
    modFolder: "Mods",
    sources: ["nexus", "manual"],
  },

  // TMODLOADER
  {
    match: nameIs("terraria"),
    modSystemType: "TMODLOADER_RUNTIME",
    defaultLoader: "TMODLOADER",
    defaultStrategy: "TMODLOADER_DEPLOY",
    sources: ["manual"],
  },

  // ADDON_FOLDER_SYSTEM
  {
    match: nameIs("world of warcraft", "wow"),
    modSystemType: "ADDON_FOLDER_SYSTEM",
    defaultLoader: "NONE",
    defaultStrategy: "ADDON_COPY",
    modFolder: "Interface/AddOns",
    sources: ["curseforge", "manual"],
  },

  // MODIO_NATIVE_SYNC
  {
    match: nameIs("ready or not", "space engineers", "snowrunner"),
    modSystemType: "MODIO_NATIVE_SYNC",
    defaultLoader: "NONE",
    defaultStrategy: "MODIO_SUBSCRIBE",
    sources: ["modio"],
  },
];

export const FALLBACK_PROFILE: ModProfile = {
  match: () => true,
  modSystemType: "FOLDER_INJECTION",
  defaultLoader: "NONE",
  defaultStrategy: "DIRECT_COPY",
  modFolder: "Mods",
  sources: ["manual"],
};

export function findProfile(game: { id?: string; name?: string }): ModProfile {
  return MOD_PROFILES.find((p) => p.match(game)) ?? FALLBACK_PROFILE;
}
