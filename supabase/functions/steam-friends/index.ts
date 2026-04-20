// Steam Friends list — fetches the user's friends, hydrates with player summaries.
// POST { steamId: string } -> { friends: Friend[] }
//
// Steam Web API endpoints used:
//  - ISteamUser/GetFriendList/v1
//  - ISteamUser/GetPlayerSummaries/v2 (batched, max 100 IDs per call)
//
// Requires STEAM_API_KEY secret.

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const STEAM_ID_RE = /^\d{17}$/;

type Friend = {
  steamId: string;
  personaName: string;
  avatar: string;
  profileUrl: string;
  // 0=offline 1=online 2=busy 3=away 4=snooze 5=looking-to-trade 6=looking-to-play
  personaState: number;
  // Resolved status bucket for grouping
  status: "in-game" | "online" | "away" | "offline";
  gameId?: string;
  gameName?: string;
  gameServer?: string;
  lastLogoff?: number;
  friendSince?: number;
};

const STATE_TO_BUCKET = (state: number, inGame: boolean): Friend["status"] => {
  if (inGame) return "in-game";
  if (state === 0) return "offline";
  if (state === 3 || state === 4) return "away";
  return "online";
};

const chunk = <T>(arr: T[], size: number): T[][] => {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
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
    const steamId: string = String(body?.steamId ?? "").trim();

    if (!STEAM_ID_RE.test(steamId)) {
      return new Response(
        JSON.stringify({ error: "Invalid steamId (must be 17-digit SteamID64)" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    // 1) Get friend list
    const flUrl =
      `https://api.steampowered.com/ISteamUser/GetFriendList/v1/` +
      `?key=${STEAM_API_KEY}&steamid=${steamId}&relationship=friend`;
    const flRes = await fetch(flUrl);

    if (flRes.status === 401 || flRes.status === 403) {
      await flRes.text();
      return new Response(
        JSON.stringify({
          error:
            "Friends list is private. Set your Steam profile + friends list to Public to use this feature.",
        }),
        {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    if (!flRes.ok) {
      const text = await flRes.text();
      return new Response(
        JSON.stringify({
          error: `Steam GetFriendList failed [${flRes.status}]: ${text.slice(0, 200)}`,
        }),
        {
          status: 502,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    const flData = await flRes.json();
    const friendEntries: { steamid: string; friend_since: number }[] =
      flData?.friendslist?.friends ?? [];

    if (friendEntries.length === 0) {
      return new Response(JSON.stringify({ friends: [] }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const friendSinceMap = new Map<string, number>();
    friendEntries.forEach((f) => friendSinceMap.set(f.steamid, f.friend_since));

    // 2) Hydrate with player summaries (batched)
    const ids = friendEntries.map((f) => f.steamid);
    const batches = chunk(ids, 100);
    const summaries: Record<string, unknown>[] = [];

    for (const batch of batches) {
      const psUrl =
        `https://api.steampowered.com/ISteamUser/GetPlayerSummaries/v2/` +
        `?key=${STEAM_API_KEY}&steamids=${batch.join(",")}`;
      const psRes = await fetch(psUrl);
      if (!psRes.ok) {
        await psRes.text();
        continue;
      }
      const psData = await psRes.json();
      const players: Record<string, unknown>[] =
        psData?.response?.players ?? [];
      summaries.push(...players);
    }

    const friends: Friend[] = summaries.map((p: Record<string, unknown>) => {
      const sid = String(p.steamid ?? "");
      const state = Number(p.personastate ?? 0);
      const gameId = p.gameid ? String(p.gameid) : undefined;
      const inGame = !!gameId;
      return {
        steamId: sid,
        personaName: String(p.personaname ?? "Unknown"),
        avatar: String(p.avatarfull ?? p.avatarmedium ?? p.avatar ?? ""),
        profileUrl: String(p.profileurl ?? `https://steamcommunity.com/profiles/${sid}`),
        personaState: state,
        status: STATE_TO_BUCKET(state, inGame),
        gameId,
        gameName: p.gameextrainfo ? String(p.gameextrainfo) : undefined,
        gameServer: p.gameserverip ? String(p.gameserverip) : undefined,
        lastLogoff: p.lastlogoff ? Number(p.lastlogoff) : undefined,
        friendSince: friendSinceMap.get(sid),
      };
    });

    // Sort: in-game → online → away → offline, then by name
    const order: Record<Friend["status"], number> = {
      "in-game": 0,
      online: 1,
      away: 2,
      offline: 3,
    };
    friends.sort((a, b) => {
      const o = order[a.status] - order[b.status];
      if (o !== 0) return o;
      return a.personaName.localeCompare(b.personaName);
    });

    return new Response(JSON.stringify({ friends }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("steam-friends error:", message);
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
