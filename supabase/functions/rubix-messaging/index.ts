// RUBIX Messaging API
// Public REST endpoints for third-party / mobile clients to use the RUBIX
// messaging system (DMs + group chats) backed by the same database the
// desktop launcher uses.
//
// All endpoints (except /health) require an Authorization: Bearer <access_token>
// header with a token obtained from the rubix-accounts API
// (POST /rubix-accounts/signin or /signup).
//
// ── Conversations ────────────────────────────────────────────────────────────
//   GET  /rubix-messaging/conversations
//        → list all conversations the user is a member of, with the
//          other-party profile (for DMs) or member count (for groups),
//          and the last message preview.
//   POST /rubix-messaging/dm                 { other_user_id }
//        → find or create a 1:1 DM with another user. Returns conversation_id.
//   POST /rubix-messaging/groups             { name, member_ids[], avatar_url? }
//        → create a group chat. Returns conversation_id.
//   GET  /rubix-messaging/conversations/:id/members
//   POST /rubix-messaging/conversations/:id/read
//        → mark conversation as read (updates last_read_at).
//   POST /rubix-messaging/conversations/:id/leave
//
// ── Messages ─────────────────────────────────────────────────────────────────
//   GET  /rubix-messaging/conversations/:id/messages?limit=100&before=<iso>
//        → paginated message history (oldest→newest in returned array),
//          with attachments and reactions inlined.
//   POST /rubix-messaging/conversations/:id/messages   { content, reply_to_id?, attachments?[] }
//        → send a message. attachments: [{ kind, external_url?, storage_path?, ... }]
//   PATCH  /rubix-messaging/messages/:id    { content }
//   DELETE /rubix-messaging/messages/:id
//   POST   /rubix-messaging/messages/:id/reactions    { emoji, action: "toggle"|"add"|"remove" }
//
// ── People ───────────────────────────────────────────────────────────────────
//   GET  /rubix-messaging/profiles/search?q=foo&limit=10
//   GET  /rubix-messaging/profiles?ids=uuid,uuid,...
//
// ── Realtime ─────────────────────────────────────────────────────────────────
//   Use the Supabase Realtime client directly with the same access token.
//   Subscribe to channel `conv:<conversation_id>` and listen for postgres
//   changes on `public.messages` filtered by conversation_id.
//
// CORS is wide-open (*) so this is safe to call from any web/mobile origin.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, PATCH, DELETE, OPTIONS",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const admin = () =>
  createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

const userClient = (token: string) =>
  createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });

const requireAuth = async (req: Request) => {
  const auth = req.headers.get("Authorization") ?? "";
  const token = auth.replace(/^Bearer\s+/i, "");
  if (!token) return { error: json({ error: "missing bearer token" }, 401) };
  const { data, error } = await admin().auth.getUser(token);
  if (error || !data.user) return { error: json({ error: "invalid token" }, 401) };
  return { token, userId: data.user.id, client: userClient(token) };
};

