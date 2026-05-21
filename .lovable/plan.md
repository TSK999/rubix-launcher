# Clip Upload & Sharing System

A premium, Medal/Steam-inspired clip platform built on top of the existing `game_clips_user` table and `game-clips` bucket.

## Scope

Turn local clips into shareable cinematic moments — uploads, public links, in-chat embeds, community posts, dedicated viewer page, and a global upload queue.

---

## 1. Backend (Lovable Cloud)

### New tables

- **`shared_clips`** — public-facing clip records (separate from private `game_clips_user`)
  - `id`, `user_id`, `source_clip_id` (nullable FK to game_clips_user)
  - `title`, `game_key`, `game_title`
  - `original_path`, `stream_path` (nullable), `thumbnail_path` (nullable)
  - `duration_seconds`, `size_bytes`, `width`, `height`, `mime_type`
  - `visibility` (`public` | `unlisted` | `private`)
  - `view_count`, `share_count`
  - `processing_status` (`pending` | `ready` | `failed`)
  - `share_slug` (short public ID, e.g. `aB3xQ9`)
- **`clip_views`** — dedupe views by user+day
- **`clip_reactions`** — emoji reactions on shared clips
- **`clip_comments`** — comments on viewer page
- **`clip_reports`** — abuse reports

### Storage

Reuse `game-clips` bucket with new prefix structure:
```
clips/{user_id}/originals/{clip_id}.webm
clips/{user_id}/transcoded/{clip_id}.mp4
clips/{user_id}/thumbnails/{clip_id}.jpg
```
Add **public read policy** for objects under `clips/*/transcoded/*` and `clips/*/thumbnails/*` for `visibility=public|unlisted` (via signed-URL edge function — bucket stays private, edge serves URLs).

### Edge functions

- `clip-upload-init` — accepts metadata, creates `shared_clips` row (status=pending), returns signed upload URL + share slug
- `clip-upload-complete` — marks original received, kicks off thumbnail extraction (ffmpeg.wasm in renderer side as MVP) or queues processing
- `clip-stream` — `/clip-stream/:slug` returns signed streaming URL honoring visibility
- `clip-meta` — public metadata for viewer page (respects visibility)
- `clip-report` — file report

### RLS

- `shared_clips`: owner full CRUD; SELECT allowed if `visibility != 'private'` OR owner
- `clip_comments` / `clip_reactions`: authenticated insert; SELECT if parent clip viewable
- `clip_views`: insert by anyone authenticated

---

## 2. Frontend — Upload pipeline

### Global Upload Manager (`src/lib/upload-manager.ts`)

- Zustand store: queue of `UploadJob { id, file, clipId, progress, status, error }`
- **Chunked uploads** via `supabase.storage.uploadToSignedUrl` with `TUS`-like resumable approach (split file into 5MB chunks; resume on failure)
- Pause / resume / cancel / retry per job
- Background — keeps running across route changes (provider at app root)

### Floating Upload Widget (`src/components/clips/UploadDock.tsx`)

- Bottom-right floating card, collapsible
- Animated progress rings (Framer Motion)
- Per-job: filename, game, % bar, pause/cancel/retry buttons
- Auto-hides when queue empty; pulses when active

### Clip rename / delete / upload buttons → integrated into existing `GameClipsTab` cards
- New action menu (dropdown): Upload, Copy Link, Share to Chat, Share to Community, Download, Rename, Delete
- Upload status badge overlay: `Local` / `Uploading 42%` / `Shared ●`

---

## 3. Clip Viewer page

**Route:** `/clip/:slug`

- Cinematic layout:
  - Fullscreen blurred backdrop (thumbnail with heavy blur + ambient glow gradient)
  - Centered large `<video>` player with custom controls (reuse ClipPlayer)
  - Minimal chrome top bar (back, copy link, share, download, report)
  - Right rail (desktop) / below (mobile): uploader profile chip, game info, timestamp, view count, reactions, comments
- View tracked on play (debounced, dedupe via `clip_views`)
- Share buttons: copy link, share to chat picker, share to community picker
- Visibility gate: private → 404 unless owner; unlisted → accessible by link only

---

## 4. Sharing into Chat & Communities

### In-chat clip embed

- New message attachment `kind = 'clip'` with metadata `{ slug, title, thumbnail, duration, game, uploader }`
- `ClipMessageCard` component:
  - Thumbnail with play overlay + duration pill
  - Hover → muted autoplay preview (transcoded stream, 6s loop)
  - Click → inline expand to play in chat OR open viewer
  - Footer: uploader avatar + game name
- **Drag & drop**: existing `MessageComposer` accepts drop of clip cards from Clips tab (HTML5 DnD with `application/x-rubix-clip` payload = slug)
- "Share to Chat" action → conversation picker modal → inserts clip message

### Community posts

- Same `ClipMessageCard` works in `community_messages` via attachment kind
- Reactions/replies reuse existing community_message_reactions + reply_to_id

---

## 5. Processing (MVP scope)

- **Thumbnail**: extract in renderer using a hidden `<video>` + `<canvas>` at upload-complete time; upload as `.jpg` (fast, no server cost)
- **Streaming variant**: for MVP, original `webm`/`mp4` streams directly. Future: queue server-side transcode (note in code as TODO).
- **Validation**: client-side mime allowlist (`video/webm`, `video/mp4`, `video/x-matroska`), max 500MB, max duration 600s. Server-side re-check in `clip-upload-init`.

---

## 6. UI polish

- Framer Motion page transitions on viewer
- Hover previews on grid (load `<video preload="metadata">` and seek-play on hover)
- Animated progress rings (SVG stroke-dashoffset)
- Toast notifications via existing `sonner`
- Keyboard shortcuts in viewer: `Space` play/pause, `←/→` seek, `M` mute, `F` fullscreen, `C` copy link

---

## File map

**New**
- `supabase/migrations/*` — tables, RLS, bucket policy
- `supabase/functions/clip-upload-init/index.ts`
- `supabase/functions/clip-upload-complete/index.ts`
- `supabase/functions/clip-stream/index.ts`
- `supabase/functions/clip-meta/index.ts`
- `supabase/functions/clip-report/index.ts`
- `src/lib/upload-manager.ts` (Zustand store)
- `src/lib/clip-share.ts` (helpers: thumbnail extraction, share URL, slug)
- `src/components/clips/UploadDock.tsx`
- `src/components/clips/ClipActionsMenu.tsx`
- `src/components/clips/ClipMessageCard.tsx`
- `src/components/clips/ShareToChatDialog.tsx`
- `src/components/clips/ShareToCommunityDialog.tsx`
- `src/pages/ClipViewer.tsx` (route `/clip/:slug`)

**Modified**
- `src/components/games/GameClipsTab.tsx` — wire actions menu + upload
- `src/components/chat/MessageComposer.tsx` — accept clip drop
- `src/components/chat/MessageBubble.tsx` (or equivalent) — render clip attachments
- `src/App.tsx` — add `/clip/:slug` route + mount `<UploadDock />`

---

## Build order

1. DB migration (tables, RLS, slug generator function)
2. Edge functions (init / complete / stream / meta)
3. Upload manager + UploadDock
4. ClipActionsMenu + integration into GameClipsTab
5. ClipViewer page
6. ClipMessageCard + chat/community embed + DnD
7. Share dialogs
8. Polish: hover previews, animations, keyboard shortcuts

This is a large build — once approved I'll execute it in that order in a single pass.
