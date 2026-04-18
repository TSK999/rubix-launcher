// RAWG search edge function
// POST { query: string, pageSize?: number } -> top matches with cover/genre/developer/description

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const RAWG_API_KEY = Deno.env.get("RAWG_API_KEY");
    if (!RAWG_API_KEY) {
      return new Response(
        JSON.stringify({ error: "RAWG_API_KEY is not configured" }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    const body = await req.json().catch(() => ({}));
    const query: string = (body?.query ?? "").toString().trim();
    const pageSize = Math.min(Math.max(Number(body?.pageSize) || 6, 1), 12);

    if (!query || query.length < 2) {
      return new Response(
        JSON.stringify({ error: "Query must be at least 2 characters" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    const searchUrl = new URL("https://api.rawg.io/api/games");
    searchUrl.searchParams.set("key", RAWG_API_KEY);
    searchUrl.searchParams.set("search", query);
    searchUrl.searchParams.set("search_precise", "true");
    searchUrl.searchParams.set("page_size", String(pageSize));

    const res = await fetch(searchUrl.toString());
    if (!res.ok) {
      const text = await res.text();
      return new Response(
        JSON.stringify({
          error: `RAWG error [${res.status}]: ${text.slice(0, 200)}`,
        }),
        {
          status: 502,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }
    const json = await res.json();
    const results = (json?.results ?? []) as Array<{
      id: number;
      name: string;
      released?: string;
      background_image?: string;
      genres?: Array<{ name: string }>;
      developers?: Array<{ name: string }>;
    }>;

    // Fetch description for each result in parallel (RAWG only returns it on detail endpoint)
    const detailed = await Promise.all(
      results.map(async (r) => {
        let description: string | undefined;
        let developer: string | undefined = r.developers?.[0]?.name;
        try {
          const dRes = await fetch(
            `https://api.rawg.io/api/games/${r.id}?key=${RAWG_API_KEY}`,
          );
          if (dRes.ok) {
            const d = await dRes.json();
            description = (d?.description_raw as string | undefined)
              ?.split("\n")[0]
              ?.slice(0, 400);
            if (!developer && d?.developers?.[0]?.name) {
              developer = d.developers[0].name;
            }
          }
        } catch (_) {
          // best-effort enrichment
        }
        return {
          rawgId: r.id,
          title: r.name,
          released: r.released,
          cover: r.background_image,
          genre: r.genres?.[0]?.name,
          developer,
          description,
        };
      }),
    );

    return new Response(JSON.stringify({ results: detailed }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("rawg-search error:", message);
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
