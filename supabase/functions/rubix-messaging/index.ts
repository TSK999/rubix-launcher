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
          "POST   /messages/:id/reactions { emoji, action }",
          "GET    /profiles/search?q=&limit=",
          "GET    /profiles?ids=...",
        ],
      });
    }

    const auth = await requireAuth(req);
    if ("error" in auth) return auth.error;
    const { userId, client } = auth;

    // ──────────────── Profiles ────────────────
    if (path === "/profiles/search" && req.method === "GET") {
      const q = (url.searchParams.get("q") ?? "").trim();
      const limit = Math.min(Number(url.searchParams.get("limit") ?? 10), 50);
      if (!q) return json({ profiles: [] });
      const { data, error } = await admin()
        .from("profiles")
        .select(PROFILE_COLS)
        .or(`username.ilike.%${q}%,display_name.ilike.%${q}%`)
        .limit(limit);
      if (error) return json({ error: error.message }, 400);
      return json({ profiles: (data ?? []).filter((p) => p.user_id !== userId) });
    }

    if (path === "/profiles" && req.method === "GET") {
      const idsParam = url.searchParams.get("ids") ?? "";
      const ids = idsParam.split(",").map((s) => s.trim()).filter(Boolean);
      if (ids.length === 0) return json({ profiles: [] });
      const { data, error } = await admin()
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
      const { data: profs } = await admin()
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
      const { data: profs } = await admin()
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

    return json({ error: "not found" }, 404);
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
