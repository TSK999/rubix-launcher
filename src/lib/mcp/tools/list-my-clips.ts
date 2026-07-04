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
  name: "list_my_clips",
  title: "List my clips",
  description: "List the signed-in user's shared gameplay clips.",
  inputSchema: {
    limit: z.number().int().describe("Maximum clips to return (1-50). Defaults to 20.").optional(),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ limit }, ctx) => {
    if (!ctx.isAuthenticated())
      return { content: [{ type: "text", text: "Not authenticated" }], isError: true };
    const cap = Math.min(Math.max(limit ?? 20, 1), 50);
    const sb = supabaseForUser(ctx);
    const { data, error } = await sb
      .from("shared_clips")
      .select("id, slug, title, visibility, view_count, share_count, created_at, game_key")
      .eq("user_id", ctx.getUserId())
      .order("created_at", { ascending: false })
      .limit(cap);
    if (error) return { content: [{ type: "text", text: error.message }], isError: true };
    return {
      content: [{ type: "text", text: JSON.stringify(data ?? []) }],
      structuredContent: { clips: data ?? [] },
    };
  },
});
