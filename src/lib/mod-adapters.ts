// Mod adapter registry — single source of truth for how a game's mods are
// installed. Each adapter is keyed by the storage key `${provider}-${slug}`.
//
// Adapters define:
//   - loader: the mod-loader family (BepInEx, MelonLoader, KSP CKAN, etc.)
//   - installSubdir: template path under the game's install dir
//   - stripHint: how the install zip should be unwrapped
//   - pickerMode + folderLabel: dialog hints for "Browse Folder"
//   - signatureFiles: relative paths that, if present, confirm the chosen
//     directory really is the game install (used by Auto Detect + Browse
//     validation)
//   - steamAppId / userPathHints: hints for Auto Detect
//
// The Electron main process consumes signatureFiles, steamAppId and
// userPathHints. The renderer consumes loader/installSubdir/etc.

import { MOD_SUPPORTED_GAMES } from "@/lib/mod-games";

export type ModLoader =
  | "spacedock-ckan"
  | "bepinex"
  | "melonloader"
  | "modio-native"
  | "minecraft-mods"
  | "smapi"
  | "wow-addons"
  | "rimworld-mods"
  | "tmodloader"
  | "sims4-mods"
  | "generic-zip";

export type ModAdapter = {
  storageKey: string;
  provider: "spacedock" | "thunderstore" | "modio" | "curseforge";
  slug: string;
  title: string;
  loader: ModLoader;
  loaderLabel: string;
  // Install behavior — used at install time
  installSubdir: string;          // template: supports {name}, {author}
  stripHint: string;
  // Browse Folder dialog
  pickerMode: "ksp" | "root";
  folderLabel: string;
  // Validation — at least one of these (relative to chosen dir) must exist
  // for the dir to be considered the right game install. Empty means
  // permissive (any non-empty folder accepted; a .exe/.app fallback applies).
  signatureFiles: string[];
  // Auto Detect hints
  steamAppId?: number;
  // Matchers used by the renderer when scanning Epic/EA/Xbox/Riot launchers.
  // Substring, case-insensitive, normalized (alphanum only).
  launcherNameMatchers?: string[];
  // Templated paths probed by Electron main. Supports {HOME}, {APPDATA},
  // {LOCALAPPDATA}, {USERPROFILE}, {DOCUMENTS}.
  userPathHints?: string[];
};

export const LOADER_LABEL: Record<ModLoader, string> = {
  "spacedock-ckan": "KSP / SpaceDock",
  bepinex: "BepInEx",
  melonloader: "MelonLoader",
  "modio-native": "Mod.io native",
  "minecraft-mods": "Minecraft (Forge/Fabric)",
  smapi: "Stardew Modding API",
  "wow-addons": "WoW AddOns",
  "rimworld-mods": "RimWorld",
  tmodloader: "tModLoader",
  "sims4-mods": "Sims 4 Mods",
  "generic-zip": "Generic Zip",
};

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "");

// Per storage-key overrides. Anything not listed falls back to provider defaults.
type AdapterOverride = Partial<
  Omit<ModAdapter, "storageKey" | "provider" | "slug" | "title">
>;

const OVERRIDES: Record<string, AdapterOverride> = {
  // ---------- SpaceDock ----------
  "spacedock-ksp1": {
    signatureFiles: ["KSP_x64.exe", "KSP.exe", "KSP.x86_64", "KSP.app", "GameData"],
  },
  "spacedock-ksp2": {
    signatureFiles: ["KSP2_x64.exe", "KSP2.exe", "GameData"],
  },

  // ---------- BepInEx outliers ----------
  "thunderstore-bonelab": {
    installSubdir: "Mods/{author}-{name}",
    signatureFiles: ["BONELAB.exe", "BONELAB_Windows64.exe", "Mods"],
  },
  "thunderstore-blade-and-sorcery": {
    installSubdir: "Mods/{author}-{name}",
    signatureFiles: ["BladeAndSorcery.exe", "Mods"],
  },

  // ---------- Mod.io outliers ----------
  "modio-mordhau": { installSubdir: "Mordhau/Content/Mods/{name}" },

  // ---------- CurseForge ----------
  "curseforge-minecraft": {
    loader: "minecraft-mods",
    loaderLabel: "Minecraft (Forge/Fabric)",
    installSubdir: "mods/{name}",
    signatureFiles: ["launcher_profiles.json", "versions", "mods"],
    folderLabel: ".minecraft folder",
    userPathHints: [
      "{APPDATA}/.minecraft",
      "{HOME}/.minecraft",
      "{HOME}/Library/Application Support/minecraft",
    ],
  },
  "curseforge-sims-4": {
    loader: "sims4-mods",
    loaderLabel: "Sims 4 Mods",
    installSubdir: "Mods/{name}",
    signatureFiles: ["Mods", "SavedSims", "Tray"],
    folderLabel: "The Sims 4 user folder",
    userPathHints: [
      "{DOCUMENTS}/Electronic Arts/The Sims 4",
      "{HOME}/Documents/Electronic Arts/The Sims 4",
    ],
    launcherNameMatchers: ["sims4", "thesims4"],
  },
  "curseforge-stardew-valley": {
    loader: "smapi",
    loaderLabel: "Stardew Modding API (SMAPI)",
    installSubdir: "Mods/{name}",
    signatureFiles: [
      "Stardew Valley.exe",
      "StardewValley.exe",
      "StardewValley",
      "StardewModdingAPI.exe",
      "Mods",
    ],
  },
  "curseforge-wow": {
    loader: "wow-addons",
    loaderLabel: "World of Warcraft AddOns",
    installSubdir: "Interface/AddOns/{name}",
    signatureFiles: ["Wow.exe", "_retail_", "_classic_", "_classic_era_"],
    folderLabel: "WoW client folder (_retail_ / _classic_)",
  },
  "curseforge-rimworld": {
    loader: "rimworld-mods",
    loaderLabel: "RimWorld",
    installSubdir: "Mods/{name}",
    signatureFiles: [
      "RimWorldWin64.exe",
      "RimWorldLinux",
      "RimWorldMac.app",
      "Mods",
      "Version.txt",
    ],
  },
  "curseforge-terraria": {
    loader: "tmodloader",
    loaderLabel: "tModLoader",
    installSubdir: "tModLoader/Mods/{name}",
    signatureFiles: ["tModLoader.exe", "Terraria.exe", "tModLoader"],
  },
};

