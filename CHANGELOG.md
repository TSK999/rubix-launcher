# Changelog

All notable changes to RUBIX Launcher are documented in this file.
The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/)
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.8.5] - 2026-07-05

### Added
- Full support for Minecraft Resource Packs and Shader Packs via the Modrinth API, with installs directed to `resourcepacks/` and `shaderpacks/` respectively and never mixed with mods.
- Instance detail "Luminous Glass" redesign — hero gradient header, glowing Launch CTA, frosted-glass action toolbar, and premium pill-style tab strip.
- Advanced search filters across Mod, Resource Pack, and Shader browsers: sort by relevance, downloads, follows, newest, or updated.
- Category filters for packs — resolution tags (16x, 32x, realistic, etc.) for resource packs and feature tags (shadows, path-tracing, potato, etc.) for shaders.
- "Hide installed" toggle on every browser to suppress already-owned content from results.
- Web preview now ships with demo Minecraft instances so the Minecraft Manager UI is fully reviewable without the desktop app.

### Changed
- Mod browser search UI upgraded with a tall glassmorphic search field, inline filter chips, and uppercase eyebrow badges.
- Pack browsers enforce Mojang's standard directory layout for full compatibility with vanilla, Prism Launcher, MultiMC, CurseForge, and Modrinth App.

## [1.8.2] - 2026-07-04

### Fixed
- Fabric API failing to resolve for Minecraft 1.21.9 and other edge versions — `mods-api` now uses server-side CurseForge filtering with paginated fetching (up to 200 files) so every compatible build is considered, not just the latest 50.
- Fabric API missing from installs when no CurseForge build exists for the target version — added a Modrinth fallback for Fabric API and Quilted Fabric API, pulling from `api.modrinth.com` as a secondary source.
- Manual Fabric API dependency resolution no longer required — the installer automatically queues Fabric API (or Quilted Fabric API for Quilt) as a required dependency for every Fabric / Quilt instance.

## [1.8.1] - 2026-07-04

### Changed
- CurseForge integration now behaves as a deterministic package manager:
  the API is the single source of truth for mod metadata, version
  compatibility, and dependency resolution.
- `mods-api` edge function resolves the full dependency graph recursively
  before any install begins, validating Minecraft version and mod-loader
  matches on every file.
- Required dependencies are auto-queued in the correct order; optional
  dependencies are shown as opt-in checkboxes in the plan dialog.
- Incompatible mods already installed are flagged before install proceeds.
- Install is blocked if no compatible file exists, a required dependency is
  missing, or the author disabled third-party downloads.

## [1.8.0] - 2026-07-04

### Added
- Minecraft instances now have their own dedicated entry in the sidebar,
  directly below the Launcher — no more digging through Mod Manager.
- Per-instance card customization via a new "Customize" dialog with three
  tabs:
  - **Name** — set a custom display label for each instance (the underlying
    folder name stays untouched).
  - **Background** — attach a custom image or GIF as the card cover, either
    from a URL or a local upload (up to 4 MB).
  - **Gradient** — pick your own two-color gradient wash to replace the
    loader-tinted default.
- All customizations persist locally per instance and are reflected on the
  Minecraft manager cards immediately.
- Minecraft manager is now browsable in the web preview using demo instances,
  so the UI can be reviewed without building a new desktop installer.

### Security
- `mods-api` edge function now requires an authenticated caller for the
  paid providers (CurseForge, mod.io) to prevent quota drain / cost abuse.
  Client requests attach the current session token automatically.
- `user_presence` visibility is restricted to the owner and friends only;
  community-membership bypass has been removed.
- `conversation_members` self-join loophole closed — only the conversation
  creator or an existing admin can add members, and non-admins can no longer
  promote themselves via update.
- Shared clips are now served through short-lived signed URLs gated by the
  clip's visibility, instead of relying on public bucket reads.

### Fixed
- `mods-api` returning 500 (`getClaims is not a function`) on CurseForge /
  mod.io browse — switched the auth check to `getUser(token)` which is
  available in the pinned `@supabase/supabase-js` build.

