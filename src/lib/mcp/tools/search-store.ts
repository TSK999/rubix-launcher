import { createClient } from "@supabase/supabase-js";
import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";

export default defineTool({
  name: "search_store_games",
  title: "Search store games",
  description: "Search the RUBIX store for approved games by title. Returns up to 20 matches.",
  inputSchema: {
    query: z.string().trim().min(1).describe("Text to search for in game titles."),
    limit: z.number().int().describe("Maximum results (1-20). Defaults to 10.").optional(),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ query, limit }) => {
    const sb = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_PUBLISHABLE_KEY!, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const cap = Math.min(Math.max(limit ?? 10, 1), 20);
    const { data, error } = await sb
      .from("games")
      .select("id, title, slug, description, price_cents, cover_url")
      .eq("status", "approved")
      .ilike("title", `%${query}%`)
      .limit(cap);
    if (error) return { content: [{ type: "text", text: error.message }], isError: true };
    return {
      content: [{ type: "text", text: JSON.stringify(data ?? []) }],
      structuredContent: { games: data ?? [] },
    };
  },
});
