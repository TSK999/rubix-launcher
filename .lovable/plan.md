# Modpacks & Mod Detection Plan

A sizeable feature spanning DB, edge functions, and UI. Breaking it into clear phases.

## 1. Database (new tables)

```text
modpacks
  id uuid pk, user_id uuid, game_slug text, name text,
  description text, share_code text unique (8-char), is_public bool,
  download_count int, created_at, updated_at

modpack_mods
  id uuid pk, modpack_id uuid fk, mod_source text ('modio'|'nexus'|'curseforge'|...),
  mod_id text, mod_name text, version text, enabled bool, position int

installed_mods  (per user, per game — tracked client/desktop side, mirrored here for cross-device)
  id uuid pk, user_id uuid, game_slug text, mod_source text, mod_id text,
  mod_name text, version text, install_path text, installed_at

game_launch_prefs
  user_id uuid, game_id uuid, last_mode text ('vanilla'|'modded'),
  active_modpack_id uuid null, updated_at
  pk(user_id, game_id)
```

Each table: GRANT to authenticated + service_role, RLS so users only see/edit their own rows; modpacks readable by anyone when `is_public=true` OR matched by share_code via RPC.

RPC `redeem_modpack_code(_code text)` — security definer, looks up by share_code, copies modpack + mods into caller's account, increments download_count.

## 2. Mod detection

- Desktop app: scan known mod directories per game (KSP `GameData/`, Minecraft `mods/`, etc.). For browser-only users, detection is unavailable — show "Open RUBIX desktop to detect installed mods".
- Add IPC `electron.detectMods(gameSlug, installPath)` that returns a list; sync results into `installed_mods` table on launch.
- Match installed mods to launcher games by `game_slug` (already on games supported by mod manager).

## 3. Game Detail — new "Mods" tab

In `src/components/GameDetail.tsx`, add a `Mods` tab next to Shots/Clips, visible only when the game's slug is supported by the mod manager. Tab contents:

- **Installed mods** list (from `installed_mods` for this user+game).
- **Launch mode toggle**: Vanilla / Modded.
- **Modpack picker** (when Modded): dropdown of user's modpacks for this game + "Create modpack" + "Redeem code".
- Launch button calls existing `onLaunch` but passes the chosen mode/modpack via a new `launchOptions` param (extend `Game` launch flow to apply modpack before starting).

## 4. Modpack management UI

New component `ModpackManager` shown:
- inside the GameDetail Mods tab (compact list)
- inside `src/pages/KspMods.tsx` (and each supported game's mod page) as a full section

Features:
- Create modpack from currently installed mods (or empty + add from browse).
- Edit name/description, toggle public.
- Show **share code** with copy button; "Redeem code" input to import others' packs.
- Delete modpack.

## 5. Mod Manager browse: sorting

In `KspMods.tsx` browse list, add a sort dropdown with options:
- Most popular (default)
- Most downloads
- Recently updated
- Name (A–Z)

Wire to `mods-api` edge function: accept `sort` query param, map to source-specific sort (mod.io `popular`/`downloads`, etc.).

## 6. Edge function updates

- `mods-api`: add `?sort=` handling.
- New `modpacks-api` function (optional, can use direct Supabase client from frontend since RLS covers it). Use RPC for code redemption.

## 7. Files touched

- New: `supabase/migrations/<ts>_modpacks.sql`
- New: `src/lib/modpacks.ts` (client helpers)
- New: `src/components/mods/ModpackManager.tsx`
- New: `src/components/mods/InstalledModsList.tsx`
- New: `src/components/mods/LaunchModeSelector.tsx`
- Edit: `src/components/GameDetail.tsx` (new tab)
- Edit: `src/pages/KspMods.tsx` (sort + modpack section)
- Edit: `supabase/functions/mods-api/index.ts` (sort param)
- Edit: `electron/main.cjs` + `electron/preload.cjs` + `src/types/electron.d.ts` (detectMods IPC)
- Edit: `src/lib/game-types.ts` if launch options need typing

## Open questions

1. Should modpack sharing also bundle the actual mod files, or only the list of mod IDs/versions (recipient re-downloads from source)? List-only is simpler and legal; bundling files raises licensing issues. **Recommended: list-only.**
2. For browser users (no desktop app), should the Mods tab still appear (read-only, can build modpacks but can't launch)? **Recommended: yes, show with a "desktop required to apply" banner.**
3. Sort options — keep the four above, or only the two you mentioned (Most popular / Most downloads)?
