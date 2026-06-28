# Finish the Mod Strategies — Phase 3 completion + Phase 4

Right now `installMod()` dispatches to 8 strategies, but only `DIRECT_COPY` (KSP) and `PROFILE_ISOLATED` (Minecraft) are real. The other 6 return `not implemented`, and the Setup Wizard is still KSP-shaped. This plan ships them all behind the existing dispatcher — no UI changes required at call sites.

## Scope

### 1. Strategy implementations (`src/lib/mods/strategies/`)

Each strategy implements `setup / verifyLoader / install / uninstall / validate` against the existing `window.rubix` Electron bridge. Renderer code stays untouched.

- **bepinex.ts** — `BEPINEX_RUNTIME` (Lethal Company, Valheim, RoR2, DRG)
  - `setup`: download correct BepInEx pack (x64 vs IL2CPP) from Thunderstore, extract to game root, first-launch to generate config.
  - `install`: route `BepInExPack` archives → game root; everything else → `BepInEx/plugins/{author}-{name}/`.
  - `verifyLoader`: check `winhttp.dll` + `BepInEx/core/BepInEx.dll`, read version from `BepInEx.cfg`.
- **melonloader.ts** — `MELONLOADER_RUNTIME` (BONELAB, Blade & Sorcery)
  - `setup`: run MelonLoader installer (bundled) or extract release zip.
  - `install`: `.dll` → `Mods/`, `UserLibs/` passthrough, ignore source archives.
- **smapi.ts** — Stardew Valley
  - `setup`: run SMAPI installer (`install on Windows.bat`) headlessly, patch Steam launch options.
  - `install`: each mod = its own folder under `Mods/{ModName}/` with `manifest.json` preserved.
- **tmodloader.ts** — Terraria
  - `setup`: ensure tModLoader installed via Steam (1.4) — detect, prompt if missing.
  - `install`: `.tmod` files → `%UserProfile%/Documents/My Games/Terraria/tModLoader/Mods/`.
- **addon-folder.ts** — WoW
  - `setup`: validate `Interface/AddOns/` exists for chosen flavor (Retail/Classic/WotLK).
  - `install`: extract addon zip directly into `Interface/AddOns/`, each top-level folder = one addon.
- **modio.ts** — Ready or Not, Space Engineers, SnowRunner
  - `setup`: OAuth/email-code link to user's mod.io account, store token in Electron safeStorage.
  - `install`: call mod.io subscribe API; game's native sync handles the download. No file I/O.
  - `uninstall`: unsubscribe.

Each gets a matching IPC handler in `electron/main.cjs` (new file `electron/strategies/{name}.cjs` per strategy to keep `main.cjs` thin) and a typed bridge in `electron/preload.cjs` + `src/types/electron.d.ts`.

### 2. Generic Setup Wizard (Phase 4)

Replace `src/components/mods/GameSetupWizard.tsx` with a profile-driven wizard that reads `game.modSystemType` and renders steps from a per-strategy config:

```ts
interface SetupStepConfig {
  id: 'pick-path' | 'install-loader' | 'verify-loader' | 'link-account' | 'pick-flavor';
  title: string;
  optional?: boolean;
}
```

Strategy exposes `getSetupSteps(): SetupStepConfig[]`. Wizard renders steps in order, calling `strategy.setup()` / `strategy.verifyLoader()` between them. WoW gets the flavor picker; Mod.io games get the account link step; everything else gets path + loader.

The current KSP wizard becomes the `DIRECT_COPY` case (path-pick only). Minecraft keeps its dedicated instance wizard — it's not a setup wizard, it's per-instance.

### 3. Registry + dispatcher updates

- `strategies/index.ts`: replace 6 `notImplemented` entries with the new modules.
- `profiles.ts`: already covers all 6 system types; no changes needed.
- Mark each strategy with a `capabilities` flag (`requiresAccount`, `requiresLoaderInstall`, `requiresGameVersion`) consumed by the wizard.

### 4. Tests

Extend `src/test/mods.strategies.test.ts`:
- Each strategy's `install()` is called with the right archive layout (mocked bridge).
- Wizard step generation per `ModSystemType`.
- Guardrails still block when loader is missing (verified per strategy).

Target: 30+ tests passing.

### 5. Out of scope

- New UI surfaces beyond the wizard (KspMods page and Minecraft browser already route through `installMod`).
- Nexus auth — Nexus stays "manual download" until they grant API access.
- Version bump — happens at the end as v1.6.0 once Phase 4 lands and QA passes.

## Deliverable order

1. `bepinex` + `melonloader` (highest demand, ~10 games covered).
2. `smapi` + `tmodloader` (single-game each, but big communities).
3. `addon-folder` (WoW) + `modio` (3 games, account-linked).
4. Generic Setup Wizard refactor.
5. Tests + v1.6.0 cut.

Each step is independently shippable — if anything blocks (e.g. mod.io OAuth setup), the rest still lands.
