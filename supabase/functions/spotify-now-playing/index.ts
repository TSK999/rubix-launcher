// Returns the currently-playing track for a given user_id (defaults to caller).
// Refreshes the access token automatically if expired.
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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const userIds: string[] = Array.isArray(body.user_ids) ? body.user_ids : [];
    if (userIds.length === 0) {
      return json({ tracks: {} });
    }

    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const { data: conns, error } = await admin
      .from("spotify_connections")
      .select("user_id, access_token, refresh_token, expires_at")
      .in("user_id", userIds);

    if (error) throw error;

    const result: Record<string, unknown> = {};

    for (const conn of conns ?? []) {
      let accessToken = conn.access_token as string;
      const expiresAt = new Date(conn.expires_at as string).getTime();

      // Refresh if token expires within 60s
      if (expiresAt - Date.now() < 60_000) {
        const refreshed = await refreshToken(conn.refresh_token as string);
        if (!refreshed) {
          result[conn.user_id as string] = null;
          continue;
        }
        accessToken = refreshed.access_token;
        await admin
          .from("spotify_connections")
          .update({
            access_token: refreshed.access_token,
            expires_at: new Date(Date.now() + refreshed.expires_in * 1000).toISOString(),
            ...(refreshed.refresh_token ? { refresh_token: refreshed.refresh_token } : {}),
          })
          .eq("user_id", conn.user_id);
      }

      const trackRes = await fetch(
        "https://api.spotify.com/v1/me/player/currently-playing",
        { headers: { Authorization: `Bearer ${accessToken}` } },
      );

      if (trackRes.status === 204 || trackRes.status === 202) {
        // Nothing playing → fall back to most recent
        const recent = await fetch(
          "https://api.spotify.com/v1/me/player/recently-played?limit=1",
          { headers: { Authorization: `Bearer ${accessToken}` } },
        );
        if (recent.ok) {
          const data = await recent.json();
          const item = data.items?.[0]?.track;
          if (item) {
            result[conn.user_id as string] = {
              is_playing: false,
              name: item.name,
              artists: item.artists?.map((a: { name: string }) => a.name).join(", "),
              album_art: item.album?.images?.[0]?.url,
              url: item.external_urls?.spotify,
              played_at: data.items?.[0]?.played_at,
            };
            continue;
          }
        }
        result[conn.user_id as string] = null;
        continue;
      }

      if (!trackRes.ok) {
        console.error("Track fetch failed", await trackRes.text());
        result[conn.user_id as string] = null;
        continue;
      }

      const data = await trackRes.json();
      const item = data.item;
      if (!item) {
        result[conn.user_id as string] = null;
        continue;
      }

      result[conn.user_id as string] = {
        is_playing: data.is_playing,
        name: item.name,
        artists: item.artists?.map((a: { name: string }) => a.name).join(", "),
        album_art: item.album?.images?.[0]?.url,
        url: item.external_urls?.spotify,
        progress_ms: data.progress_ms,
        duration_ms: item.duration_ms,
      };
    }

    return json({ tracks: result });
  } catch (e) {
    console.error("spotify-now-playing error", e);
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
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token,
    }),
  });
  if (!res.ok) {
    console.error("Refresh failed", await res.text());
    return null;
  }
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
