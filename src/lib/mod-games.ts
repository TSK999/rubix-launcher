// Lightweight registry mapping launcher games to mod-manager supported slugs.
// Used by GameDetail's "Mods" tab to know whether the current game has mods
// available and what slug/provider key to use when talking to mods-api.

export type ModGameProvider = "spacedock" | "thunderstore" | "modio" | "curseforge";

export type ModGameEntry = {
  slug: string;          // matches SUPPORTED_GAMES[i].apiGameKey in KspMods.tsx
  title: string;
  provider: ModGameProvider;
  providerLabel: string;
  steamAppId?: number;
};

export const MOD_SUPPORTED_GAMES: ModGameEntry[] = [
  // SpaceDock
  { slug: "ksp1", title: "Kerbal Space Program", provider: "spacedock", providerLabel: "SpaceDock", steamAppId: 220200 },
  { slug: "ksp2", title: "Kerbal Space Program 2", provider: "spacedock", providerLabel: "SpaceDock", steamAppId: 954850 },
  // Thunderstore
  { slug: "lethal-company", title: "Lethal Company", provider: "thunderstore", providerLabel: "Thunderstore", steamAppId: 1966720 },
  { slug: "valheim", title: "Valheim", provider: "thunderstore", providerLabel: "Thunderstore", steamAppId: 892970 },
  { slug: "risk-of-rain-2", title: "Risk of Rain 2", provider: "thunderstore", providerLabel: "Thunderstore", steamAppId: 632360 },
  { slug: "content-warning", title: "Content Warning", provider: "thunderstore", providerLabel: "Thunderstore", steamAppId: 2881650 },
  { slug: "bonelab", title: "BONELAB", provider: "thunderstore", providerLabel: "Thunderstore", steamAppId: 1592190 },
  { slug: "repo", title: "R.E.P.O.", provider: "thunderstore", providerLabel: "Thunderstore", steamAppId: 3241660 },
  { slug: "peak", title: "PEAK", provider: "thunderstore", providerLabel: "Thunderstore", steamAppId: 3527290 },
  { slug: "palworld", title: "Palworld", provider: "thunderstore", providerLabel: "Thunderstore", steamAppId: 1623730 },
  { slug: "gtfo", title: "GTFO", provider: "thunderstore", providerLabel: "Thunderstore", steamAppId: 493520 },
  { slug: "deep-rock-galactic", title: "Deep Rock Galactic", provider: "thunderstore", providerLabel: "Thunderstore", steamAppId: 548430 },
  { slug: "subnautica", title: "Subnautica", provider: "thunderstore", providerLabel: "Thunderstore", steamAppId: 264710 },
  { slug: "subnautica-below-zero", title: "Subnautica: Below Zero", provider: "thunderstore", providerLabel: "Thunderstore", steamAppId: 848450 },
  { slug: "h3vr", title: "H3VR", provider: "thunderstore", providerLabel: "Thunderstore", steamAppId: 450540 },
  { slug: "blade-and-sorcery", title: "Blade & Sorcery", provider: "thunderstore", providerLabel: "Thunderstore", steamAppId: 629730 },
  { slug: "outward", title: "Outward", provider: "thunderstore", providerLabel: "Thunderstore", steamAppId: 794260 },
  { slug: "project-zomboid", title: "Project Zomboid", provider: "thunderstore", providerLabel: "Thunderstore", steamAppId: 108600 },
  { slug: "sons-of-the-forest", title: "Sons of the Forest", provider: "thunderstore", providerLabel: "Thunderstore", steamAppId: 1326470 },
  { slug: "hard-bullet", title: "Hard Bullet", provider: "thunderstore", providerLabel: "Thunderstore", steamAppId: 1294760 },
  { slug: "terratech", title: "TerraTech", provider: "thunderstore", providerLabel: "Thunderstore", steamAppId: 285920 },
  { slug: "timberborn", title: "Timberborn", provider: "thunderstore", providerLabel: "Thunderstore", steamAppId: 1062090 },
  { slug: "dyson-sphere-program", title: "Dyson Sphere Program", provider: "thunderstore", providerLabel: "Thunderstore", steamAppId: 1366540 },
  { slug: "v-rising", title: "V Rising", provider: "thunderstore", providerLabel: "Thunderstore", steamAppId: 1604030 },
  { slug: "ravenfield", title: "Ravenfield", provider: "thunderstore", providerLabel: "Thunderstore", steamAppId: 636480 },
  { slug: "totally-accurate-battle-simulator", title: "TABS", provider: "thunderstore", providerLabel: "Thunderstore", steamAppId: 508440 },
  { slug: "ultrakill", title: "ULTRAKILL", provider: "thunderstore", providerLabel: "Thunderstore", steamAppId: 1229490 },
  { slug: "muck", title: "Muck", provider: "thunderstore", providerLabel: "Thunderstore", steamAppId: 1625450 },
  { slug: "rounds", title: "ROUNDS", provider: "thunderstore", providerLabel: "Thunderstore", steamAppId: 1557740 },
  { slug: "noita", title: "Noita", provider: "thunderstore", providerLabel: "Thunderstore", steamAppId: 881100 },
  { slug: "webfishing", title: "WEBFISHING", provider: "thunderstore", providerLabel: "Thunderstore", steamAppId: 1608690 },
  { slug: "brotato", title: "Brotato", provider: "thunderstore", providerLabel: "Thunderstore", steamAppId: 1629450 },
  { slug: "dredge", title: "Dredge", provider: "thunderstore", providerLabel: "Thunderstore", steamAppId: 1562430 },
  // Mod.io
  { slug: "mordhau", title: "MORDHAU", provider: "modio", providerLabel: "Mod.io", steamAppId: 629760 },
  { slug: "skaterxl", title: "Skater XL", provider: "modio", providerLabel: "Mod.io", steamAppId: 962730 },
  { slug: "snowrunner", title: "SnowRunner", provider: "modio", providerLabel: "Mod.io", steamAppId: 1465360 },
  { slug: "riftbreaker", title: "The Riftbreaker", provider: "modio", providerLabel: "Mod.io", steamAppId: 780310 },
  { slug: "stalker2", title: "S.T.A.L.K.E.R. 2", provider: "modio", providerLabel: "Mod.io", steamAppId: 1643320 },
  { slug: "spaceengineers", title: "Space Engineers", provider: "modio", providerLabel: "Mod.io", steamAppId: 244850 },
  { slug: "readyornot", title: "Ready or Not", provider: "modio", providerLabel: "Mod.io", steamAppId: 1144200 },
  { slug: "anno-1800", title: "Anno 1800", provider: "modio", providerLabel: "Mod.io", steamAppId: 916440 },
  { slug: "dying-light-2", title: "Dying Light 2", provider: "modio", providerLabel: "Mod.io", steamAppId: 534380 },
  { slug: "pavlov", title: "Pavlov VR", provider: "modio", providerLabel: "Mod.io", steamAppId: 555160 },
  { slug: "contractors", title: "Contractors VR", provider: "modio", providerLabel: "Mod.io", steamAppId: 963930 },
  { slug: "hf2", title: "House Flipper 2", provider: "modio", providerLabel: "Mod.io", steamAppId: 1190970 },
  // CurseForge
  { slug: "minecraft", title: "Minecraft", provider: "curseforge", providerLabel: "CurseForge" },
  { slug: "sims-4", title: "The Sims 4", provider: "curseforge", providerLabel: "CurseForge", steamAppId: 1222670 },
  { slug: "stardew-valley", title: "Stardew Valley", provider: "curseforge", providerLabel: "CurseForge", steamAppId: 413150 },
  { slug: "wow", title: "World of Warcraft", provider: "curseforge", providerLabel: "CurseForge" },
  { slug: "rimworld", title: "RimWorld", provider: "curseforge", providerLabel: "CurseForge", steamAppId: 294100 },
  { slug: "terraria", title: "Terraria", provider: "curseforge", providerLabel: "CurseForge", steamAppId: 105600 },
];

const normalize = (s: string) =>
  s.toLowerCase().replace(/[^a-z0-9]+/g, "");

export function findModGameForLauncherGame(g: {
  title: string;
  steamAppId?: number;
}): ModGameEntry | null {
  if (g.steamAppId) {
    const bySteam = MOD_SUPPORTED_GAMES.find((m) => m.steamAppId === g.steamAppId);
    if (bySteam) return bySteam;
  }
  const t = normalize(g.title);
  if (!t) return null;
  return (
    MOD_SUPPORTED_GAMES.find((m) => normalize(m.title) === t) ??
    MOD_SUPPORTED_GAMES.find((m) => normalize(m.slug) === t) ??
    null
  );
}

// Storage key used by the Electron mod-installer IPC; matches the format
// produced by KspMods.tsx (`${provider}-${apiGameKey}`).
export function modGameStorageKey(m: ModGameEntry): string {
  return `${m.provider}-${m.slug}`;
}
