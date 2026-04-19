
## Goal
Add **Epic Games Store** support to RUBIX so users can browse, import, and launch their Epic library alongside Steam.

## What "Epic support" actually means

Epic doesn't have a public Web API like Steam (no `GetOwnedGames` endpoint, no API key program). So integration works very differently. There are **three realistic paths** — each with different tradeoffs:

### Path A — Local manifest scan (Electron only) ⭐ recommended
Epic Games Launcher writes a JSON manifest file for every installed game to:
```text
C:\ProgramData\Epic\EpicGamesLauncher\Data\Manifests\*.item
```
Each `.item` file contains the game name, install path, launch executable, app id, and image URL. We read the folder from Electron's main process and import everything in one click.

- **Pros**: Zero auth, instant, works offline, gives us launchable `.exe` paths.
- **Cons**: Only **installed** games (not full owned library), Electron-only.
- **Launch**: Use `com.epicgames.launcher://apps/<AppName>?action=launch&silent=true` — opens directly through Epic, tracks playtime properly.

### Path B — Legendary CLI bridge
[Legendary](https://github.com/derrod/legendary) is an open-source Epic launcher CLI that can list the **full owned library** (not just installed) via Epic's internal auth. We'd shell out to it from Electron.

- **Pros**: Full library, proper auth flow.
- **Cons**: User has to install Legendary separately, extra setup friction, fragile.

### Path C — Manual + storefront browse
No auto-import. User pastes Epic Store URLs or searches a public catalog (RAWG already covers Epic games), then we save the launch URI.

- **Pros**: Works in web mode too, no extra deps.
- **Cons**: Tedious for big libraries.

## My recommendation: **Path A + Path C combo**
- **Path A** as the headline "Import from Epic" feature (mirrors the Steam import flow we already have).
- **Path C** as a fallback: an "Add Epic game manually" shortcut in QuickFind that prefills the launch URI format.

Skip Legendary for v1 — too much setup pain. Can add later if users ask.

## What I'll build

### 1. Electron side (`electron/main.cjs` + `preload.cjs`)
- New IPC handler `epic:scan-installed` that:
  - Reads `C:\ProgramData\Epic\EpicGamesLauncher\Data\Manifests\` (and macOS equivalent if applicable)
  - Parses every `.item` JSON file
  - Returns `{ appName, displayName, installLocation, launchExecutable, catalogNamespace, catalogItemId, image }[]`
- New IPC handler `epic:launch` that opens `com.epicgames.launcher://apps/<namespace>%3A<itemId>%3A<appName>?action=launch&silent=true` via `shell.openExternal`
- Expose both on `window.rubix.epic.*` in preload
- Update `src/types/electron.d.ts`

### 2. Frontend
- **`EpicImportDialog.tsx`** — mirrors `SteamImportDialog`: scan button → list of detected games with checkboxes → Import. Shows install path & size.
- **Cover lookup**: Epic manifests sometimes lack good art. Fall back to RAWG search by `displayName` (we already have `searchRawg`) when no image.
- **`Game` type** (`src/lib/game-types.ts`): add `epicAppName?: string`, `epicLaunchUri?: string` fields alongside the existing `steamAppId`.
- **Header button**: Add an "Epic" button next to the existing "Steam" button in `src/pages/Index.tsx`. Hidden when not in Electron (with a tooltip explaining).
- **Launch logic** (`src/pages/Index.tsx` → `launchGame`): if `g.epicLaunchUri` is set, call `window.rubix.epic.launch()` instead of the generic launcher.
- **Sidebar filter**: Add a "Stores" section in the sidebar showing Steam / Epic / Other counts so users can filter by source.

### 3. Web mode fallback
When `window.rubix?.isElectron === false`:
- Disable the "Epic" import button with a tooltip: *"Epic library scan requires the desktop app"*
- Keep the manual "Add game" flow available — users can paste an `com.epicgames.launcher://` URI as the launch path

## Files to touch
- `electron/main.cjs` — add IPC handlers (~60 lines)
- `electron/preload.cjs` — expose `epic` namespace
- `src/types/electron.d.ts` — type the new APIs
- `src/lib/game-types.ts` — add Epic fields
- `src/components/EpicImportDialog.tsx` — new (~180 lines)
- `src/pages/Index.tsx` — wire button + launch logic
- `src/components/Sidebar.tsx` — add Stores filter section

## Out of scope (v1)
- Full owned (uninstalled) library — needs Legendary
- GOG / Ubisoft Connect / Battle.net (separate effort each)
- Auto-sync on a schedule
- Achievement / playtime sync from Epic (Epic doesn't expose this)

Couple of choices before I start:
