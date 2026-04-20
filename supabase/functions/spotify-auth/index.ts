// Spotify OAuth flow: start (returns auth URL) and callback (exchanges code for tokens)
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const SPOTIFY_CLIENT_ID = Deno.env.get("SPOTIFY_CLIENT_ID")!;
const SPOTIFY_CLIENT_SECRET = Deno.env.get("SPOTIFY_CLIENT_SECRET")!;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

const SCOPES = [
  "user-read-email",
  "user-read-private",
  "user-read-currently-playing",
  "user-read-playback-state",
  "user-read-recently-played",
].join(" ");

const REDIRECT_URI = `${SUPABASE_URL}/functions/v1/spotify-auth/callback`;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const url = new URL(req.url);
  const path = url.pathname.split("/").pop();

  try {
    // ── Start OAuth: returns the Spotify authorize URL ─────────────────
    if (path === "start") {
      const authHeader = req.headers.get("Authorization");
      if (!authHeader) {
        return json({ error: "Not authenticated" }, 401);
      }
      const supa = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
        global: { headers: { Authorization: authHeader } },
      });
      const { data: userData, error: userError } = await supa.auth.getUser();
      if (userError || !userData.user) {
        return json({ error: "Not authenticated" }, 401);
      }

      const body = await req.json().catch(() => ({}));
      const returnTo = body.returnTo || "/";
      // state encodes user id + return path so callback can attribute tokens
      const state = btoa(JSON.stringify({ uid: userData.user.id, returnTo }));

      const params = new URLSearchParams({
        response_type: "code",
        client_id: SPOTIFY_CLIENT_ID,
        scope: SCOPES,
        redirect_uri: REDIRECT_URI,
        state,
        show_dialog: "true",
      });

      return json({ url: `https://accounts.spotify.com/authorize?${params}` });
    }

    // ── OAuth callback from Spotify ────────────────────────────────────
    if (path === "callback") {
      const code = url.searchParams.get("code");
      const stateRaw = url.searchParams.get("state");
      const errParam = url.searchParams.get("error");

      if (errParam || !code || !stateRaw) {
        return htmlRedirect(`/?spotify=error`);
      }

      let state: { uid: string; returnTo: string };
      try {
        state = JSON.parse(atob(stateRaw));
      } catch {
        return htmlRedirect(`/?spotify=error`);
      }

      // Exchange code for tokens
      const tokenRes = await fetch("https://accounts.spotify.com/api/token", {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Authorization:
            "Basic " +
            btoa(`${SPOTIFY_CLIENT_ID}:${SPOTIFY_CLIENT_SECRET}`),
        },
        body: new URLSearchParams({
          grant_type: "authorization_code",
          code,
          redirect_uri: REDIRECT_URI,
        }),
      });

      if (!tokenRes.ok) {
        console.error("Token exchange failed", await tokenRes.text());
        return htmlRedirect(`${state.returnTo}?spotify=error`);
      }

      const tokens = await tokenRes.json() as {
        access_token: string;
        refresh_token: string;
        expires_in: number;
        scope: string;
      };

      // Fetch profile
      const meRes = await fetch("https://api.spotify.com/v1/me", {
        headers: { Authorization: `Bearer ${tokens.access_token}` },
      });
      if (!meRes.ok) {
        console.error("Profile fetch failed", await meRes.text());
        return htmlRedirect(`${state.returnTo}?spotify=error`);
      }
      const me = await meRes.json();

      // Upsert connection using service role (we trust state.uid because only this fn knows the secret)
      const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
      const expiresAt = new Date(Date.now() + tokens.expires_in * 1000).toISOString();

      const { error: upsertError } = await admin
        .from("spotify_connections")
        .upsert(
          {
            user_id: state.uid,
            spotify_id: me.id,
            spotify_username: me.id,
            display_name: me.display_name ?? me.id,
            avatar_url: me.images?.[0]?.url ?? null,
            access_token: tokens.access_token,
            refresh_token: tokens.refresh_token,
            expires_at: expiresAt,
            scope: tokens.scope,
          },
          { onConflict: "user_id" },
        );

      if (upsertError) {
        console.error("Upsert failed", upsertError);
        return htmlRedirect(`${state.returnTo}?spotify=error`);
      }

      return htmlRedirect(`${state.returnTo}?spotify=linked`);
    }

    return json({ error: "Unknown path" }, 404);
  } catch (e) {
    console.error("spotify-auth error", e);
    return json({ error: String(e) }, 500);
  }
});

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function htmlRedirect(target: string) {
  // Spotify redirects the browser here directly; we bounce back to the app.
  // Use referer-derived origin if absolute URL not provided.
  const html = `<!doctype html><meta http-equiv="refresh" content="0;url=${target}"><script>location.replace(${JSON.stringify(target)})</script>`;
  return new Response(html, {
    status: 200,
    headers: { "Content-Type": "text/html" },
  });
}
