// Authenticated playback control proxy for the current user's Spotify account.
// Actions: play, pause, next, previous, volume, seek
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const SPOTIFY_CLIENT_ID = Deno.env.get("SPOTIFY_CLIENT_ID")!;
const SPOTIFY_CLIENT_SECRET = Deno.env.get("SPOTIFY_CLIENT_SECRET")!;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

type Action = "play" | "pause" | "next" | "previous" | "volume" | "seek";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }
  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Not authenticated" }, 401);

    const supa = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userError } = await supa.auth.getUser();
    if (userError || !userData.user) {
      return json({ error: "Not authenticated" }, 401);
    }

    const body = await req.json().catch(() => ({}));
    const action = body.action as Action;
    if (!action) return json({ error: "Missing action" }, 400);

    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const { data: conn, error: connError } = await admin
      .from("spotify_connections")
      .select("access_token, refresh_token, expires_at")
      .eq("user_id", userData.user.id)
      .maybeSingle();
    if (connError || !conn) return json({ error: "Spotify not linked" }, 404);

    let accessToken = conn.access_token as string;
    const expiresAt = new Date(conn.expires_at as string).getTime();
    if (expiresAt - Date.now() < 60_000) {
      const refreshed = await refreshToken(conn.refresh_token as string);
      if (!refreshed) return json({ error: "Token refresh failed" }, 401);
      accessToken = refreshed.access_token;
      await admin
        .from("spotify_connections")
        .update({
          access_token: refreshed.access_token,
          expires_at: new Date(Date.now() + refreshed.expires_in * 1000).toISOString(),
          ...(refreshed.refresh_token ? { refresh_token: refreshed.refresh_token } : {}),
        })
        .eq("user_id", userData.user.id);
    }

    let url = "";
    let method: "PUT" | "POST" = "PUT";
    switch (action) {
      case "play":
        url = "https://api.spotify.com/v1/me/player/play";
        method = "PUT";
        break;
      case "pause":
        url = "https://api.spotify.com/v1/me/player/pause";
        method = "PUT";
        break;
      case "next":
        url = "https://api.spotify.com/v1/me/player/next";
        method = "POST";
        break;
      case "previous":
        url = "https://api.spotify.com/v1/me/player/previous";
        method = "POST";
        break;
      case "volume": {
        const vol = Math.max(0, Math.min(100, Number(body.volume_percent ?? 50)));
        url = `https://api.spotify.com/v1/me/player/volume?volume_percent=${vol}`;
        method = "PUT";
        break;
      }
      case "seek": {
        const pos = Math.max(0, Number(body.position_ms ?? 0));
        url = `https://api.spotify.com/v1/me/player/seek?position_ms=${pos}`;
        method = "PUT";
        break;
      }
      default:
        return json({ error: "Unknown action" }, 400);
    }

    const res = await fetch(url, {
      method,
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (res.status === 204) return json({ ok: true });
    if (res.status === 404) {
      return json({ error: "No active Spotify device. Open Spotify on a device first." }, 404);
    }
    if (res.status === 403) {
      return json({ error: "Spotify Premium required for playback control." }, 403);
    }
    if (!res.ok) {
      const text = await res.text();
      console.error("Spotify control failed", res.status, text);
      return json({ error: text || "Spotify request failed" }, res.status);
    }
    return json({ ok: true });
  } catch (e) {
    console.error("spotify-control error", e);
    return json({ error: String(e) }, 500);
  }
});

async function refreshToken(refresh_token: string) {
  const res = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization:
        "Basic " + btoa(`${SPOTIFY_CLIENT_ID}:${SPOTIFY_CLIENT_SECRET}`),
    },
    body: new URLSearchParams({ grant_type: "refresh_token", refresh_token }),
  });
  if (!res.ok) return null;
  return await res.json() as {
    access_token: string;
    expires_in: number;
    refresh_token?: string;
  };
}

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
