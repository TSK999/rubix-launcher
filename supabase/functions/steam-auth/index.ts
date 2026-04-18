// Steam OpenID validator
// POST { params: Record<string,string> } where params are the openid.* query params
// Steam redirected back with. Returns { steamId } on success.
//
// Spec: https://openid.net/specs/openid-authentication-2_0.html#verification
// Steam endpoint: https://steamcommunity.com/openid/login

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const STEAM_OPENID_URL = "https://steamcommunity.com/openid/login";
const CLAIMED_ID_RE =
  /^https?:\/\/steamcommunity\.com\/openid\/id\/(\d{17})$/;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const params: Record<string, string> = body?.params ?? {};

    if (!params["openid.claimed_id"] || !params["openid.signed"]) {
      return new Response(
        JSON.stringify({ error: "Missing OpenID parameters" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    // Build verification request: copy all params, switch mode to check_authentication
    const verifyParams = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) {
      verifyParams.set(k, v);
    }
    verifyParams.set("openid.mode", "check_authentication");

    const verifyRes = await fetch(STEAM_OPENID_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: verifyParams.toString(),
    });

    if (!verifyRes.ok) {
      return new Response(
        JSON.stringify({
          error: `Steam verification failed [${verifyRes.status}]`,
        }),
        {
          status: 502,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    const verifyText = await verifyRes.text();
    // Response is key:value lines. Look for is_valid:true
    const isValid = /is_valid\s*:\s*true/i.test(verifyText);
    if (!isValid) {
      return new Response(
        JSON.stringify({ error: "OpenID assertion is not valid" }),
        {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    const claimed = params["openid.claimed_id"];
    const match = CLAIMED_ID_RE.exec(claimed);
    if (!match) {
      return new Response(
        JSON.stringify({ error: "Unrecognized claimed_id format" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    const steamId = match[1];

    return new Response(JSON.stringify({ steamId }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("steam-auth error:", message);
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