## [1.7.4] - 2026-07-03

### Fixed
- Minecraft failing to launch with `NumberFormatException: For input string: ""`
  on Forge (and empty `--width`/`--demo`/`--quickPlay*` args on Fabric) — the
  version-JSON rule evaluator now rejects any rule gated by `features`
  (`is_demo_user`, `has_custom_resolution`, `has_quick_plays_*`), so those args
  are no longer emitted with empty values.
- Fabric refusing to start with `duplicate ASM classes found on classpath`
  (e.g. `asm-9.10.1` alongside vanilla's `asm-9.6`) — merged libraries are now
  deduplicated by Maven `group:artifact`, keeping the loader's version.
- Launch exit `-1` was opaque — the launcher now captures spawn errors, keeps
  a rolling stderr tail, and surfaces the real reason in the progress UI and
  in `latest.log`.

## [1.7.3] - 2026-07-03

### Fixed
- Forge / NeoForge installer failing with "you need to run the launcher first!"
  — writes a stub `launcher_profiles.json` before the headless install so the
  official installer proceeds.
- Fabric installer 404 — pinned the installer to the stable Maven release
  (`1.0.1` for Fabric, `0.9.2` for Quilt) instead of using the loader version.
- Installer download now verifies the URL with a HEAD request first, so a 404
  surfaces a clear user-friendly error instead of a raw HTTP failure.

## [1.7.2] - 2026-07-03

### Fixed
- Adoptium JRE download failing with SHA1 mismatch — the API returns SHA-256
  checksums, so verify the archive with SHA-256 instead of SHA-1.
- `mods-api` and `ksp-mods` edge functions still returning 401 for anonymous
  requests after v1.7.1 — removed the leftover in-code Bearer token checks so
  `verify_jwt = false` in config.toml actually takes effect.

## [1.7.1] - 2026-07-03

### Fixed
- Microsoft device-code sign-in failing with `AADSTS700016` — swapped the legacy
  Xbox client ID for PrismLauncher's registered Azure app so the `/consumers`
  device-code endpoint accepts the request again.
- `mods-api` and `ksp-mods` edge functions returning 401 — added the missing
  `apikey` header to all Supabase function calls and disabled JWT verification
  on these public browse proxies.

## [1.7.0] - 2026-07-03

**RUBIX is now a full headless Minecraft launcher — no more "open the official Launcher" shim.**

### Added
- Microsoft device-code sign-in (MSAL → Xbox Live → XSTS → Minecraft services).
  No API keys needed — uses the public Xbox community client ID.
- Persistent, OS-keychain-encrypted session with auto-refresh on expiry.
- Native Mojang asset pipeline: downloads `client.jar`, libraries (with OS/arch
  rule filtering), asset indexes, and every game asset — parallel pool (8 workers),
  SHA1-verified, fully resumable.
- Automatic Java runtime provisioning: detects system Java; if missing or wrong
  version, downloads the correct Adoptium Temurin JRE (8, 17, 21+) and caches it.
- Headless loader install for Fabric, Quilt, NeoForge and Forge — runs the
  official installer in the background, merges the resulting version JSON into
  vanilla, and caches the merged manifest.
- Native game launch: builds classpath, expands Mojang argument templates,
  spawns `java` detached with auth + instance game directory, and pipes logs to
  `<instance>/logs/latest.log`.
- Real-time launch progress UI (`mc:progress` IPC) showing current phase,
  counts and throughput.
- Minecraft account badge in the instance header with sign-in / sign-out and
  active gamertag display.
- Piracy check: clean error if the Microsoft account does not own Minecraft.

### Changed
- Replaced external-launcher-spawn flow with fully native launch pipeline.
- Cache structure moved under `<userData>/rubix/mc/` — versions, libraries,
  assets and runtimes are shared across all instances.

### Fixed
- "Not allowed to load local resource" error when attempting Minecraft launch
  without the external launcher present.

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
