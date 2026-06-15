## Social & Community upgrades

Three new social features that build on what RUBIX already has (friends, presence, communities, voice channels) and make the app feel alive when friends are online.

### 1. Looking-For-Group (LFG) board
A dedicated panel where users post "I want to play X, need 2 more, ranked, mic required" and friends/community members can join with one click.

- New `lfg_posts` table: `id, host_id, game_title, game_cover, slots_total, slots_filled, mode (casual/ranked/event), notes, mic_required, visibility (friends/community/public), community_id?, expires_at, created_at`.
- New `lfg_participants` table: `post_id, user_id, joined_at, status (joined/left)`.
- RLS: read scoped by visibility (public = any authed user, friends = `is_friend_of(host)`, community = `is_community_member`). Host can update/delete; participants can insert/delete their own row.
- New `LfgPanel` component in the sidebar with create/join UI, auto-fills game from current presence.
- Joining auto-opens a DM group with all participants.
- Realtime subscription on `lfg_posts` filtered by visibility.

### 2. Friend Activity Feed
A scrollable feed of friend events: started playing X, posted a clip, joined a community, earned a passport stamp, hit a playtime milestone.

- New `activity_events` table: `id, user_id, kind (play_start/play_milestone/clip_shared/stamp_earned/community_joined/lfg_posted), target_id, target_kind, metadata jsonb, created_at`.
- Triggers/edge functions write events from existing tables (`shared_clips` insert, `user_passport_stamps` insert, `user_game_playtime` milestone crosses, presence game change).
- RLS: viewable only if `is_friend_of(user_id)` or self.
- New route `/feed` + `FriendActivityFeed` component; "What's new" badge in sidebar.
- Realtime subscription scoped to friend IDs.

### 3. Community Events / Scheduled play sessions
Communities can schedule events ("Friday Night Apex, 8pm") with RSVP and auto-reminders.

- New `community_events` table: `id, community_id, creator_id, title, description, game_title, game_cover, starts_at, ends_at?, channel_id? (voice), max_attendees?, created_at`.
- New `community_event_rsvps` table: `event_id, user_id, status (going/maybe/declined), created_at`.
- RLS: community members read/RSVP; admins create/edit/delete.
- New `CommunityEventsTab` inside the community panel; upcoming events surface in sidebar with countdown.
- 15-min-before notification via existing presence/toast system.

### Build order
1. LFG board (highest impact, directly addresses "what should I play and with whom").
2. Friend activity feed (turns the app into a hub you check daily).
3. Community events (scheduled hangouts, retention driver).

I'd recommend shipping #1 first and getting your feedback before moving on, since LFG alone is a big change.

### Technical notes
- All three respect existing Core memory rules: no anon access, friend/community scoping via existing definer functions (`is_friend_of`, `is_community_member`).
- All three reuse existing realtime patterns; subscriptions strictly scoped by membership.
- No changes to `profiles`, `user_roles`, or presence schemas — purely additive.
- New GRANTs on every new public table per project conventions.