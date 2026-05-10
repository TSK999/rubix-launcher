## Goal

Replace the flaky Supabase Realtime presence-channel system with a simple, reliable database-backed presence model. Status (online / away / offline) and "Playing {game}" will be derived from a row per user that the client heartbeats, and all clients subscribe via `postgres_changes` + a periodic ticker for staleness.

## Why this is better

- Channel presence loses state on reconnect, has join/leave race conditions, and "already joined" errors — all of which we've been fighting.
- A row per user is easy to inspect, debug in the DB, and survives reconnects.
- Postgres changes give instant push updates; a 5s ticker is enough to flip users to away/offline based on `last_seen_at`.

## Schema (new table)

`public.user_presence`
- `user_id uuid primary key` (one row per user, no FK to auth.users)
- `last_seen_at timestamptz not null default now()` — updated on heartbeat / activity
- `last_active_at timestamptz not null default now()` — updated only on real activity (mouse/keys/focus); used to compute "away"
- `game text` — null when not in a game
- `updated_at timestamptz not null default now()`

Index: `(last_seen_at desc)`.

RLS:
- SELECT: any authenticated user (presence is meant to be visible to friends/community).
- INSERT / UPDATE: only `auth.uid() = user_id` (upsert own row).
- DELETE: only self.

Realtime: add the table to `supabase_realtime` publication so postgres_changes fire.

## Status derivation (client side)

Given a row:
- `now - last_seen_at > 90s` → **offline**
- else if `now - last_active_at > 5min` → **away**
- else → **online**

Game label shown only when `online` (or also `away`, TBD — default: show whenever row not offline).

## Client changes

### `src/lib/presence.ts` — full rewrite

- Drop the channel/track/transition machinery and `useSyncExternalStore` snapshot complexity.
- New module exports the same public API so callers don't change:
  - `startPresence(userId)`, `stopPresence()`
  - `setPresenceGame(game)`
  - `resyncPresence()`
  - `usePresenceStatus(userId)`, `usePresenceInfo(userId)`, `usePresenceMap(userIds[])`
- Internals:
  - On `startPresence(uid)`: upsert row `(uid, now, now, currentGame)`, then start:
    - **Heartbeat**: every 20s upsert `last_seen_at = now()` (and `last_active_at` if active in last 5min, else leave it).
    - **Activity listeners** (mousemove/keydown/focus/visibility): update local `lastActive`, debounce an upsert that bumps `last_active_at` (e.g. at most every 5s).
  - On `setPresenceGame(game)`: upsert with new `game` value immediately.
  - On `stopPresence()`: one final upsert pushing `last_seen_at` 2 minutes in the past so others see offline quickly, then unsubscribe.
- **Subscription store**: a single module-level subscription to `postgres_changes` on `user_presence` (events: INSERT/UPDATE/DELETE) maintains a `Map<user_id, row>`. React hooks subscribe via `useSyncExternalStore` to a small notifier.
- **Lazy fetch**: `usePresenceMap(ids)` fetches missing rows once via `select * from user_presence where user_id in (...)` and stores them; postgres_changes keeps them current.
- **Ticker**: a 5s `setInterval` that re-emits a snapshot so derived status (online → away → offline based on time) refreshes without DB events.

### `src/components/PresenceManager.tsx`

- Keep the same behavior: on auth, call `startPresence(uid)`; on logout/unmount, `stopPresence()`.
- Steam game polling unchanged; it still calls `setPresenceGame(name | null)`, which now writes to the DB.

### `src/components/RubixFriendsPanel.tsx` and `src/components/SteamFriendsPanel.tsx`

- No API changes — they keep using `usePresenceMap` / `usePresenceInfo`.

## Migration steps (in order)

1. **Migration**: create `user_presence` table, RLS policies, `update_updated_at_column` trigger, add to realtime publication.
2. **Rewrite `src/lib/presence.ts`** as described, preserving exported names.
3. **Verify** `PresenceManager`, `RubixFriendsPanel`, `SteamFriendsPanel` still compile against the same API; tweak only if a signature changed.
4. **Manual test**: open two browser sessions, sign in as two users, confirm:
   - Online dot appears within ~1s of sign-in for the other side.
   - Idling 5min flips to away (can lower threshold temporarily to test).
   - Closing tab → offline within ~90s.
   - Launching a Steam game shows "Playing X" within ~10s (Steam poll interval).

## Out of scope

- Cross-device aggregation (multi-device login picks "most recent" naturally because there's one row per user).
- Custom status text (already handled by `profiles.status_text` separately).
