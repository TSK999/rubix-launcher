## Goal

Expand the `rubix-messaging` edge function to also cover **communities** (servers/channels) and **voice chat (VC)**, then hand you the complete mobile build prompt directly in chat (no file).

## 1. Extend `supabase/functions/rubix-messaging/index.ts`

Add these endpoints alongside the existing DM/group ones (same auth: `Authorization: Bearer <token>` + `apikey` header).

### Communities

- `GET    /communities` — list communities the user is a member of (id, name, icon_url, role, member_count).
- `POST   /communities` `{ name, icon_url? }` — create one (uses `create_community` RPC, which auto-creates `general` text channel + `General Voice` channel and makes you owner).
- `POST   /communities/join` `{ invite_code }` — join via invite code (uses `join_community_by_code` RPC).
- `GET    /communities/:cid` — community detail + members + channels.
- `GET    /communities/:cid/channels` — text + voice channels with positions.
- `POST   /communities/:cid/channels` `{ name, kind: "text"|"voice" }` — admins only.
- `POST   /communities/:cid/leave`
- `POST   /communities/:cid/invite/regenerate` — admins only (uses `regenerate_invite_code` RPC).

### Community channel messages (text channels)

- `GET    /channels/:chid/messages?limit&before` — paginated, with attachments + reactions.
- `POST   /channels/:chid/messages` `{ content, reply_to_id?, attachments? }`
- `PATCH  /community-messages/:mid` `{ content }`
- `DELETE /community-messages/:mid`
- `POST   /community-messages/:mid/reactions` `{ emoji, action }`

### Voice (VC) — discovery + presence, signaling stays realtime

- `GET    /calls/active?conversation_id=…` or `?channel_id=…` — current open call session + participant list with profiles.
- `POST   /calls/start` `{ conversation_id?, channel_id? }` — insert a `call_sessions` row, return `{ call_id }`.
- `POST   /calls/:call_id/join` `{ peer_id }` — insert into `call_participants`.
- `POST   /calls/:call_id/leave` — set `left_at = now()` on the user's row.
- `POST   /calls/:call_id/heartbeat` — update `last_seen_at` (so stale participants can be cleaned).
- `POST   /presence/vc` `{ call_id?, channel_id?, conversation_id?, speaking? }` — write to `user_presence` so the rest of the platform sees you in VC.

### Friends / presence (read-only, needed for the mobile app's friends tab)

- `GET    /friends` — accepted friendships only, with profiles.
- `GET    /presence?ids=uuid,uuid,…` — calls existing `get_friend_presence` RPC.

All routes return JSON, share the same CORS + auth helpers already in the file. No DB migration required — every table and RPC needed already exists.

## 2. Deliver the mobile build prompt in chat

After you approve, my next message (in build mode) will:

1. Add the new routes to `supabase/functions/rubix-messaging/index.ts`.
2. Delete the old `docs/rubix-messaging-mobile-prompt.md` file.
3. Paste the full updated mobile build prompt **inline in chat** — covering auth, DMs, groups, communities (servers + text channels), voice chat (using WebRTC over Supabase Realtime, with the desktop launcher's existing signaling channels `crail-vc-<call_id>` / `call-<call_id>` already whitelisted in RLS), friends + presence, screens, motion, and Capacitor packaging.

## Notes

- **Voice transport stays the same:** WebRTC peer connections with signaling over Supabase Realtime channels. The REST endpoints above only handle session bookkeeping (who's in the call) so the mobile UI can show "join voice" rooms and active speakers — they do not replace the WebRTC data path.
- **No new tables, no new RLS, no new RPCs.** Everything maps to existing `communities`, `community_channels`, `community_messages`, `call_sessions`, `call_participants`, `user_presence`, `rubix_friendships`.

Approve and I'll implement + paste the final prompt right here in chat.