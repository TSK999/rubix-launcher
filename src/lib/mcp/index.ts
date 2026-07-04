import { auth, defineMcp } from "@lovable.dev/mcp-js";
import listMyLibraryTool from "./tools/list-my-library";
import listMyFriendsTool from "./tools/list-my-friends";
import listMyClipsTool from "./tools/list-my-clips";
import searchStoreTool from "./tools/search-store";

const projectRef = import.meta.env.VITE_SUPABASE_PROJECT_ID ?? "project-ref-unset";

export default defineMcp({
  name: "rubix-mcp",
  title: "RUBIX Launcher",
  version: "0.1.0",
  instructions:
    "Tools for the RUBIX gaming launcher. Search the store, list the signed-in user's library, friends, and shared clips.",
  auth: auth.oauth.issuer({
    issuer: `https://${projectRef}.supabase.co/auth/v1`,
    acceptedAudiences: "authenticated",
  }),
  tools: [searchStoreTool, listMyLibraryTool, listMyFriendsTool, listMyClipsTool],
});
