# Changelog

All notable changes to RUBIX Launcher are documented in this file.
The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/)
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.6.0] - 2026-06-28

**The Mod Manager is now fully operational across every supported game.**

### Added
- 8 install strategies: `DIRECT_COPY` (KSP), `PROFILE_ISOLATED` (Minecraft),
  `BEPINEX_MAP`, `MELONLOADER_DLL`, `SMAPI_DEPLOY`, `TMODLOADER_DEPLOY`,
  `ADDON_COPY` (WoW), `MODIO_SUBSCRIBE`.
- Unified Setup Wizard with auto-detect across Steam, Epic, EA, Xbox /
  PC Game Pass and Riot, plus manual Browse with signature-file validation.
- Automatic loader bootstrap (BepInEx, MelonLoader, SMAPI, …) with a live
  status banner in the wizard.
- 5-layer dependency resolver with topological sort, semver checks and
  circular-dependency detection — runs before every install.
- Modpack system: create, share via 8-character codes, redeem, public /
  private toggle, per-game listing.
- Minecraft mini-launcher with instance isolation, CurseForge browser and
  vanilla / modded launch toggle.
- Per-game adapter registry covering install paths, signature files and
  loader rules.

### Changed
- Mod Manager game picker now has a search bar.
- Sort by Most Popular / Most Downloads / Recently Updated / Name across
  SpaceDock, Thunderstore, Mod.io and CurseForge.
- Sidebar reorganized — new **Social** group (Messaging, Clips, Passport).
- "Configured" badges and editable game settings everywhere a path is used.

### Fixed
- Deep-link 404s in the desktop app (HashRouter under Electron).
- Preload bridge path on packaged builds.
- TypeScript bridge mismatches across strategies and the setup wizard.

### Security
- 9 findings closed: edge-function auth, tightened RLS on `profiles` /
  `orders`, HMAC-signed Spotify OAuth state.

## [1.5.2] - 2026-06

### Fixed
- Desktop app loading the web bundle instead of the Electron bundle.
- Mod Manager regression check after preload changes.

## [1.5.1] - 2026-06

### Fixed
- Desktop app 404 on deep paths — switched to `HashRouter` under Electron.

## [1.5.0] - 2026-06

### Added
- CurseForge third-party provider in `mods-api` (Minecraft, The Sims 4, …).
- First-run game setup wizard with auto-detect / browse-folder.
- Game adapter registry (loader type, install paths, signature files).
- Mod detection from the desktop app, mirrored to `installed_mods`.
- Modpack creation, share codes, redeem flow and Most Popular / Most
  Downloads sorting.
- Mods tab on every supported game with Vanilla / Modded launch toggle.

### Changed
- Sidebar: Mod Manager moved above Rubix Messaging; Social group introduced.

## Earlier

Earlier releases focused on the launcher core — Steam / Epic / EA / Xbox /
Riot integration, RUBIX accounts and profiles, messaging, Spotify, clips,
and controller-friendly UI.
