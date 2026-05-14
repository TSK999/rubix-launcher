# RUBIX Messaging — Mobile App Build Prompt

Copy everything below into a fresh Lovable project to build the **official RUBIX Messaging mobile companion app**. It connects to the same backend the desktop launcher uses, so the same accounts, friends, and conversations work seamlessly across both.

---

## Prompt for Lovable

> Build **RUBIX Messaging Mobile** — a premium, mobile-first messaging client for the RUBIX gaming platform. It is **not** a new chat product; it is a thin, beautiful client that talks to the existing RUBIX backend through two public REST APIs.
>
> ### Identity & Style
>
> - Calm, cinematic, dark UI. Soft gradients, generous spacing, no clutter.
> - Feels like an Apple-native app: smooth transitions, large touch targets, hairline dividers.
> - Primary accent: a single saturated color (suggest deep indigo `#6366f1` with a glow variant). Background: near-black `#0b0b10` with elevated surfaces in `#15151c`.
> - Typography: display font with personality for headers (e.g. **Sora** or **Space Grotesk**), neutral body (e.g. **Inter** or **Manrope**). No serifs.
> - Motion: presence dots gently pulse, message bubbles fade+slide in, conversation rows have subtle hover-lift on press. Respect `prefers-reduced-motion`.
>
> ### What to build (screens)
>
> 1. **Auth** — Sign in / Sign up with email + password. Username required on signup. After login, store the access + refresh tokens securely (Capacitor Preferences if mobile, otherwise localStorage). Auto-refresh tokens before they expire.
> 2. **Conversations list** — Full-bleed list of DMs and groups. Each row shows avatar, name, last message preview, relative time, and an unread badge. Pull-to-refresh. Tap a row → conversation. Floating action button to start a new chat.
> 3. **New chat** — Search users by username, tap to start a DM. Separate "New group" flow with multi-select + group name + optional avatar.
> 4. **Conversation view** — Sticky header with avatar/name and back button. Reverse-chronological message list with paginated scroll-up to load older messages. Message bubbles (own = accent gradient, other = elevated surface). Reply, react with emoji (long-press menu), edit + delete own messages. Composer at the bottom with send button and (optional) attach button. Mark conversation as read on open.
> 5. **Group settings** — Member list, leave group, mute toggle, edit group name/avatar (admins only).
> 6. **Profile / settings** — Show current user (username, avatar), sign out button.
>
> ### Realtime
>
> Use the Supabase Realtime client to subscribe to new messages on the open conversation. Channel name: `conv:<conversation_id>`. Listen for `postgres_changes` on `public.messages` filtered by `conversation_id`. Append new messages to the list and auto-scroll if the user is near the bottom.
>
> ### Backend — DO NOT add a database
>
> Do **not** add Lovable Cloud or Supabase to this project. All data lives in the existing RUBIX backend. Use these two public edge functions:
>
> **Base URL:** `https://ogkuwbdziljwbgspwoqp.supabase.co/functions/v1`
>
> Every request must include this header (this is the public anon key, safe to ship):
>
> ```
> apikey: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9na3V3YmR6aWxqd2Jnc3B3b3FwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY1MzYzNTgsImV4cCI6MjA5MjExMjM1OH0.iX0NQwuuf_ZMiT0vWmMZpb00xtk37IK03f8HKd6kO8E
> ```
>
> After login, also send `Authorization: Bearer <access_token>` on every authenticated call.
>
> #### 1. Accounts API — `/rubix-accounts`
>
> | Method | Path | Body | Purpose |
> |---|---|---|---|
> | POST | `/signup` | `{ email, password, username, display_name? }` | Create account. Returns `{ user, session }`. If `session` is null, the user must verify their email first. |
> | POST | `/signin` | `{ email, password }` | Returns `{ session, user, profile }`. Store `session.access_token` and `session.refresh_token`. |
> | POST | `/refresh` | `{ refresh_token }` | Returns a fresh `{ session, user }`. Call this before `expires_at`. |
> | POST | `/signout` | _(auth)_ | Invalidates the token. |
> | GET  | `/me` | _(auth)_ | Returns `{ user, profile }`. Use to validate token + load own profile. |
> | GET  | `/profile?username=foo` | — | Public profile lookup. |
>
> #### 2. Messaging API — `/rubix-messaging`
>
> All require `Authorization: Bearer <access_token>`.
>
> | Method | Path | Purpose |
> |---|---|---|
> | GET    | `/conversations` | List all conversations with title, avatar, member ids, last message preview, last_read_at. |
> | POST   | `/dm` `{ other_user_id }` | Find or create a 1:1 DM. Returns `{ conversation_id }`. |
> | POST   | `/groups` `{ name, member_ids[], avatar_url? }` | Create a group. Returns `{ conversation_id }`. |
> | GET    | `/conversations/:id/members` | Members + their profiles. |
> | POST   | `/conversations/:id/read` | Mark as read. |
> | POST   | `/conversations/:id/leave` | Leave the conversation. |
> | GET    | `/conversations/:id/messages?limit=50&before=<iso>` | Paginated history (oldest→newest in response), with attachments + reactions inlined. |
> | POST   | `/conversations/:id/messages` `{ content, reply_to_id?, attachments? }` | Send a message. |
> | PATCH  | `/messages/:id` `{ content }` | Edit own message. |
> | DELETE | `/messages/:id` | Soft-delete own message. |
> | POST   | `/messages/:id/reactions` `{ emoji, action: "toggle"\|"add"\|"remove" }` | React. |
> | GET    | `/profiles/search?q=&limit=` | Search users by username/display name. |
> | GET    | `/profiles?ids=uuid,uuid` | Bulk profile fetch. |
>
> #### Realtime snippet
>
> ```ts
> import { createClient } from "@supabase/supabase-js";
>
> export const supabase = createClient(
>   "https://ogkuwbdziljwbgspwoqp.supabase.co",
>   "<anon key from above>",
> );
>
> // After login, set the session so realtime subscriptions are authorized:
> await supabase.auth.setSession({ access_token, refresh_token });
>
> const channel = supabase
>   .channel(`conv:${conversationId}`)
>   .on(
>     "postgres_changes",
>     { event: "INSERT", schema: "public", table: "messages", filter: `conversation_id=eq.${conversationId}` },
>     (payload) => addMessage(payload.new),
>   )
>   .subscribe();
> ```
>
> ### Architecture suggestions
>
> - One `apiClient.ts` with `get/post/patch/del` helpers that automatically attach the `apikey` header and the bearer token, and transparently call `/refresh` on 401.
> - One `useAuth()` hook exposing `{ user, profile, signIn, signUp, signOut }` and persisting tokens.
> - Use **TanStack Query** for conversations and messages (with `staleTime: 30s` for the list, infinite query for messages).
> - Wrap the realtime subscription in a `useConversationRealtime(conversationId)` hook that updates the query cache on new messages.
> - Optimistic send: append the message locally with a temp id, swap on server response, mark as failed if the request errors.
>
> ### Native packaging (optional but recommended)
>
> Add Capacitor so this can ship to iOS and Android:
> - `appId`: `com.rubix.messaging`
> - `appName`: `RUBIX Messaging`
> - Splash screen: black with the RUBIX logo centered.
> - Status bar: dark content on the dark background.
>
> ### Out of scope (do NOT build)
>
> - Voice / video calls (lives in the desktop launcher only).
> - Communities / servers (desktop only).
> - Game presence, Spotify presence, friends panel — read-only data only if needed (skip for v1).
> - Any new database tables, edge functions, auth providers, or RLS policies. This client is purely a consumer of the two APIs above.

---

## Notes for the human

- Both edge functions live in the launcher project (`supabase/functions/rubix-accounts` and `supabase/functions/rubix-messaging`) and are deployed automatically.
- They are CORS-open and JWT-validating in code, so the mobile client can call them from any origin.
- If you ever rotate the anon key, update it in the mobile app's `apiClient.ts` and the Supabase realtime client config.
