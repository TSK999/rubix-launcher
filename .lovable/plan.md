## Presence System 2.0 — Build Plan

A cinematic, ambient presence layer for RUBIX. Builds on the existing `user_presence` table + `presence.ts` store, the Spotify connection, the VC/call system, and the Rubix friends panel.

### 1. Data model (one migration)

Extend `user_presence` with richer ambient fields (no new social tables):

- `manual_status` text — `online | available | gaming | in_match | idle | dnd | looking_to_play | null` (null = auto)
- `auto_status` text — derived snapshot the client writes (gaming when game set, in_match when game + recent activity, etc.)
- `game_started_at` timestamptz — set when `game` transitions from null → value (for session length)
- `last_game` text + `last_game_ended_at` timestamptz — for "Last played"
- `session_seconds_today` int + `session_day` date — daily total, reset on day rollover
- `vc_call_id` uuid null, `vc_channel_id` uuid null, `vc_conversation_id` uuid null, `vc_joined_at` timestamptz
- `vc_speaking` bool default false (debounced writes)

A small `get_friend_presence(_uids uuid[])` SECURITY DEFINER RPC returns presence rows joined with the active call session's channel/conversation name + participant count, the user's current Spotify now-playing (via existing `spotify_connections` + edge function pattern), and the friend's profile basics — single round-trip for hovercards.

### 2. Presence engine (`src/lib/presence.ts`)

Refactor into a single source-of-truth store with:

- Status derivation: manual override > VC > game > idle/away/offline.
- Game transitions: when `setPresenceGame(name)` flips from null → value, write `game_started_at = now()`; when it flips to null, copy to `last_game` + accumulate into `session_seconds_today` (with day-reset).
- VC integration: new `setPresenceVC({ callId, channelId, conversationId } | null)` called from `call-controller`. `setPresenceSpeaking(bool)` debounced to ≥1s writes.
- Manual status: `setManualStatus(s | null)` persists to row.
- Subscriptions stay on `useSyncExternalStore` + the existing realtime channel; ticker stays at 5s.
- New hook `useRichPresence(userId)` returns a memoized `RichPresence` object: `{ status, game, gameStartedAt, lastGame, sessionToday, vc: { channelName, participants, speaking } | null, spotify: { track, artist, art } | null, manualStatus }`.
- Spotify: small in-memory cache keyed by user_id, refreshed every 30s only for hovered/visible friends (lazy via `prefetchSpotify(uid)`).

### 3. UI components (new, all in `src/components/presence/`)

- `StatusDot.tsx` — colored dot + ring, variants for each status, soft pulse for speaking.
- `StatusPicker.tsx` — dropdown in user menu / sidebar footer to set manual status (incl. "Looking to Play").
- `PresenceLine.tsx` — one-line summary ("Playing Valorant · 1h 24m") used in friend rows, message headers, profile.
- `PresenceHoverCard.tsx` — the cinematic rich card:
  - Radix `HoverCard` with 200ms open delay.
  - Background: blurred gradient seeded from game title hash (CSS `linear-gradient` over `--card`, `backdrop-blur`).
  - Avatar + name + manual status pill.
  - Game block: cover/logo (lazy from RAWG cache if available, else generic icon) + session timer.
  - VC block: channel name, participant count, speaking pulse, **Join Voice** button.
  - Spotify block: art + track + artist, marquee on overflow.
  - Footer actions: **Join Voice**, **Launch Same Game** (links to library/store), **Message**, **Invite**.
  - Motion: `animate-in fade-in slide-in-from-bottom-1` + custom `hover-lift` utility.
- `AmbientActivityFeed.tsx` — small collapsible panel (max ~6 items, no scroll past), subscribes to presence row UPDATEs and emits ephemeral events on transitions (game start, VC join, status → looking_to_play). Items fade in, auto-fade after 30s. No reactions, no persistence.

### 4. Integrations

- **`RubixFriendsPanel`**: wrap each `FriendRow` with `PresenceHoverCard`. Replace the simple "Playing X" line with `<PresenceLine>`. Add speaking pulse on the avatar ring when `vc.speaking`.
- **`Sidebar`**: add `StatusPicker` in the user footer area; show current manual status pill.
- **`MessagesPanel` / `ConversationView`** header: show `<PresenceLine>` for the other DM participant.
- **`RubixProfile`** page: add a "Now" card with full rich presence + session-today + last-played.
- **`StoreGame` / `GameDetail`**: small "Friends playing now" strip filtered by `game === title`.
- **Communities**: in `CommunityChannelView` voice channels, show speaking pulse using `vc_speaking`.
- **`call-controller`**: on join → `setPresenceVC(...)`, on leave → `setPresenceVC(null)`; wire the existing speaking-detection to `setPresenceSpeaking`.
- **`PresenceManager`**: also poll Spotify now-playing for self every 30s and write track to a lightweight `spotify_now` cache row (reuses existing edge fn).

### 5. Motion & theming

- Add tokens to `index.css`: `--presence-online`, `--presence-away`, `--presence-dnd`, `--presence-gaming`, `--presence-looking`, plus `--shadow-presence` (soft glow) and `--gradient-ambient`.
- Add keyframes: `presence-pulse` (speaking), `card-lift` (hover), `gradient-drift` (slow ambient bg), `presence-in` (slide+fade).
- Respect `prefers-reduced-motion` — disable pulse and drift.

### 6. Performance

- All hovercards use `useRichPresence` which reads from the shared store — zero extra subscriptions per card.
- Spotify + game-art fetches are lazy and only triggered on hovercard open (`onOpenChange`).
- Speaking writes debounced (1s), heartbeat stays at 20s, activity write debounce stays at 5s.
- Activity feed derives from existing realtime channel — no new subscription.
- `PresenceHoverCard` body memoized; gradient computed once per game name via `useMemo`.

### Technical notes

- No new tables. One migration extends `user_presence` and adds the `get_friend_presence` RPC.
- All new colors via HSL semantic tokens; no hex in components.
- Reuses Radix `HoverCard`, existing `call-controller`, `spotify-now-playing` edge fn, and `rubix-profile` lib.
- Files added: `src/lib/presence-rich.ts`, `src/components/presence/{StatusDot,StatusPicker,PresenceLine,PresenceHoverCard,AmbientActivityFeed}.tsx`.
- Files edited: `src/lib/presence.ts`, `src/components/PresenceManager.tsx`, `src/components/RubixFriendsPanel.tsx`, `src/components/Sidebar.tsx`, `src/components/MessagesPanel.tsx`, `src/components/messaging/ConversationView.tsx`, `src/pages/RubixProfile.tsx`, `src/pages/StoreGame.tsx`, `src/components/GameDetail.tsx`, `src/lib/call-controller.ts`, `src/index.css`, `tailwind.config.ts`.
