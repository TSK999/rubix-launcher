// RUBIX Accounts API
// Public endpoints for third-party apps to sign up / sign in / verify tokens
// against the RUBIX user database.
//
// Endpoints (POST JSON unless noted):
//   POST /rubix-accounts/signup        { email, password, username, display_name? }
//   POST /rubix-accounts/signin        { email, password }
//   POST /rubix-accounts/refresh       { refresh_token }
//   POST /rubix-accounts/signout       Authorization: Bearer <access_token>
//   GET  /rubix-accounts/me            Authorization: Bearer <access_token>
//   GET  /rubix-accounts/profile?username=foo
//
// All responses are JSON. CORS is open (*).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const anon = () => createClient(SUPABASE_URL, ANON_KEY);
const admin = () =>
  createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

const PROFILE_COLS =
  "id, user_id, username, display_name, avatar_url, bio, background_url, background_kind, privacy, pronouns, location, status_emoji, status_text";

const fetchProfileByUserId = async (userId: string) => {
  const { data } = await admin()
    .from("profiles")
    .select(PROFILE_COLS)
    .eq("user_id", userId)
    .maybeSingle();
  return data;
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const url = new URL(req.url);
  // path after the function name
  const path = url.pathname.replace(/^.*\/rubix-accounts/, "") || "/";

  try {
    // ---------- SIGNUP ----------
    if (path === "/signup" && req.method === "POST") {
      const { email, password, username, display_name } = await req.json();
      if (!email || !password || !username) {
        return json({ error: "email, password, username are required" }, 400);
      }
      if (!/^[a-zA-Z0-9_]{3,20}$/.test(username)) {
        return json(
          { error: "username must be 3-20 chars, letters/numbers/underscore" },
          400,
        );
      }

      const { data, error } = await anon().auth.signUp({
        email,
        password,
        options: {
          data: { username, display_name: display_name ?? username },
        },
      });
      if (error) return json({ error: error.message }, 400);

      return json({
        user: data.user,
        session: data.session,
        message: data.session
          ? "Account created and signed in."
          : "Account created. Verify your email to sign in.",
      });
    }

    // ---------- SIGNIN ----------
    if (path === "/signin" && req.method === "POST") {
      const { email, password } = await req.json();
      if (!email || !password) {
        return json({ error: "email and password are required" }, 400);
      }
      const { data, error } = await anon().auth.signInWithPassword({
        email,
        password,
      });
      if (error) return json({ error: error.message }, 401);
      const profile = data.user
        ? await fetchProfileByUserId(data.user.id)
        : null;
      return json({ session: data.session, user: data.user, profile });
    }

    // ---------- REFRESH ----------
    if (path === "/refresh" && req.method === "POST") {
      const { refresh_token } = await req.json();
      if (!refresh_token) return json({ error: "refresh_token required" }, 400);
      const { data, error } = await anon().auth.refreshSession({
        refresh_token,
      });
      if (error) return json({ error: error.message }, 401);
      return json({ session: data.session, user: data.user });
    }

    // ---------- SIGNOUT ----------
    if (path === "/signout" && req.method === "POST") {
      const auth = req.headers.get("Authorization") ?? "";
      const token = auth.replace(/^Bearer\s+/i, "");
      if (!token) return json({ error: "missing bearer token" }, 401);
      const client = createClient(SUPABASE_URL, ANON_KEY, {
        global: { headers: { Authorization: `Bearer ${token}` } },
      });
      await client.auth.signOut();
      return json({ ok: true });
    }

    // ---------- ME (verify token + get profile) ----------
    if (path === "/me" && req.method === "GET") {
      const auth = req.headers.get("Authorization") ?? "";
      const token = auth.replace(/^Bearer\s+/i, "");
      if (!token) return json({ error: "missing bearer token" }, 401);
      const { data, error } = await admin().auth.getUser(token);
      if (error || !data.user) return json({ error: "invalid token" }, 401);
      const profile = await fetchProfileByUserId(data.user.id);
      return json({ user: data.user, profile });
    }

    // ---------- PUBLIC PROFILE LOOKUP ----------
    if (path === "/profile" && req.method === "GET") {
      const username = url.searchParams.get("username");
      if (!username) return json({ error: "username required" }, 400);
      const { data, error } = await admin()
        .from("profiles")
        .select(PROFILE_COLS)
        .ilike("username", username)
        .maybeSingle();
      if (error) return json({ error: error.message }, 400);
      if (!data) return json({ error: "not found" }, 404);
      return json({ profile: data });
    }

    return json(
      {
        error: "not found",
        endpoints: [
          "POST /signup",
          "POST /signin",
          "POST /refresh",
          "POST /signout",
          "GET  /me",
          "GET  /profile?username=",
        ],
      },
      404,
    );
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
