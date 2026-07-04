import { createClient } from "@supabase/supabase-js";
import { defineTool, type ToolContext } from "@lovable.dev/mcp-js";
import { z } from "zod";

function supabaseForUser(ctx: ToolContext) {
  return createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_PUBLISHABLE_KEY!, {
    global: { headers: { Authorization: `Bearer ${ctx.getToken()}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export default defineTool({
  name: "list_my_friends",
  title: "List my friends",
  description: "List accepted RUBIX friendships for the signed-in user.",
  inputSchema: {},
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async (_input, ctx) => {
    if (!ctx.isAuthenticated())
      return { content: [{ type: "text", text: "Not authenticated" }], isError: true };
    const sb = supabaseForUser(ctx);
    const me = ctx.getUserId();
    const { data, error } = await sb
      .from("rubix_friendships")
      .select("user_a, user_b, status, created_at")
      .eq("status", "accepted")
      .or(`user_a.eq.${me},user_b.eq.${me}`);
    if (error) return { content: [{ type: "text", text: error.message }], isError: true };
    const friendIds = (data ?? []).map((r) => (r.user_a === me ? r.user_b : r.user_a));
    if (friendIds.length === 0)
      return { content: [{ type: "text", text: "[]" }], structuredContent: { friends: [] } };
    const { data: profiles } = await sb
      .from("profiles")
      .select("user_id, username, display_name, avatar_url")
      .in("user_id", friendIds);
    return {
      content: [{ type: "text", text: JSON.stringify(profiles ?? []) }],
      structuredContent: { friends: profiles ?? [] },
    };
  },
});
