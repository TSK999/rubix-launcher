# Game Passport — Build Plan

The database is already migrated and seeded with 12 stamps. This plan covers the frontend + wiring.

## What gets built

### 1. `src/lib/passport.ts` (new)
The brain. Exports:
- `recordGameLaunch(userId, game)` — upserts playtime row, bumps launch_count + last_launched_at, closes any prior open session and credits its elapsed time.
- `evaluateStamps({ userId, gameKey })` — fetches catalog + earned + playtime + owned-games count + friends count, awards every newly-eligible stamp in one insert, and fires a toast for each.
- `sweepStampsOnLogin(userId)` — light-weight eligibility check on app open (catches Welcome, Collector, Social tiers without a launch).
- Rarity color/ring/label constants reused by the UI.

### 2. `src/pages/Passport.tsx` (new)
The signature page at `/passport`:
- Cinematic hero: title, tagline, 4 stat cards (stamps collected / games tracked / total hours / legendary count) with a gradient progress bar.
- Two tabs:
  - **Stamps** — grouped by rarity (Legendary → Common). Each stamp is a circular badge with rarity ring (amber glow for legendary, fuchsia for epic, sky for rare), emoji icon, locked stamps show grayscale + padlock, earned ones show earned date.
  - **Game pages** — one card per game tracked, sorted by total playtime, showing hours, launch count, first/last played dates.

### 3. Sidebar entry
Add **Passport** nav item with `BookMarked` icon and a "New" badge between Library and Developer.

### 4. App routing
Add `/passport` route guarded by `RequireRubixAuth`.

### 5. Launch-flow hook (`src/pages/Index.tsx`)
Inside `launchGame`, after stat update, call `recordGameLaunch(user.id, game)` — non-blocking, fire-and-forget. This is the moment stamps are awarded.

## Stamp catalog (already seeded)

| Stamp | Rarity | Trigger |
|---|---|---|
| Welcome to RUBIX | common | sign up |
| Maiden Voyage | common | first game launch |
| Plus One | common | first friend |
| Collector | common | own 5 games |
| Night Owl | rare | manual (future) |
| Marathon | rare | manual (future) |
| Dedicated | rare | 10h in a single game |
| Squad Up | rare | 10 friends |
| Obsessed | epic | 50h in a single game |
| Curator | epic | own 25 games |
| Loyalist | epic | launch one game 25 times |
| Legend | legendary | 100h in a single game |

## Out of scope (deliberately)

- Trading / gifting stamps between friends — phase 2.
- Shareable passport pages on public profile — phase 2.
- Per-game custom stamps defined by developers — phase 3 (devs can already be granted via admin tooling later).
- Session-time tracking via Electron process watch — for now we count time between launches in the same tab; a desktop hook can replace this without changing the schema.

Approve and I'll build all five files in one go.