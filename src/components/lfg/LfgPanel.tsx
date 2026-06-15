import { useMemo, useState } from "react";
import { ChevronDown, Plus, Users, Mic, Globe, Lock, Shield, Trash2 } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useLfgPosts, type LfgPostFull } from "@/hooks/useLfgPosts";
import { CreateLfgPostDialog } from "./CreateLfgPostDialog";

type Props = { userId: string | null };

const formatExpires = (iso: string) => {
  const diff = new Date(iso).getTime() - Date.now();
  if (diff <= 0) return "expired";
  const mins = Math.round(diff / 60000);
  if (mins < 60) return `${mins}m left`;
  const hrs = Math.round(mins / 60);
  return `${hrs}h left`;
};

const VisibilityIcon = ({ v }: { v: "public" | "friends" | "community" }) => {
  if (v === "public") return <Globe className="h-3 w-3" />;
  if (v === "community") return <Shield className="h-3 w-3" />;
  return <Lock className="h-3 w-3" />;
};

export const LfgPanel = ({ userId }: Props) => {
  const [open, setOpen] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const { posts, loading } = useLfgPosts(userId);

  if (!userId) return null;

  return (
    <>
      <div className="border-t border-border">
        <button
          onClick={() => setOpen((o) => !o)}
          className="w-full flex items-center gap-2 px-4 py-2.5 text-left hover:bg-secondary/30 transition-colors"
        >
          <Users className="h-3.5 w-3.5 text-muted-foreground" />
          <span className="text-[11px] uppercase tracking-wider text-muted-foreground font-medium flex-1">
            Looking for group
          </span>
          {posts.length > 0 && (
            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-primary/15 text-primary font-bold">
              {posts.length}
            </span>
          )}
          <ChevronDown className={cn("h-3.5 w-3.5 text-muted-foreground transition-transform", !open && "-rotate-90")} />
        </button>

        {open && (
          <div className="px-3 pb-3 space-y-2">
            <button
              onClick={() => setCreateOpen(true)}
              className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-xl text-xs font-medium bg-primary/10 text-primary hover:bg-primary/20 transition-colors border border-primary/20"
            >
              <Plus className="h-3.5 w-3.5" />
              Post a session
            </button>

            {loading ? (
              <p className="text-[11px] text-muted-foreground/70 px-2 py-2 text-center">Loading…</p>
            ) : posts.length === 0 ? (
              <p className="text-[11px] text-muted-foreground/70 px-2 py-3 text-center leading-relaxed">
                No active sessions. Be the first to post one.
              </p>
            ) : (
              <ul className="space-y-1.5 max-h-72 overflow-y-auto rubix-scroll-dark">
                {posts.map((p) => (
                  <LfgPostCard key={p.id} post={p} currentUserId={userId} />
                ))}
              </ul>
            )}
          </div>
        )}
      </div>

      <CreateLfgPostDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        hostId={userId}
      />
    </>
  );
};

const LfgPostCard = ({ post, currentUserId }: { post: LfgPostFull; currentUserId: string }) => {
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const isHost = post.host_id === currentUserId;
  const filled = post.participants.length + 1; // +1 host
  const full = filled >= post.slots_total;
  const joined = useMemo(
    () => post.participants.some((p) => p.user_id === currentUserId),
    [post.participants, currentUserId]
  );

  const join = async () => {
    if (full || joined || isHost) return;
    setBusy(true);
    const { error } = await supabase
      .from("lfg_participants")
      .insert({ post_id: post.id, user_id: currentUserId });
    setBusy(false);
    if (error) {
      toast.error("Couldn't join", { description: error.message });
      return;
    }
    toast.success(`Joined ${post.game_title}`);

    // Open a DM with the host
    try {
      const { data: convId } = await supabase.rpc("get_or_create_direct_conversation", {
        _other_user_id: post.host_id,
      });
      if (convId) navigate(`/messages?c=${convId}`);
    } catch {
      /* non-fatal */
    }
  };

  const leave = async () => {
    setBusy(true);
    const { error } = await supabase
      .from("lfg_participants")
      .delete()
      .eq("post_id", post.id)
      .eq("user_id", currentUserId);
    setBusy(false);
    if (error) toast.error("Couldn't leave");
  };

  const cancel = async () => {
    if (!confirm("Cancel this LFG post?")) return;
    setBusy(true);
    const { error } = await supabase.from("lfg_posts").delete().eq("id", post.id);
    setBusy(false);
    if (error) toast.error("Couldn't cancel");
    else toast("LFG cancelled");
  };

  return (
    <li className="rounded-lg border border-border/60 bg-card/40 p-2 space-y-1.5 hover:border-border transition-colors">
      <div className="flex gap-2">
        {post.game_cover ? (
          <img
            src={post.game_cover}
            alt=""
            className="h-10 w-10 rounded-md object-cover shrink-0"
          />
        ) : (
          <div className="h-10 w-10 rounded-md bg-secondary shrink-0 grid place-items-center">
            <Users className="h-4 w-4 text-muted-foreground" />
          </div>
        )}
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold truncate">{post.game_title}</p>
          <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground mt-0.5">
            <span className="capitalize">{post.mode}</span>
            <span>·</span>
            <span className={cn(full && "text-primary")}>{filled}/{post.slots_total}</span>
            {post.mic_required && (
              <>
                <span>·</span>
                <Mic className="h-2.5 w-2.5" />
              </>
            )}
            <span className="ml-auto flex items-center gap-1">
              <VisibilityIcon v={post.visibility} />
            </span>
          </div>
        </div>
      </div>

      {post.notes && (
        <p className="text-[10px] text-muted-foreground/90 leading-snug line-clamp-2">
          {post.notes}
        </p>
      )}

      <div className="flex items-center justify-between gap-2">
        <span className="text-[10px] text-muted-foreground/70 truncate">
          {post.host ? `@${post.host.username}` : "Host"} · {formatExpires(post.expires_at)}
        </span>
        {isHost ? (
          <button
            onClick={cancel}
            disabled={busy}
            className="text-[10px] px-2 py-0.5 rounded-md text-destructive hover:bg-destructive/10 transition-colors flex items-center gap-1"
          >
            <Trash2 className="h-2.5 w-2.5" />
            Cancel
          </button>
        ) : joined ? (
          <button
            onClick={leave}
            disabled={busy}
            className="text-[10px] px-2 py-0.5 rounded-md bg-secondary text-foreground hover:bg-secondary/70 transition-colors"
          >
            Leave
          </button>
        ) : (
          <button
            onClick={join}
            disabled={busy || full}
            className={cn(
              "text-[10px] px-2 py-0.5 rounded-md font-medium transition-colors",
              full
                ? "bg-secondary/40 text-muted-foreground cursor-not-allowed"
                : "bg-primary text-primary-foreground hover:bg-primary/90"
            )}
          >
            {full ? "Full" : busy ? "…" : "Join"}
          </button>
        )}
      </div>
    </li>
  );
};
