// Steam profile fetcher — returns player summary + recently played games.
// POST { steamId: string } -> { profile, recentGames }
//
// Steam Web API endpoints used:
//  - ISteamUser/GetPlayerSummaries/v2
//  - IPlayerService/GetRecentlyPlayedGames/v1 (may be private)
//  - IPlayerService/GetOwnedGames/v1 (for total games count, may be private)

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const STEAM_ID_RE = /^\d{17}$/;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const STEAM_API_KEY = Deno.env.get("STEAM_API_KEY");
    if (!STEAM_API_KEY) {
      return new Response(
        JSON.stringify({ error: "STEAM_API_KEY is not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const body = await req.json().catch(() => ({}));
    const steamId: string = String(body?.steamId ?? "").trim();
    const viewerSteamIdRaw: string = String(body?.viewerSteamId ?? "").trim();
    const viewerSteamId = STEAM_ID_RE.test(viewerSteamIdRaw) && viewerSteamIdRaw !== steamId
      ? viewerSteamIdRaw
      : undefined;

    if (!STEAM_ID_RE.test(steamId)) {
      return new Response(
        JSON.stringify({ error: "Invalid steamId (must be 17-digit SteamID64)" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    type OwnedGame = {
      appid: number;
      name?: string;
      playtime_forever?: number;
      img_icon_url?: string;
    };
    const fetchOwnedGames = async (sid: string): Promise<OwnedGame[]> => {
      const url =
        `https://api.steampowered.com/IPlayerService/GetOwnedGames/v1/` +
        `?key=${STEAM_API_KEY}&steamid=${sid}&include_appinfo=true&include_played_free_games=true&format=json`;
      const r = await fetch(url);
      if (!r.ok) return [];
      const j = await r.json();
      return (j?.response?.games ?? []) as OwnedGame[];
    };

    // 1) Player summary
    const psUrl =
      `https://api.steampowered.com/ISteamUser/GetPlayerSummaries/v2/` +
      `?key=${STEAM_API_KEY}&steamids=${steamId}`;
    const psRes = await fetch(psUrl);
    if (!psRes.ok) {
      const text = await psRes.text();
      return new Response(
        JSON.stringify({ error: `Steam GetPlayerSummaries failed [${psRes.status}]: ${text.slice(0, 200)}` }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }
    const psData = await psRes.json();
    const p = psData?.response?.players?.[0];
    if (!p) {
      return new Response(
        JSON.stringify({ error: "Steam profile not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const state = Number(p.personastate ?? 0);
    const gameId = p.gameid ? String(p.gameid) : undefined;
    const inGame = !!gameId;
    const status: "in-game" | "online" | "away" | "offline" =
      inGame ? "in-game" : state === 0 ? "offline" : state === 3 || state === 4 ? "away" : "online";

    const profile = {
      steamId,
      personaName: String(p.personaname ?? "Unknown"),
      realName: p.realname ? String(p.realname) : undefined,
      avatar: String(p.avatarfull ?? p.avatarmedium ?? p.avatar ?? ""),
      profileUrl: String(p.profileurl ?? `https://steamcommunity.com/profiles/${steamId}`),
      countryCode: p.loccountrycode ? String(p.loccountrycode) : undefined,
      personaState: state,
      status,
      gameId,
      gameName: p.gameextrainfo ? String(p.gameextrainfo) : undefined,
      lastLogoff: p.lastlogoff ? Number(p.lastlogoff) : undefined,
      timeCreated: p.timecreated ? Number(p.timecreated) : undefined,
      // 1=public, 2=friends-only, 3=private (legacy values, but still returned)
      communityVisibilityState: Number(p.communityvisibilitystate ?? 0),
    };

    // 2) Recently played (best-effort; private profiles return empty)
    let recentGames: Array<{
      appId: number;
      name: string;
      playtime2Weeks: number;
      playtimeForever: number;
      cover: string;
      header: string;
    }> = [];
    try {
      const rpUrl =
        `https://api.steampowered.com/IPlayerService/GetRecentlyPlayedGames/v1/` +
        `?key=${STEAM_API_KEY}&steamid=${steamId}&count=8`;
      const rpRes = await fetch(rpUrl);
      if (rpRes.ok) {
        const rpData = await rpRes.json();
        const games = rpData?.response?.games ?? [];
        recentGames = games.map((g: Record<string, unknown>) => {
          const appid = Number(g.appid);
          return {
            appId: appid,
            name: String(g.name ?? `App ${appid}`),
            playtime2Weeks: Number(g.playtime_2weeks ?? 0),
            playtimeForever: Number(g.playtime_forever ?? 0),
            cover: `https://steamcdn-a.akamaihd.net/steam/apps/${appid}/library_600x900.jpg`,
            header: `https://steamcdn-a.akamaihd.net/steam/apps/${appid}/header.jpg`,
          };
        });
      }
    } catch {
      /* ignore — recently played is optional */
    }

    // 3) Equipped profile background (best-effort)
    let profileBackground: { image?: string; movie?: string } | undefined;
    try {
      const piUrl =
        `https://api.steampowered.com/IPlayerService/GetProfileItemsEquipped/v1/` +
        `?key=${STEAM_API_KEY}&steamid=${steamId}`;
      const piRes = await fetch(piUrl);
      if (piRes.ok) {
        const piData = await piRes.json();
        // Prefer animated mini-profile bg if present, fallback to profile_background
        const bg =
          piData?.response?.profile_background ??
          piData?.response?.mini_profile_background;
        const filename = bg?.image_large as string | undefined;
        const movie = bg?.movie as string | undefined;
        const toSteamItemUrl = (path?: string) => {
          if (!path) return undefined;
          if (/^https?:\/\//.test(path)) return path;
          const normalized = path.replace(/^\/+/, "");
          return `https://cdn.akamai.steamstatic.com/steamcommunity/public/images/${normalized}`;
        };
        if (filename || movie) {
          profileBackground = {
            image: toSteamItemUrl(filename),
            movie: toSteamItemUrl(movie),
          };
        }
      }
    } catch {
      /* ignore — backgrounds are optional */
    }

    // 4) Owned games (target user) — used for total + games-in-common
    let totalGames: number | undefined;
    let targetOwned: OwnedGame[] = [];
    try {
      targetOwned = await fetchOwnedGames(steamId);
      totalGames = targetOwned.length || undefined;
    } catch {
      /* ignore */
    }

    // 5) Games in common (best-effort, requires both profiles to expose game details)
    let gamesInCommon: Array<{ appId: number; name: string; header: string; icon?: string; playtimeForever: number }> | undefined;
    let gamesInCommonCount: number | undefined;
    if (viewerSteamId && targetOwned.length > 0) {
      try {
        const viewerOwned = await fetchOwnedGames(viewerSteamId);
        if (viewerOwned.length > 0) {
          const viewerSet = new Set(viewerOwned.map((g) => g.appid));
          const targetMap = new Map(targetOwned.map((g) => [g.appid, g]));
          const intersection = targetOwned.filter((g) => viewerSet.has(g.appid));
          gamesInCommonCount = intersection.length;
          // Sort: most-played by target friend first
          intersection.sort((a, b) => (b.playtime_forever ?? 0) - (a.playtime_forever ?? 0));
          gamesInCommon = intersection.slice(0, 24).map((g) => {
            const t = targetMap.get(g.appid) ?? g;
            const icon = t.img_icon_url
              ? `https://media.steampowered.com/steamcommunity/public/images/apps/${g.appid}/${t.img_icon_url}.jpg`
              : undefined;
            return {
              appId: g.appid,
              name: String(t.name ?? `App ${g.appid}`),
              header: `https://steamcdn-a.akamaihd.net/steam/apps/${g.appid}/header.jpg`,
              icon,
              playtimeForever: Number(t.playtime_forever ?? 0),
            };
          });
        }
      } catch {
        /* ignore — common games are optional */
      }
    }

    return new Response(
      JSON.stringify({ profile, recentGames, totalGames, profileBackground, gamesInCommon, gamesInCommonCount }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("steam-profile error:", message);
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
