// Steam library import edge function
// - POST with { steamId } -> returns owned games list (id, name, playtime, cover)
// - POST with { steamId, appIds: number[] } -> returns full details for those apps

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const requireAuth = async (req: Request) => {
  const authHeader = req.headers.get("Authorization") ?? "";
  if (!authHeader.startsWith("Bearer ")) return false;
  const sb = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
  );
  const { data, error } = await sb.auth.getUser(authHeader.replace("Bearer ", ""));
  return !error && !!data?.user;
};

type OwnedGame = {
  appid: number;
  name: string;
  playtime_forever: number; // minutes
  rtime_last_played?: number; // unix seconds
  img_icon_url?: string;
};

const coverUrl = (appid: number) =>
  `https://steamcdn-a.akamaihd.net/steam/apps/${appid}/library_600x900.jpg`;
const headerUrl = (appid: number) =>
  `https://steamcdn-a.akamaihd.net/steam/apps/${appid}/header.jpg`;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  if (!(await requireAuth(req))) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {

    const STEAM_API_KEY = Deno.env.get("STEAM_API_KEY");
    if (!STEAM_API_KEY) {
      return new Response(
        JSON.stringify({ error: "STEAM_API_KEY is not configured" }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    const body = await req.json().catch(() => ({}));
    const steamId: string | undefined = body?.steamId?.toString().trim();
    const appIds: number[] | undefined = Array.isArray(body?.appIds)
      ? body.appIds.map((n: unknown) => Number(n)).filter((n: number) => Number.isFinite(n))
      : undefined;

    if (!steamId || !/^\d{17}$/.test(steamId)) {
      return new Response(
        JSON.stringify({
          error: "Invalid steamId. Provide a 17-digit SteamID64.",
        }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    // 1. Fetch owned games
    const ownedUrl = new URL(
      "https://api.steampowered.com/IPlayerService/GetOwnedGames/v1/",
    );
    ownedUrl.searchParams.set("key", STEAM_API_KEY);
    ownedUrl.searchParams.set("steamid", steamId);
    ownedUrl.searchParams.set("include_appinfo", "true");
    ownedUrl.searchParams.set("include_played_free_games", "true");
    ownedUrl.searchParams.set("format", "json");

    const ownedRes = await fetch(ownedUrl.toString());
    if (!ownedRes.ok) {
      const text = await ownedRes.text();
      console.error(`Steam GetOwnedGames failed [${ownedRes.status}]: ${text.slice(0, 500)}`);
      return new Response(
        JSON.stringify({ error: "Unable to fetch your Steam library. Please try again." }),
        {
          status: 502,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }
    const ownedJson = await ownedRes.json();
    const games: OwnedGame[] = ownedJson?.response?.games ?? [];

    if (games.length === 0) {
      return new Response(
        JSON.stringify({
          games: [],
          warning:
            "No games returned. Make sure your Steam profile and game details are set to Public.",
        }),
        {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    // List mode: return summary for selection UI
    if (!appIds || appIds.length === 0) {
      const list = games
        .map((g) => ({
          appId: g.appid,
          title: g.name,
          cover: coverUrl(g.appid),
          header: headerUrl(g.appid),
          playtimeMinutes: g.playtime_forever ?? 0,
          lastPlayedAt: g.rtime_last_played
            ? g.rtime_last_played * 1000
            : undefined,
          launchPath: `steam://rungameid/${g.appid}`,
        }))
        .sort((a, b) => b.playtimeMinutes - a.playtimeMinutes);

      return new Response(JSON.stringify({ games: list }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Detail mode: enrich selected apps with description/genre/developer from store API
    const wanted = new Set(appIds);
    const selected = games.filter((g) => wanted.has(g.appid));

    const detailed = await Promise.all(
      selected.map(async (g) => {
        let description: string | undefined;
        let genre: string | undefined;
        let developer: string | undefined;

        try {
          const detailRes = await fetch(
            `https://store.steampowered.com/api/appdetails?appids=${g.appid}&l=en&filters=basic,genres`,
          );
          if (detailRes.ok) {
            const detailJson = await detailRes.json();
            const data = detailJson?.[g.appid]?.data;
            if (data) {
              description = data.short_description;
              genre = data.genres?.[0]?.description;
              developer = data.developers?.[0];
            }
          }
        } catch (_e) {
          // store API is rate-limited; ignore enrichment errors
        }

        return {
          appId: g.appid,
          title: g.name,
          cover: coverUrl(g.appid),
          launchPath: `steam://rungameid/${g.appid}`,
          playtimeMinutes: g.playtime_forever ?? 0,
          lastPlayedAt: g.rtime_last_played
            ? g.rtime_last_played * 1000
            : undefined,
          description,
          genre,
          developer,
        };
      }),
    );

    return new Response(JSON.stringify({ games: detailed }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("steam-import error:", message);
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
