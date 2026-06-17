# Minecraft Integration for RUBIX Mod Manager

A dedicated mini-launcher (Prism/CurseForge-style) inside RUBIX. Completely bypasses the generic game adapter system.

## Scope

Minecraft becomes its own route/page with: instance manager, loader installer (Fabric / Forge / NeoForge / Quilt / Vanilla), CurseForge mod browser+installer with dependency resolution, modpack `.zip` import, and an Electron-backed Java launcher.

## Architecture

```text
src/pages/MinecraftManager.tsx        ← mini-launcher UI (replaces Minecraft card in KspMods)
src/components/minecraft/
  CreateInstanceWizard.tsx            ← 4-step wizard
  ImportInstanceDialog.tsx
  ImportModpackDialog.tsx
  InstanceCard.tsx, InstanceList.tsx
  InstanceDetail.tsx                  ← tabs: Mods / Resource Packs / Worlds / Screenshots / Settings
  MinecraftModBrowser.tsx             ← CurseForge browse + 1-click install
  InstalledModsList.tsx               ← enable/disable/uninstall/update
src/lib/minecraft/
  versions.ts        ← Mojang version manifest fetcher
  loaders.ts         ← Fabric/Forge/NeoForge/Quilt metadata APIs
  curseforge-mc.ts   ← CF Minecraft search + file resolution + dep graph
  instances.ts       ← client-side instance registry (via Electron IPC)
  modpack.ts         ← CF modpack manifest.json parser
electron/minecraft.cjs   ← required; loaded by electron/main.cjs
electron/main.cjs        ← wire new IPC channels
electron/preload.cjs     ← expose window.rubix.minecraft.*
src/types/electron.d.ts  ← types for new bridge
supabase/functions/mods-api/index.ts  ← add minecraft-specific CF endpoints
```

## First-time setup (no instances exist)

Empty state with two CTAs: **Create Instance** and **Import Existing Instance**.

### Create Instance wizard

1. **Minecraft version** — searchable list from `https://piston-meta.mojang.com/mc/game/version_manifest_v2.json` (releases first, snapshots toggle).
2. **Loader** — Fabric / Forge / NeoForge / Quilt / Vanilla. Loader versions fetched live, latest stable preselected:
   - Fabric: `https://meta.fabricmc.net/v2/versions/loader/{mc}`
   - Forge: `https://files.minecraftforge.net/net/minecraftforge/forge/promotions_slim.json`
   - NeoForge: `https://maven.neoforged.net/api/maven/versions/releases/net/neoforged/neoforge`
   - Quilt: `https://meta.quiltmc.org/v3/versions/loader/{mc}`
3. **Instance name** — defaulted to `{Loader} {mc}`, validated unique.
4. **Create** — Electron does the heavy lifting (see below).

### Electron `minecraft:create-instance`

- Verify Java: probe `java -version`; if missing, show download guidance (Adoptium link) and abort.
- Resolve version JSON from Mojang, download client jar, libraries, asset index → `~/.rubix/minecraft/shared/` (shared cache across instances).
- Install loader by invoking its installer jar headlessly (Fabric/Quilt have JSON profiles; Forge/NeoForge run their installer with `--installClient`).
- Create folder `~/.rubix/minecraft/instances/{name}/` with `mods/ config/ resourcepacks/ saves/ screenshots/`.
- Write `instance.json` with `{ name, mcVersion, loader, loaderVersion, createdAt, lastPlayed, javaPath }`.
- Register in `~/.rubix/minecraft/instances.json` registry.

## Instance management

`InstanceList` shows cards with name, MC version, loader badge, installed mod count, on-disk size, last played, **Launch** button, and a `⋯` menu: Duplicate / Rename / Delete / Export / Open Folder.

- **Duplicate**: copy folder + new entry.
- **Rename**: rename folder + update registry.
- **Delete**: confirm dialog → recursive rm.
- **Export**: zip instance dir → save dialog.
- **Import**: zip → unzip into instances + register.

Remember last-used instance in `localStorage` key `rubix:mc:last-instance`.

## Mod installation (CurseForge)

CF Minecraft = `gameId=432`. Browser tab uses existing `mods-api` `curseforge` provider, plus two new endpoints:

- `curseforge-mc-files?modId=&mcVersion=&loader=` → CF `/mods/{id}/files` filtered by `gameVersions` containing both the MC version and loader name (Fabric/Forge/NeoForge/Quilt).
- `curseforge-mc-resolve` → walks `dependencies[]` (relationType 3 = required) recursively, returns ordered install list.

Install flow per mod:
1. Resolve best file for current instance (mcVersion + loader).
2. If none → toast `"{Mod} requires {loader} {mcVersion}"` and abort (no install).
3. Recursively collect required deps, dedup against already-installed.
4. Sequentially download each `downloadUrl` to `instances/{name}/mods/{filename}`.
5. Append to instance `installed-mods.json` with `{ projectId, fileId, filename, name, version, dependencies }`.

### Installed mods list (per instance)

- Enable/Disable → rename `.jar` ↔ `.jar.disabled`.
- Uninstall → delete file + registry entry; warn if other mods depend on it.
- **Update All** → for each mod, query CF latest file matching instance; show update count badge; bulk apply.

## Modpack import

`Import CurseForge Modpack (.zip)`:
1. Unzip, read `manifest.json` (`minecraft.version`, `minecraft.modLoaders[].id` like `fabric-0.15.11`, `files[]` with `projectID`+`fileID`+`required`).
2. Create instance with those MC+loader values.
3. For each file, fetch CF download URL via `/mods/{projectID}/files/{fileID}` and download to `mods/`.
4. Copy `overrides/` into instance root.
5. Register instance, open detail view.

## Launching

Launch button → Electron `minecraft:launch`:
- Build classpath from version JSON libraries + loader libraries + client jar.
- Resolve main class from loader profile (e.g. `net.fabricmc.loader.impl.launch.knot.KnotClient`).
- Spawn `java -Xmx{ram}M -cp ... {mainClass} --username Player --version {name} --gameDir {instanceDir} --assetsDir ... --accessToken 0`.
- Stream stdout/stderr to a log panel (offline mode only — no Mojang auth in v1).
- Update `lastPlayed` on exit.

Settings tab per instance: RAM slider (default 2048 MB), custom Java path, JVM args, version/loader info (read-only).

## Web-mode fallback

Outside Electron the page renders an empty state: "Open RUBIX desktop to manage Minecraft instances." All bridge calls are guarded by `window.rubix?.isElectron`.

## Out of scope (v1)

- Mojang/Microsoft authentication (offline launch only; documented in Settings).
- Modrinth (CF only this pass; clean seam for later).
- Shader pack manager (resource packs only).
- Server-side launching.

## Files touched

**Create**: `src/pages/MinecraftManager.tsx`, 8 components under `src/components/minecraft/`, 5 libs under `src/lib/minecraft/`, `electron/minecraft.cjs`.

**Edit**: `electron/main.cjs` (require + register IPC), `electron/preload.cjs` (expose `rubix.minecraft`), `src/types/electron.d.ts`, `src/App.tsx` (route `/mods/minecraft`), `src/pages/KspMods.tsx` (Minecraft card → navigates to dedicated page instead of generic wizard), `supabase/functions/mods-api/index.ts` (mc-specific CF endpoints).

Approve to build.