const PROFILE_COLS = "user_id, username, display_name, avatar_url";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const url = new URL(req.url);
  const path = url.pathname.replace(/^.*\/rubix-messaging/, "") || "/";

  try {
    if (path === "/" || path === "/health") {
      return json({
        ok: true,
        service: "rubix-messaging",
        endpoints: [
          "GET    /conversations",
          "POST   /dm                    { other_user_id }",
          "POST   /groups                { name, member_ids[], avatar_url? }",
          "GET    /conversations/:id/members",
          "POST   /conversations/:id/read",
          "POST   /conversations/:id/leave",
          "GET    /conversations/:id/messages?limit&before",
          "POST   /conversations/:id/messages   { content, reply_to_id?, attachments? }",
          "PATCH  /messages/:id          { content }",
          "DELETE /messages/:id",
          "GET    /messages/:id",
          "GET    /messages/:id/thread",
          "POST   /messages/:id/replies  { content, attachments? }",
          "POST   /messages/:id/reactions { emoji, action }",
          "POST   /uploads/sign          { filename, mime, size }",
          "GET    /link-preview?url=",
          "GET    /profiles/search?q=&limit=",
          "GET    /profiles?ids=...",
        ],
      });
    }

    const auth = await requireAuth(req);
    if ("error" in auth) return auth.error;
    const { userId, client } = auth;

    // ──────────────── Profiles ────────────────
    // Use the user-scoped client so the profiles RLS policy (which honors the
    // privacy field + friend/community visibility) is enforced.
    if (path === "/profiles/search" && req.method === "GET") {
      const q = (url.searchParams.get("q") ?? "").trim();
      const limit = Math.min(Number(url.searchParams.get("limit") ?? 10), 50);
      if (!q) return json({ profiles: [] });
      const safe = q.replace(/[%,()]/g, "");
      const { data, error } = await client
        .from("profiles")
        .select(PROFILE_COLS)
        .or(`username.ilike.%${safe}%,display_name.ilike.%${safe}%`)
        .limit(limit);
      if (error) return json({ error: error.message }, 400);
      return json({ profiles: (data ?? []).filter((p) => p.user_id !== userId) });
    }

    if (path === "/profiles" && req.method === "GET") {
      const idsParam = url.searchParams.get("ids") ?? "";
      const ids = idsParam.split(",").map((s) => s.trim()).filter(Boolean);
      if (ids.length === 0) return json({ profiles: [] });
      const { data, error } = await client
        .from("profiles")
        .select(PROFILE_COLS)
        .in("user_id", ids);
      if (error) return json({ error: error.message }, 400);
      return json({ profiles: data ?? [] });
    }


    // ──────────────── Conversations list ────────────────
    if (path === "/conversations" && req.method === "GET") {
      const { data: convs, error } = await client
        .from("conversations")
        .select("*")
        .order("last_message_at", { ascending: false });
      if (error) return json({ error: error.message }, 400);

      const convIds = (convs ?? []).map((c: any) => c.id);
      if (convIds.length === 0) return json({ conversations: [] });

      const { data: members } = await client
        .from("conversation_members")
        .select("conversation_id, user_id, last_read_at")
        .in("conversation_id", convIds);

      const allUserIds = Array.from(new Set((members ?? []).map((m: any) => m.user_id)));
      const { data: profs } = await client
        .from("profiles")
        .select(PROFILE_COLS)
        .in("user_id", allUserIds);
      const profMap = new Map<string, any>();
      (profs ?? []).forEach((p) => profMap.set(p.user_id, p));

      // last message preview per conversation
      const { data: lastMsgs } = await client
        .from("messages")
        .select("id, conversation_id, sender_id, content, created_at, deleted_at")
        .in("conversation_id", convIds)
        .order("created_at", { ascending: false })
        .limit(convIds.length * 5);
      const lastByConv = new Map<string, any>();
      for (const m of (lastMsgs ?? [])) {
        if (!lastByConv.has(m.conversation_id)) lastByConv.set(m.conversation_id, m);
      }

      const out = (convs ?? []).map((c: any) => {
        const memRows = (members ?? []).filter((m: any) => m.conversation_id === c.id);
        const memberIds = memRows.map((m: any) => m.user_id);
        const me = memRows.find((m: any) => m.user_id === userId);
        const others = memberIds.filter((id: string) => id !== userId);
        let title = c.name as string | null;
        let avatar = c.avatar_url as string | null;
        let other_profile: any = null;
        if (!c.is_group) {
          const otherP = profMap.get(others[0] ?? "");
          other_profile = otherP ?? null;
          title = otherP?.display_name ?? otherP?.username ?? "Direct message";
          avatar = otherP?.avatar_url ?? null;
        }
        return {
          ...c,
          title,
          avatar_url: avatar,
          member_ids: memberIds,
          other_profile,
          last_message: lastByConv.get(c.id) ?? null,
          last_read_at: me?.last_read_at ?? null,
        };
      });

      return json({ conversations: out });
    }

    // ──────────────── Create / find DM ────────────────
    if (path === "/dm" && req.method === "POST") {
      const { other_user_id } = await req.json();
      if (!other_user_id) return json({ error: "other_user_id required" }, 400);
      const { data, error } = await client.rpc(
        "get_or_create_direct_conversation",
        { _other_user_id: other_user_id },
      );
      if (error) return json({ error: error.message }, 400);
      return json({ conversation_id: data });
    }

    // ──────────────── Create group ────────────────
    if (path === "/groups" && req.method === "POST") {
      const { name, member_ids = [], avatar_url = null } = await req.json();
      if (!name || typeof name !== "string") return json({ error: "name required" }, 400);
      const cid = crypto.randomUUID();
      const { error: cErr } = await client.from("conversations").insert({
        id: cid,
        is_group: true,
        name: name.trim(),
        avatar_url,
        created_by: userId,
      });
      if (cErr) return json({ error: cErr.message }, 400);
      const { error: selfErr } = await client
        .from("conversation_members")
        .insert({ conversation_id: cid, user_id: userId, is_admin: true });
      if (selfErr) return json({ error: selfErr.message }, 400);
      const others = (member_ids as string[])
        .filter((id) => id && id !== userId)
        .map((id) => ({ conversation_id: cid, user_id: id, is_admin: false }));
      if (others.length > 0) {
        const { error: mErr } = await client.from("conversation_members").insert(others);
        if (mErr) return json({ error: mErr.message }, 400);
      }
      return json({ conversation_id: cid });
    }

    // ──────────────── Per-conversation routes ────────────────
    let m = path.match(/^\/conversations\/([0-9a-f-]{36})\/members$/);
    if (m && req.method === "GET") {
      const cid = m[1];
      const { data, error } = await client
        .from("conversation_members")
        .select("*")
        .eq("conversation_id", cid);
      if (error) return json({ error: error.message }, 400);
      const ids = (data ?? []).map((r: any) => r.user_id);
      const { data: profs } = await client
        .from("profiles")
        .select(PROFILE_COLS)
        .in("user_id", ids);
      return json({ members: data, profiles: profs ?? [] });
    }

    m = path.match(/^\/conversations\/([0-9a-f-]{36})\/read$/);
    if (m && req.method === "POST") {
      const cid = m[1];
      const { error } = await client
        .from("conversation_members")
        .update({ last_read_at: new Date().toISOString() })
        .eq("conversation_id", cid)
        .eq("user_id", userId);
      if (error) return json({ error: error.message }, 400);
      return json({ ok: true });
    }

    m = path.match(/^\/conversations\/([0-9a-f-]{36})\/leave$/);
    if (m && req.method === "POST") {
      const cid = m[1];
      const { error } = await client
        .from("conversation_members")
        .delete()
        .eq("conversation_id", cid)
        .eq("user_id", userId);
      if (error) return json({ error: error.message }, 400);
      return json({ ok: true });
    }

    m = path.match(/^\/conversations\/([0-9a-f-]{36})\/messages$/);
    if (m && req.method === "GET") {
      const cid = m[1];
      const limit = Math.min(Number(url.searchParams.get("limit") ?? 50), 200);
      const before = url.searchParams.get("before");
      let q = client
        .from("messages")
        .select("*, attachments:message_attachments(*), reactions:message_reactions(*)")
        .eq("conversation_id", cid)
        .order("created_at", { ascending: false })
        .limit(limit);
      if (before) q = q.lt("created_at", before);
      const { data, error } = await q;
      if (error) return json({ error: error.message }, 400);
      // return oldest→newest for easier consumption
      return json({ messages: (data ?? []).slice().reverse() });
    }

    if (m && req.method === "POST") {
      const cid = m[1];
      const body = await req.json();
      const content: string | null = body.content ?? null;
      const reply_to_id: string | null = body.reply_to_id ?? null;
      const attachments: any[] = Array.isArray(body.attachments) ? body.attachments : [];
      if (!content && attachments.length === 0) {
        return json({ error: "content or attachments required" }, 400);
      }
      const { data: msg, error } = await client
        .from("messages")
        .insert({ conversation_id: cid, sender_id: userId, content, reply_to_id })
        .select("*")
        .single();
      if (error || !msg) return json({ error: error?.message ?? "send failed" }, 400);
      if (attachments.length > 0) {
        const rows = attachments.map((a) => ({
          message_id: msg.id,
          kind: a.kind ?? "file",
          external_url: a.external_url ?? null,
          storage_path: a.storage_path ?? null,
          mime_type: a.mime_type ?? null,
          file_name: a.file_name ?? null,
          size_bytes: a.size_bytes ?? null,
          width: a.width ?? null,
          height: a.height ?? null,
        }));
        const { error: aErr } = await client.from("message_attachments").insert(rows);
        if (aErr) return json({ error: aErr.message }, 400);
      }
      return json({ message: msg });
    }

    // ──────────────── Message-level routes ────────────────
    m = path.match(/^\/messages\/([0-9a-f-]{36})$/);
    if (m && req.method === "PATCH") {
      const id = m[1];
      const { content } = await req.json();
      if (typeof content !== "string") return json({ error: "content required" }, 400);
      const { error } = await client.from("messages").update({ content }).eq("id", id);
      if (error) return json({ error: error.message }, 400);
      return json({ ok: true });
    }
    if (m && req.method === "DELETE") {
      const id = m[1];
      const { error } = await client
        .from("messages")
        .update({ deleted_at: new Date().toISOString(), content: null })
        .eq("id", id);
      if (error) return json({ error: error.message }, 400);
      return json({ ok: true });
    }

    m = path.match(/^\/messages\/([0-9a-f-]{36})\/reactions$/);
    if (m && req.method === "POST") {
      const id = m[1];
      const { emoji, action = "toggle" } = await req.json();
      if (!emoji) return json({ error: "emoji required" }, 400);
      if (action === "remove") {
        await client
          .from("message_reactions")
          .delete()
          .eq("message_id", id)
          .eq("user_id", userId)
          .eq("emoji", emoji);
        return json({ ok: true });
      }
      if (action === "add") {
        await client
          .from("message_reactions")
          .insert({ message_id: id, user_id: userId, emoji });
        return json({ ok: true });
      }
      // toggle
      const { data: existing } = await client
        .from("message_reactions")
        .select("emoji")
        .eq("message_id", id)
        .eq("user_id", userId)
        .eq("emoji", emoji)
        .maybeSingle();
      if (existing) {
        await client
          .from("message_reactions")
          .delete()
          .eq("message_id", id)
          .eq("user_id", userId)
          .eq("emoji", emoji);
        return json({ ok: true, state: "removed" });
      }
      await client
        .from("message_reactions")
        .insert({ message_id: id, user_id: userId, emoji });
      return json({ ok: true, state: "added" });
    }

    // ════════════════ Communities ════════════════
    if (path === "/communities" && req.method === "GET") {
      const { data: mems, error } = await client
        .from("community_members")
        .select("community_id, role")
        .eq("user_id", userId);
      if (error) return json({ error: error.message }, 400);
      const ids = (mems ?? []).map((r: any) => r.community_id);
      if (ids.length === 0) return json({ communities: [] });
      const { data: comms } = await client
        .from("communities")
        .select("*")
        .in("id", ids);
      const { data: counts } = await admin()
        .from("community_members")
        .select("community_id")
        .in("community_id", ids);
      const countMap = new Map<string, number>();
      (counts ?? []).forEach((r: any) =>
        countMap.set(r.community_id, (countMap.get(r.community_id) ?? 0) + 1),
      );
      const roleMap = new Map<string, string>();
      (mems ?? []).forEach((r: any) => roleMap.set(r.community_id, r.role));
      const out = (comms ?? []).map((c: any) => ({
        ...c,
        role: roleMap.get(c.id),
        member_count: countMap.get(c.id) ?? 0,
      }));
      return json({ communities: out });
    }

    if (path === "/communities" && req.method === "POST") {
      const { name, icon_url = null } = await req.json();
      if (!name) return json({ error: "name required" }, 400);
      const { data, error } = await client.rpc("create_community", {
        _name: name,
        _icon_url: icon_url,
      });
      if (error) return json({ error: error.message }, 400);
      return json({ community_id: data });
    }

    if (path === "/communities/join" && req.method === "POST") {
      const { invite_code } = await req.json();
      if (!invite_code) return json({ error: "invite_code required" }, 400);
      const { data, error } = await client.rpc("join_community_by_code", {
        _code: invite_code,
      });
      if (error) return json({ error: error.message }, 400);
      return json({ community_id: data });
    }

    m = path.match(/^\/communities\/([0-9a-f-]{36})$/);
    if (m && req.method === "GET") {
      const cid = m[1];
      const { data: comm, error } = await client
        .from("communities")
        .select("*")
        .eq("id", cid)
        .maybeSingle();
      if (error) return json({ error: error.message }, 400);
      if (!comm) return json({ error: "not found" }, 404);
      const { data: channels } = await client
        .from("community_channels")
        .select("*")
        .eq("community_id", cid)
        .order("position", { ascending: true });
      const { data: members } = await client
        .from("community_members")
        .select("*")
        .eq("community_id", cid);
      const memberIds = (members ?? []).map((r: any) => r.user_id);
      const { data: profs } = await client
        .from("profiles")
        .select(PROFILE_COLS)
        .in("user_id", memberIds);
      return json({ community: comm, channels: channels ?? [], members: members ?? [], profiles: profs ?? [] });
    }

    m = path.match(/^\/communities\/([0-9a-f-]{36})\/channels$/);
    if (m && req.method === "GET") {
      const cid = m[1];
      const { data, error } = await client
        .from("community_channels")
        .select("*")
        .eq("community_id", cid)
        .order("position", { ascending: true });
      if (error) return json({ error: error.message }, 400);
      return json({ channels: data ?? [] });
    }
    if (m && req.method === "POST") {
      const cid = m[1];
      const { name, kind = "text" } = await req.json();
      if (!name) return json({ error: "name required" }, 400);
      if (!["text", "voice"].includes(kind)) return json({ error: "kind must be text|voice" }, 400);
      const { data: maxRow } = await client
        .from("community_channels")
        .select("position")
        .eq("community_id", cid)
        .order("position", { ascending: false })
        .limit(1)
        .maybeSingle();
      const position = ((maxRow?.position as number | undefined) ?? -1) + 1;
      const { data, error } = await client
        .from("community_channels")
        .insert({ community_id: cid, name, kind, position })
        .select("*")
        .single();
      if (error) return json({ error: error.message }, 400);
      return json({ channel: data });
    }

    m = path.match(/^\/communities\/([0-9a-f-]{36})\/leave$/);
    if (m && req.method === "POST") {
      const cid = m[1];
      const { error } = await client
        .from("community_members")
        .delete()
        .eq("community_id", cid)
        .eq("user_id", userId);
      if (error) return json({ error: error.message }, 400);
      return json({ ok: true });
    }

    m = path.match(/^\/communities\/([0-9a-f-]{36})\/invite\/regenerate$/);
    if (m && req.method === "POST") {
      const cid = m[1];
      const { data, error } = await client.rpc("regenerate_invite_code", { _cid: cid });
      if (error) return json({ error: error.message }, 400);
      return json({ invite_code: data });
    }

    // ════════════════ Community channel messages ════════════════
    m = path.match(/^\/channels\/([0-9a-f-]{36})\/messages$/);
    if (m && req.method === "GET") {
      const chid = m[1];
      const limit = Math.min(Number(url.searchParams.get("limit") ?? 50), 200);
      const before = url.searchParams.get("before");
      let q = client
        .from("community_messages")
        .select("*, attachments:community_message_attachments(*), reactions:community_message_reactions(*)")
        .eq("channel_id", chid)
        .order("created_at", { ascending: false })
        .limit(limit);
      if (before) q = q.lt("created_at", before);
      const { data, error } = await q;
      if (error) return json({ error: error.message }, 400);
      return json({ messages: (data ?? []).slice().reverse() });
    }
    if (m && req.method === "POST") {
      const chid = m[1];
      const body = await req.json();
      const content: string | null = body.content ?? null;
      const reply_to_id: string | null = body.reply_to_id ?? null;
      const attachments: any[] = Array.isArray(body.attachments) ? body.attachments : [];
      if (!content && attachments.length === 0) return json({ error: "content or attachments required" }, 400);
      const { data: msg, error } = await client
        .from("community_messages")
        .insert({ channel_id: chid, sender_id: userId, content, reply_to_id })
        .select("*")
        .single();
      if (error || !msg) return json({ error: error?.message ?? "send failed" }, 400);
      if (attachments.length > 0) {
        const rows = attachments.map((a) => ({
          message_id: msg.id,
          kind: a.kind ?? "file",
          external_url: a.external_url ?? null,
          storage_path: a.storage_path ?? null,
          mime_type: a.mime_type ?? null,
          file_name: a.file_name ?? null,
          size_bytes: a.size_bytes ?? null,
          width: a.width ?? null,
          height: a.height ?? null,
        }));
        const { error: aErr } = await client.from("community_message_attachments").insert(rows);
        if (aErr) return json({ error: aErr.message }, 400);
      }
      return json({ message: msg });
    }

    m = path.match(/^\/community-messages\/([0-9a-f-]{36})$/);
    if (m && req.method === "PATCH") {
      const id = m[1];
      const { content } = await req.json();
      if (typeof content !== "string") return json({ error: "content required" }, 400);
      const { error } = await client.from("community_messages").update({ content }).eq("id", id);
      if (error) return json({ error: error.message }, 400);
      return json({ ok: true });
    }
    if (m && req.method === "DELETE") {
      const id = m[1];
      const { error } = await client
        .from("community_messages")
        .update({ deleted_at: new Date().toISOString(), content: null })
        .eq("id", id);
      if (error) return json({ error: error.message }, 400);
      return json({ ok: true });
    }

    m = path.match(/^\/community-messages\/([0-9a-f-]{36})\/reactions$/);
    if (m && req.method === "POST") {
      const id = m[1];
      const { emoji, action = "toggle" } = await req.json();
      if (!emoji) return json({ error: "emoji required" }, 400);
      if (action === "remove") {
        await client.from("community_message_reactions").delete()
          .eq("message_id", id).eq("user_id", userId).eq("emoji", emoji);
        return json({ ok: true });
      }
      if (action === "add") {
        await client.from("community_message_reactions")
          .insert({ message_id: id, user_id: userId, emoji });
        return json({ ok: true });
      }
      const { data: existing } = await client.from("community_message_reactions")
        .select("emoji").eq("message_id", id).eq("user_id", userId).eq("emoji", emoji).maybeSingle();
      if (existing) {
        await client.from("community_message_reactions").delete()
          .eq("message_id", id).eq("user_id", userId).eq("emoji", emoji);
        return json({ ok: true, state: "removed" });
      }
      await client.from("community_message_reactions")
        .insert({ message_id: id, user_id: userId, emoji });
      return json({ ok: true, state: "added" });
    }

    // ════════════════ Voice (calls) ════════════════
    if (path === "/calls/active" && req.method === "GET") {
      const conv = url.searchParams.get("conversation_id");
      const ch = url.searchParams.get("channel_id");
      if (!conv && !ch) return json({ error: "conversation_id or channel_id required" }, 400);
      let q = client.from("call_sessions").select("*").is("ended_at", null);
      if (conv) q = q.eq("conversation_id", conv);
      if (ch) q = q.eq("channel_id", ch);
      const { data: sessions, error } = await q.order("started_at", { ascending: false }).limit(1);
      if (error) return json({ error: error.message }, 400);
      const session = (sessions ?? [])[0] ?? null;
      if (!session) return json({ session: null, participants: [], profiles: [] });
      const { data: parts } = await client
        .from("call_participants")
        .select("*")
        .eq("call_id", session.id)
        .is("left_at", null);
      const ids = (parts ?? []).map((p: any) => p.user_id);
      const { data: profs } = await client
        .from("profiles")
        .select(PROFILE_COLS)
        .in("user_id", ids);
      return json({ session, participants: parts ?? [], profiles: profs ?? [] });
    }

    if (path === "/calls/start" && req.method === "POST") {
      const { conversation_id = null, channel_id = null } = await req.json();
      if (!conversation_id && !channel_id) return json({ error: "conversation_id or channel_id required" }, 400);
      // Reuse existing open session if any
      let q = client.from("call_sessions").select("*").is("ended_at", null);
      if (conversation_id) q = q.eq("conversation_id", conversation_id);
      if (channel_id) q = q.eq("channel_id", channel_id);
      const { data: existing } = await q.limit(1).maybeSingle();
      if (existing) return json({ call_id: existing.id, reused: true });
      const { data, error } = await client
        .from("call_sessions")
        .insert({ conversation_id, channel_id, started_by: userId })
        .select("*")
        .single();
      if (error) return json({ error: error.message }, 400);
      return json({ call_id: data.id, reused: false });
    }

    m = path.match(/^\/calls\/([0-9a-f-]{36})\/join$/);
    if (m && req.method === "POST") {
      const call_id = m[1];
      const { peer_id } = await req.json();
      if (!peer_id) return json({ error: "peer_id required" }, 400);
      // Upsert by (call_id, user_id)
      await client.from("call_participants").delete()
        .eq("call_id", call_id).eq("user_id", userId);
      const { error } = await client.from("call_participants")
        .insert({ call_id, user_id: userId, peer_id });
      if (error) return json({ error: error.message }, 400);
      return json({ ok: true });
    }

    m = path.match(/^\/calls\/([0-9a-f-]{36})\/leave$/);
    if (m && req.method === "POST") {
      const call_id = m[1];
      const { error } = await client.from("call_participants")
        .update({ left_at: new Date().toISOString() })
        .eq("call_id", call_id).eq("user_id", userId);
      if (error) return json({ error: error.message }, 400);
      return json({ ok: true });
    }

    m = path.match(/^\/calls\/([0-9a-f-]{36})\/heartbeat$/);
    if (m && req.method === "POST") {
      const call_id = m[1];
      const { error } = await client.from("call_participants")
        .update({ last_seen_at: new Date().toISOString() })
        .eq("call_id", call_id).eq("user_id", userId);
      if (error) return json({ error: error.message }, 400);
      return json({ ok: true });
    }

    if (path === "/presence/vc" && req.method === "POST") {
      const body = await req.json().catch(() => ({}));
      const patch: Record<string, unknown> = {
        user_id: userId,
        vc_call_id: body.call_id ?? null,
        vc_channel_id: body.channel_id ?? null,
        vc_conversation_id: body.conversation_id ?? null,
        vc_speaking: !!body.speaking,
        vc_joined_at: body.call_id ? new Date().toISOString() : null,
        last_seen_at: new Date().toISOString(),
        last_active_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      const { error } = await client.from("user_presence").upsert(patch, { onConflict: "user_id" });
      if (error) return json({ error: error.message }, 400);
      return json({ ok: true });
    }

    // ════════════════ Friends + presence ════════════════
    if (path === "/friends" && req.method === "GET") {
      const { data: rows, error } = await client
        .from("rubix_friendships")
        .select("*")
        .eq("status", "accepted");
      if (error) return json({ error: error.message }, 400);
      const otherIds = (rows ?? []).map((r: any) => (r.user_a === userId ? r.user_b : r.user_a));
      const { data: profs } = await client
        .from("profiles")
        .select(PROFILE_COLS)
        .in("user_id", otherIds);
      return json({ friends: profs ?? [] });
    }

    if (path === "/presence" && req.method === "GET") {
      const idsParam = url.searchParams.get("ids") ?? "";
      const ids = idsParam.split(",").map((s) => s.trim()).filter(Boolean);
      if (ids.length === 0) return json({ presence: [] });
      const { data, error } = await client.rpc("get_friend_presence", { _uids: ids });
      if (error) return json({ error: error.message }, 400);
      return json({ presence: data ?? [] });
    }

    // ════════════════ Single message + threads ════════════════
    // Tries DM messages first, then community_messages.
    m = path.match(/^\/messages\/([0-9a-f-]{36})$/);
    if (m && req.method === "GET") {
      const id = m[1];
      const { data: dm } = await client
        .from("messages")
        .select("*, attachments:message_attachments(*), reactions:message_reactions(*)")
        .eq("id", id)
        .maybeSingle();
      if (dm) {
        const { count } = await client
          .from("messages")
          .select("id", { count: "exact", head: true })
          .eq("reply_to_id", id);
        return json({ message: { ...dm, thread_count: count ?? 0, scope: "dm" } });
      }
      const { data: cm } = await client
        .from("community_messages")
        .select("*, attachments:community_message_attachments(*), reactions:community_message_reactions(*)")
        .eq("id", id)
        .maybeSingle();
      if (cm) {
        const { count } = await client
          .from("community_messages")
          .select("id", { count: "exact", head: true })
          .eq("reply_to_id", id);
        return json({ message: { ...cm, thread_count: count ?? 0, scope: "community" } });
      }
      return json({ error: "not found" }, 404);
    }

    m = path.match(/^\/messages\/([0-9a-f-]{36})\/thread$/);
    if (m && req.method === "GET") {
      const id = m[1];
      // DM
      const { data: root } = await client
        .from("messages")
        .select("*, attachments:message_attachments(*), reactions:message_reactions(*)")
        .eq("id", id)
        .maybeSingle();
      if (root) {
        const { data: replies } = await client
          .from("messages")
          .select("*, attachments:message_attachments(*), reactions:message_reactions(*)")
          .eq("reply_to_id", id)
          .order("created_at", { ascending: true });
        return json({ root, replies: replies ?? [], scope: "dm" });
      }
      const { data: croot } = await client
        .from("community_messages")
        .select("*, attachments:community_message_attachments(*), reactions:community_message_reactions(*)")
        .eq("id", id)
        .maybeSingle();
      if (croot) {
        const { data: replies } = await client
          .from("community_messages")
          .select("*, attachments:community_message_attachments(*), reactions:community_message_reactions(*)")
          .eq("reply_to_id", id)
          .order("created_at", { ascending: true });
        return json({ root: croot, replies: replies ?? [], scope: "community" });
      }
      return json({ error: "not found" }, 404);
    }

    // Reply within the same conversation/channel as the parent.
    m = path.match(/^\/messages\/([0-9a-f-]{36})\/replies$/);
    if (m && req.method === "POST") {
      const parentId = m[1];
      const body = await req.json().catch(() => ({}));
      const content: string | null = body.content ?? null;
      const attachments: any[] = Array.isArray(body.attachments) ? body.attachments : [];
      if (!content && attachments.length === 0) {
        return json({ error: "content or attachments required" }, 400);
      }
      // Resolve parent scope
      const { data: dmParent } = await client
        .from("messages")
        .select("id, conversation_id")
        .eq("id", parentId)
        .maybeSingle();
      if (dmParent) {
        const { data: msg, error } = await client
          .from("messages")
          .insert({
            conversation_id: dmParent.conversation_id,
            sender_id: userId,
            content,
            reply_to_id: parentId,
          })
          .select("*")
          .single();
        if (error || !msg) return json({ error: error?.message ?? "send failed" }, 400);
        if (attachments.length > 0) {
          const rows = attachments.map((a) => ({
            message_id: msg.id,
            kind: a.kind ?? "file",
            external_url: a.external_url ?? null,
            storage_path: a.storage_path ?? null,
            mime_type: a.mime_type ?? null,
            file_name: a.file_name ?? null,
            size_bytes: a.size_bytes ?? null,
            width: a.width ?? null,
            height: a.height ?? null,
          }));
          const { error: aErr } = await client.from("message_attachments").insert(rows);
          if (aErr) return json({ error: aErr.message }, 400);
        }
        return json({ message: { ...msg, scope: "dm" } });
      }
      const { data: cParent } = await client
        .from("community_messages")
        .select("id, channel_id")
        .eq("id", parentId)
        .maybeSingle();
      if (cParent) {
        const { data: msg, error } = await client
          .from("community_messages")
          .insert({
            channel_id: cParent.channel_id,
            sender_id: userId,
            content,
            reply_to_id: parentId,
          })
          .select("*")
          .single();
        if (error || !msg) return json({ error: error?.message ?? "send failed" }, 400);
        if (attachments.length > 0) {
          const rows = attachments.map((a) => ({
            message_id: msg.id,
            kind: a.kind ?? "file",
            external_url: a.external_url ?? null,
            storage_path: a.storage_path ?? null,
            mime_type: a.mime_type ?? null,
            file_name: a.file_name ?? null,
            size_bytes: a.size_bytes ?? null,
            width: a.width ?? null,
            height: a.height ?? null,
          }));
          const { error: aErr } = await client.from("community_message_attachments").insert(rows);
          if (aErr) return json({ error: aErr.message }, 400);
        }
        return json({ message: { ...msg, scope: "community" } });
      }
      return json({ error: "parent message not found" }, 404);
    }

    // ════════════════ Signed uploads (chat-attachments bucket) ════════════════
    if (path === "/uploads/sign" && req.method === "POST") {
      const body = await req.json().catch(() => ({}));
      const filename: string = (body.filename ?? "file").toString();
      const mime: string | null = body.mime ?? null;
      const size: number | null =
        typeof body.size === "number" ? body.size : null;
      const MAX = 50 * 1024 * 1024;
      if (size !== null && size > MAX) {
        return json({ error: "file too large (max 50MB)" }, 400);
      }
      const safe = filename.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 80);
      const path = `${userId}/${crypto.randomUUID()}-${safe}`;
      const { data, error } = await admin()
        .storage.from("chat-attachments")
        .createSignedUploadUrl(path);
      if (error || !data) {
        return json({ error: error?.message ?? "sign failed" }, 400);
      }
      const upload_url = data.signedUrl.startsWith("http")
        ? data.signedUrl
        : `${SUPABASE_URL}${data.signedUrl}`;
      return json({
        bucket: "chat-attachments",
        storage_path: path,
        token: data.token,
        upload_url,
        headers: mime ? { "Content-Type": mime } : {},
        // chat-attachments is private; clients should request signed read URLs
        // via the existing get-signed-url flow, or use storage.from().createSignedUrl(path).
        public_url: null,
      });
    }

    // ════════════════ OG link preview ════════════════
    if (path === "/link-preview" && req.method === "GET") {
      const target = url.searchParams.get("url") ?? "";
      try {
        const u = new URL(target);
        if (!["http:", "https:"].includes(u.protocol)) throw new Error("bad protocol");

        // SSRF guard: reject loopback, link-local, private, and cloud-metadata hosts
        const host = u.hostname.toLowerCase();
        const BLOCKED_HOSTS = new Set([
          "localhost", "metadata.google.internal", "metadata.goog",
        ]);
        if (BLOCKED_HOSTS.has(host)) throw new Error("blocked host");
        const BLOCKED_IP = /^(127\.|10\.|192\.168\.|169\.254\.|0\.|::1$|fc|fd|fe80:|fe[89ab]:)/i;
        const BLOCKED_172 = /^172\.(1[6-9]|2\d|3[01])\./;
        const isIpish = /^[0-9a-f:.]+$/i.test(host);
        if (isIpish && (BLOCKED_IP.test(host) || BLOCKED_172.test(host))) {
          throw new Error("blocked address");
        }
        try {
          const ips = await Deno.resolveDns(host, "A").catch(() => [] as string[]);
          if (ips.some((ip) => BLOCKED_IP.test(ip) || BLOCKED_172.test(ip))) {
            throw new Error("blocked address");
          }
        } catch (_) { /* DNS not permitted in sandbox is ok */ }

        const ctl = new AbortController();
        const tmo = setTimeout(() => ctl.abort(), 5000);
        const res = await fetch(u.toString(), {
          redirect: "follow",
          signal: ctl.signal,
          headers: {
            "User-Agent": "RubixLinkPreview/1.0 (+https://rubix.app)",
            "Accept": "text/html,application/xhtml+xml",
          },
        });
        clearTimeout(tmo);

        const html = (await res.text()).slice(0, 200_000);
        const pick = (re: RegExp) => {
          const m = html.match(re);
          return m ? m[1].trim() : null;
        };
        const meta = (prop: string) =>
          pick(
            new RegExp(
              `<meta[^>]+(?:property|name)=["']${prop}["'][^>]+content=["']([^"']+)["']`,
              "i",
            ),
          ) ??
          pick(
            new RegExp(
              `<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']${prop}["']`,
              "i",
            ),
          );
        const title =
          meta("og:title") ?? meta("twitter:title") ?? pick(/<title[^>]*>([^<]+)<\/title>/i);
        const description =
          meta("og:description") ?? meta("twitter:description") ?? meta("description");
        let image = meta("og:image") ?? meta("twitter:image");
        if (image && image.startsWith("//")) image = u.protocol + image;
        if (image && image.startsWith("/")) image = `${u.protocol}//${u.host}${image}`;
        const site = meta("og:site_name") ?? u.host;
        return json({ url: u.toString(), title, description, image, site });
      } catch (e) {
        return json({ error: e instanceof Error ? e.message : "preview failed" }, 400);
      }
    }

    return json({ error: "not found" }, 404);
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
