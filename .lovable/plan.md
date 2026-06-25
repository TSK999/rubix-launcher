# RUBIX Mod Manager — Architecture Refactor Plan

Adopt the spec as the single source of truth for all mod installs. Rollout is staged so the app keeps working at every step.

## Phase 1 — Core types & registry (no behavior change)

Create `src/lib/mods/` with the type system from the spec:

- `types.ts` — `ModSystemType`, `LoaderType`, `SetupState`, `InstallStrategy`, `GameDefinition`, `ModPackage`, `ModFile`, `Dependency`.
- `profiles.ts` — `MOD_PROFILES`: static map from known game id / signature → `ModSystemType` + default `LoaderType` + default install paths. Seeded with: KSP1/2 (FOLDER_INJECTION), Lethal Company / Valheim / RoR2 / DRG (BEPINEX), BONELAB / Blade & Sorcery (MELONLOADER), Minecraft (PROFILE_BASED), Stardew (SMAPI), Terraria (TMODLOADER), WoW (ADDON_FOLDER), Ready or Not / Space Engineers / SnowRunner (MODIO).
- `classify.ts` — `classifyGame(game)` implementing the Section 4 decision tree, falling back to FOLDER_INJECTION.

## Phase 2 — Install state machine

`src/lib/mods/state-machine.ts`:

```text
START → DETECT_GAME → VALIDATE_INSTALL_PATH → IDENTIFY_MOD_SYSTEM
  → (setupState !== READY ? SETUP_WIZARD) → VERIFY_LOADER
  → INSTALL_MOD → VALIDATE_INSTALLATION → REGISTER_MANIFEST → END
```

- Pure reducer: `(state, event) → nextState`.
- Each transition returns `{ next, sideEffect }`; side effects executed by a thin runner so the FSM stays testable.
- Guardrails (Section 7) live as predicates the runner calls before `INSTALL_MOD`.

## Phase 3 — Strategy adapters

`src/lib/mods/strategies/` — one file per `InstallStrategy`, each exporting:

```ts
{ setup(game), verifyLoader(game), install(game, pkg), uninstall(game, modId), validate(game) }
```

Files: `direct-copy.ts`, `bepinex.ts`, `melonloader.ts`, `profile-isolated.ts` (Minecraft), `smapi.ts`, `tmodloader.ts`, `addon-folder.ts`, `modio.ts`.

Existing logic gets moved, not rewritten:
- KSP code → `direct-copy.ts`
- `electron/minecraft.cjs` + `src/lib/minecraft/*` → wrapped by `profile-isolated.ts`
- New stubs for the rest return `NotImplemented` with a clear toast, so UI never silently no-ops.

## Phase 4 — Setup Wizard (generic)

Replace `GameSetupWizard.tsx` with a profile-driven wizard that reads the game's `ModSystemType` and renders the needed steps (path pick → loader install → verify). Per-game wizards become thin configs, not bespoke components.

## Phase 5 — Guardrails & manifest

- `installed_mods` table already exists; add a per-install manifest record `{ gameId, modId, strategy, files[], loaderVersion, profileId? }` for clean uninstall/rollback.
- Pre-install checks: loader compatibility, game version, dependency resolution, profile correctness. Failures block install with a typed error.

## Phase 6 — Wire UI

`ModpackManager`, `GameModsTab`, `MinecraftManager`, `MinecraftModBrowser` all route through one `installMod(game, pkg)` entrypoint. No component talks to a strategy directly.

## Technical notes

- All electron-side strategy work stays in `electron/` modules exposed through the existing `rubix` preload bridge; renderer only sees the strategy interface.
- New profiles = add an entry in `profiles.ts` + (if needed) one strategy file. No UI changes required.
- Version bump to **v1.6.0** when Phase 1–3 land (breaking internal API for mod install).

## Out of scope for this plan

- Implementing every strategy end-to-end. Phase 3 lands the interface + KSP + Minecraft working; others ship behind a "coming soon" state with proper UX, not a crash.
- Fixing the current Minecraft page crash — that is tracked separately and unblocks before Phase 4.

## Deliverable order

1. Phase 1 + 2 in one PR (pure types + FSM + unit tests).
2. Phase 3 KSP + Minecraft adapters, others stubbed.
3. Phase 4 wizard refactor.
4. Phase 5 manifest + guardrails.
5. Phase 6 UI rewire + v1.6.0 cut.
