// Clean-room KSP mod browser backed by the public SpaceDock API.
// Not derived from CKAN source. CKAN is a separate GPL-3.0 project.
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

const SPACEDOCK = "https://spacedock.info";
// SpaceDock game IDs
const GAME_IDS: Record<string, number> = {
  ksp1: 3102,
  ksp2: 22407,
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const url = new URL(req.url);
    const action = url.searchParams.get("action") ?? "browse";
    const game = (url.searchParams.get("game") ?? "ksp1").toLowerCase();
    const gameId = GAME_IDS[game] ?? GAME_IDS.ksp1;

    let target: string;
    if (action === "browse") {
      const page = url.searchParams.get("page") ?? "1";
      const count = url.searchParams.get("count") ?? "30";
      const q = url.searchParams.get("query");
      if (q && q.trim().length > 0) {
        target = `${SPACEDOCK}/api/search/mod?query=${encodeURIComponent(q)}&page=${page}`;
      } else {
        target = `${SPACEDOCK}/api/browse?game_id=${gameId}&count=${count}&page=${page}&orderby=downloads&order=desc`;
      }
    } else if (action === "mod") {
      const id = url.searchParams.get("id");
      if (!id) {
        return new Response(JSON.stringify({ error: "missing id" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      target = `${SPACEDOCK}/api/mod/${encodeURIComponent(id)}`;
    } else {
      return new Response(JSON.stringify({ error: "unknown action" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const r = await fetch(target, { headers: { Accept: "application/json" } });
    const body = await r.text();
    return new Response(body, {
      status: r.status,
      headers: {
        ...corsHeaders,
        "Content-Type": "application/json",
        "Cache-Control": "public, max-age=300",
      },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
