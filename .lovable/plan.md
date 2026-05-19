## Game Notes, Tags & Screenshots

Add three tightly-connected features to each game's detail panel:

1. **Notes** — free-form markdown-ish text per game (tips, builds, todo lists).
2. **Tags** — user-defined labels for filtering the library (e.g. `coop`, `replay`, `finished`).
3. **Screenshots** — a local screenshot gallery per game, with hotkey capture in Electron and drag-and-drop import in the browser.

### Scope

- Per-user, per-game, stored in Lovable Cloud so they sync across devices when signed in.
- Library page gets a tag filter chip row + a "Has notes" toggle.
- `GameDetail.tsx` gets a new **Notes & Media** tab.

### Data model (new tables)

- `game_user_data` — one row per (user_id, game_key)
  - `game_key` (text) — stable client-side key from `Game.id` so it works for Steam/Epic/EA/Xbox/Riot imports
  - `title_snapshot`, `source` — denormalized so we can render a list without the local library
  - `notes` (text), `tags` (text[]), `is_pinned` (bool)
- `game_screenshots_user` — gallery items
  - `user_id`, `game_key`, `storage_path`, `caption`, `taken_at`, `width`, `height`
- New storage bucket `game-screenshots` (private), RLS scoped to `auth.uid()` folder prefix.

All tables get RLS: only owner can read/write their rows.

### Electron side (screenshot hotkey)

- `electron/main.cjs`: register a global shortcut (default **F12**, configurable later) that:
  - detects the foreground window title, matches against the launcher's "currently launched game" (we already track `lastPlayedAt` / `game_started_at` in presence)
  - captures the active screen via `desktopCapturer`, writes PNG to a temp file
  - emits `rubix:screenshot-captured` to the renderer with the file path
- `electron/preload.cjs`: expose `rubix.screenshots.onCaptured(cb)` and `rubix.screenshots.readFile(path)`
- Renderer uploads the PNG to the `game-screenshots` bucket and inserts a row.

In the browser (non-Electron) we skip the hotkey and only offer drag-and-drop / file picker upload.

### UI changes

- `src/components/GameDetail.tsx`: add a tabs strip — **Overview · Notes · Screenshots**.
  - Notes tab: textarea with autosave (debounced 800ms), tag editor (chip input).
  - Screenshots tab: responsive masonry grid, lightbox on click, delete + set-as-cover actions.
- `src/pages/Library.tsx`: tag chip filter row above the grid (multi-select, AND semantics), plus a "Notes" filter toggle.
- `src/components/GameCard.tsx`: small icon badges when a game has notes or tags.
- New `src/lib/game-user-data.ts` + `src/lib/game-screenshots.ts` helpers wrapping the Supabase calls.
- New `src/hooks/useGameUserData.ts` to load+cache per-game data via React Query.

### Out of scope (future)

- Per-screenshot sharing to Rubix friends/messages (would reuse existing message-attachment flow).
- OCR / auto-tagging.
- Cloud-synced screenshot thumbnails generation (we'll store originals only for now).

### Open question

Default screenshot hotkey — keep **F12** or pick something less likely to conflict (e.g. **Ctrl+Shift+S**)? I'll go with **F12** unless you say otherwise, and expose it in Settings later.