function providerDefaults(provider: ModAdapter["provider"]): AdapterOverride {
  switch (provider) {
    case "spacedock":
      return {
        loader: "spacedock-ckan",
        loaderLabel: LOADER_LABEL["spacedock-ckan"],
        installSubdir: "",
        stripHint: "GameData",
        pickerMode: "ksp",
        folderLabel: "GameData folder",
        signatureFiles: ["GameData"],
      };
    case "thunderstore":
      return {
        loader: "bepinex",
        loaderLabel: LOADER_LABEL.bepinex,
        installSubdir: "BepInEx/plugins/{author}-{name}",
        stripHint: "",
        pickerMode: "root",
        folderLabel: "Game install folder",
        signatureFiles: [],
      };
    case "modio":
      return {
        loader: "modio-native",
        loaderLabel: LOADER_LABEL["modio-native"],
        installSubdir: "Mods/{name}",
        stripHint: "",
        pickerMode: "root",
        folderLabel: "Game install folder",
        signatureFiles: [],
      };
    case "curseforge":
      return {
        loader: "generic-zip",
        loaderLabel: LOADER_LABEL["generic-zip"],
        installSubdir: "mods/{name}",
        stripHint: "",
        pickerMode: "root",
        folderLabel: "Game install folder",
        signatureFiles: [],
      };
  }
}

const REGISTRY = new Map<string, ModAdapter>();

for (const g of MOD_SUPPORTED_GAMES) {
  const storageKey = `${g.provider}-${g.slug}`;
  const defaults = providerDefaults(g.provider);
  const override = OVERRIDES[storageKey] ?? {};
  const adapter: ModAdapter = {
    storageKey,
    provider: g.provider,
    slug: g.slug,
    title: g.title,
    loader: override.loader ?? (defaults.loader as ModLoader),
    loaderLabel: override.loaderLabel ?? (defaults.loaderLabel as string),
    installSubdir: override.installSubdir ?? (defaults.installSubdir as string),
    stripHint: override.stripHint ?? defaults.stripHint ?? "",
    pickerMode: (override.pickerMode ?? defaults.pickerMode ?? "root") as "ksp" | "root",
    folderLabel: override.folderLabel ?? (defaults.folderLabel as string),
    signatureFiles: override.signatureFiles ?? (defaults.signatureFiles as string[]),
    steamAppId: override.steamAppId ?? g.steamAppId,
    launcherNameMatchers: override.launcherNameMatchers ?? [norm(g.title)],
    userPathHints: override.userPathHints,
  };
  REGISTRY.set(storageKey, adapter);
}

export function getAdapter(storageKey: string): ModAdapter | null {
  return REGISTRY.get(storageKey) ?? null;
}

export function getAdapterOrFallback(
  storageKey: string,
  provider: ModAdapter["provider"],
  slug: string,
  title: string,
): ModAdapter {
  const a = REGISTRY.get(storageKey);
  if (a) return a;
  const defaults = providerDefaults(provider);
  return {
    storageKey,
    provider,
    slug,
    title,
    loader: defaults.loader as ModLoader,
    loaderLabel: defaults.loaderLabel as string,
    installSubdir: defaults.installSubdir as string,
    stripHint: (defaults.stripHint ?? "") as "" | "GameData",
    pickerMode: (defaults.pickerMode ?? "root") as "ksp" | "root",
    folderLabel: defaults.folderLabel as string,
    signatureFiles: defaults.signatureFiles as string[],
    launcherNameMatchers: [norm(title)],
  };
}

export function expandSubdir(
  template: string | undefined,
  mod: { name: string; author: string },
): string | undefined {
  if (!template) return undefined;
  const safe = (s: string) =>
    String(s ?? "").replace(/[\\/:*?"<>|]+/g, "_").trim() || "mod";
  return template
    .replace(/\{name\}/g, safe(mod.name))
    .replace(/\{author\}/g, safe(mod.author));
}

export function normalizeLauncherName(s: string): string {
  return norm(s);
}
