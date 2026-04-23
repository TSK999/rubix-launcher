
# Rubix Messaging Overhaul — Build Plan

## 1. Database (one migration)
New tables:
- **communities** — id, name, icon_url, banner_url, owner_id, invite_code (unique), created_at
- **community_members** — community_id, user_id, role (`owner`|`admin`|`member`), joined_at
- **community_channels** — id, community_id, name, kind (`text`|`voice`), position, created_at
- **community_messages** — id, channel_id, sender_id, content, reply_to_id, edited_at, deleted_at, created_at
- **community_message_reactions** — channel_message_id, user_id, emoji
- **call_sessions** — id, conversation_id (nullable), channel_id (nullable), started_by, started_at, ended_at
- **call_participants** — call_id, user_id, joined_at, left_at, peer_id

Security definer fns:
- `is_community_member(_cid, _uid)`, `community_role(_cid, _uid)`, `generate_invite_code()`
- RLS: members can read community + channels + messages; only `owner`/`admin` can mutate channels/community; only owner can delete community.

Realtime: enable on `community_messages`, `community_message_reactions`, `call_sessions`, `call_participants`.

## 2. Routing
- New route `/messages` → `MessagesPage` (full page)
- Sidebar "Messages" button now navigates instead of opening dialog (keep dialog for backwards compat? **No** — replace).

## 3. Page layout (`/messages`)
Discord-style 3 columns:
- **Server rail (72px)** — DMs pill (home icon) + circular community icons + `+` create/join button
- **Channel/conversation rail (240px)** — context-sensitive:
  - DMs view: list of conversations + "New group" button
  - Community view: community header → channel list (text + voice sections) → member list toggle
- **Main pane** — message view OR voice room

## 4. Voice calls (mesh WebRTC, ≤4)
- `lib/webrtc.ts` — `CallManager` class:
  - Uses Supabase Realtime channel `call:{callId}` for signaling (offer/answer/ice)
  - For each existing peer, creates RTCPeerConnection, swaps SDP via channel broadcast
  - getUserMedia (audio only)
  - Public STUN servers (stun:stun.l.google.com:19302)
- `CallRoom.tsx` component — shows participant tiles with mute/leave, used in both DM voice calls and community voice channels
- DM "Call" button at top of conversation → creates `call_session` with conversation_id, broadcasts invite via Realtime, other party gets incoming-call toast → join

## 5. Communities
- `CommunityList` (server rail), `CommunitySettingsDialog` (rename, icon, regenerate invite, delete), `CreateCommunityDialog`, `JoinCommunityDialog` (paste invite code)
- `ChannelList` with create-channel inline (admin only)
- `CommunityChannelView` (text) — reuses `MessageBubble` + `MessageComposer`-lite for community_messages
- `CommunityVoiceRoom` — joins voice channel, shows tiles

## 6. Rebrand
- "Messages" → "Rubix Messaging" everywhere (sidebar button label, page title, dialog headers)
- Remove now-unused `MessagesDialog` triggering from sidebar (keep file but unused, or delete)

## 7. Files to create
- `supabase/migrations/...` (via tool)
- `src/lib/communities.ts` — CRUD helpers
- `src/lib/webrtc.ts` — mesh manager + signaling
- `src/lib/calls.ts` — DB helpers for call sessions
- `src/pages/Messages.tsx`
- `src/components/messaging/ServerRail.tsx`
- `src/components/messaging/CommunityChannelRail.tsx`
- `src/components/messaging/DmChannelRail.tsx`
- `src/components/messaging/CommunityChannelView.tsx`
- `src/components/messaging/CallRoom.tsx`
- `src/components/messaging/IncomingCallToast.tsx`
- `src/components/messaging/CreateCommunityDialog.tsx`
- `src/components/messaging/JoinCommunityDialog.tsx`
- `src/components/messaging/CommunitySettingsDialog.tsx`
- `src/components/messaging/CallButton.tsx`

## 8. Files to modify
- `src/App.tsx` — add `/messages` route
- `src/components/MessagesPanel.tsx` — change button to navigate to `/messages`, rename to "Rubix Messaging"
- `src/components/messaging/ConversationView.tsx` — add Call button in header

---

**Note**: Voice calls require mic permission and only work on HTTPS (preview is fine). Mesh tops out around 4 people — call UI will block joins beyond that.

Approve and I'll run the migration, then build everything.
