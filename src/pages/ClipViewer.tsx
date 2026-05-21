import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  ArrowLeft,
  Copy,
  Download,
  Flag,
  Loader2,
  MessageCircle,
  Send,
  Share2,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { supabase } from "@/integrations/supabase/client";
import {
  fetchSharedClipBySlug,
  publicUrl,
  shareLinkFor,
  trackClipShare,
  trackClipView,
  type SharedClip,
} from "@/lib/clip-share";
import { ShareToChatDialog } from "@/components/clips/ShareToChatDialog";
import { cn } from "@/lib/utils";

type Profile = { user_id: string; username: string; display_name: string | null; avatar_url: string | null };
type Comment = { id: string; user_id: string; content: string; created_at: string };

const REACTIONS = ["🔥", "😂", "🤯", "👍", "❤️", "🎯"];

const timeAgo = (iso: string) => {
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
};

const ClipViewer = () => {
  const { slug = "" } = useParams();
  const nav = useNavigate();
  const [clip, setClip] = useState<SharedClip | null>(null);
  const [loading, setLoading] = useState(true);
  const [uploader, setUploader] = useState<Profile | null>(null);
  const [reactions, setReactions] = useState<Map<string, number>>(new Map());
  const [myReactions, setMyReactions] = useState<Set<string>>(new Set());
  const [comments, setComments] = useState<Comment[]>([]);
  const [commenters, setCommenters] = useState<Map<string, Profile>>(new Map());
  const [commentText, setCommentText] = useState("");
  const [shareOpen, setShareOpen] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [me, setMe] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getUser();
      setMe(data.user?.id ?? null);
    })();
  }, []);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    (async () => {
      const c = await fetchSharedClipBySlug(slug);
      if (!alive) return;
      setClip(c);
      setLoading(false);
      if (!c) return;

      // Track view
      void trackClipView(c.id);

      // Uploader profile
      const { data: prof } = await supabase
        .from("profiles")
        .select("user_id, username, display_name, avatar_url")
        .eq("user_id", c.user_id)
        .maybeSingle();
      if (alive) setUploader((prof as Profile) ?? null);

      // Reactions
      const { data: rxs } = await supabase
        .from("clip_reactions")
        .select("emoji, user_id")
        .eq("clip_id", c.id);
      const counts = new Map<string, number>();
      const mine = new Set<string>();
      const { data: userData } = await supabase.auth.getUser();
      const uid = userData.user?.id;
      (rxs ?? []).forEach((r: any) => {
        counts.set(r.emoji, (counts.get(r.emoji) ?? 0) + 1);
        if (uid && r.user_id === uid) mine.add(r.emoji);
      });
      if (alive) { setReactions(counts); setMyReactions(mine); }

      // Comments
      const { data: cmt } = await supabase
        .from("clip_comments")
        .select("id, user_id, content, created_at")
        .eq("clip_id", c.id)
        .order("created_at", { ascending: false });
      const list = (cmt as Comment[]) ?? [];
      if (alive) setComments(list);
      if (list.length) {
        const uids = Array.from(new Set(list.map((x) => x.user_id)));
        const { data: profs } = await supabase
          .from("profiles")
          .select("user_id, username, display_name, avatar_url")
          .in("user_id", uids);
        if (alive) setCommenters(new Map(((profs as Profile[]) ?? []).map((p) => [p.user_id, p])));
      }
    })();
    return () => { alive = false; };
  }, [slug]);

  const copyLink = async () => {
    if (!clip) return;
    try {
      await navigator.clipboard.writeText(shareLinkFor(clip.share_slug));
      await trackClipShare(clip.id);
      toast.success("Link copied");
    } catch { toast.error("Copy failed"); }
  };

  const toggleReaction = async (emoji: string) => {
    if (!clip || !me) {
      toast.error("Sign in to react");
      return;
    }
    const had = myReactions.has(emoji);
    const nextMine = new Set(myReactions);
    const nextCounts = new Map(reactions);
    if (had) {
      nextMine.delete(emoji);
      nextCounts.set(emoji, Math.max(0, (nextCounts.get(emoji) ?? 1) - 1));
      setMyReactions(nextMine); setReactions(nextCounts);
      await supabase.from("clip_reactions").delete().eq("clip_id", clip.id).eq("user_id", me).eq("emoji", emoji);
    } else {
      nextMine.add(emoji);
      nextCounts.set(emoji, (nextCounts.get(emoji) ?? 0) + 1);
      setMyReactions(nextMine); setReactions(nextCounts);
      await supabase.from("clip_reactions").insert({ clip_id: clip.id, user_id: me, emoji });
    }
  };

  const postComment = async () => {
    if (!clip || !me || !commentText.trim()) return;
    const content = commentText.trim().slice(0, 1000);
    setCommentText("");
    const { data, error } = await supabase
      .from("clip_comments")
      .insert({ clip_id: clip.id, user_id: me, content })
      .select("id, user_id, content, created_at")
      .single();
    if (error || !data) { toast.error("Could not post"); return; }
    setComments((p) => [data as Comment, ...p]);
  };

  const downloadClip = async () => {
    if (!clip?.stream_path) return;
    try {
      const url = publicUrl(clip.stream_path);
      const r = await fetch(url);
      const blob = await r.blob();
      const ext = (blob.type.split("/")[1] || "mp4").split(";")[0];
      const a = document.createElement("a");
      const objUrl = URL.createObjectURL(blob);
      a.href = objUrl;
      a.download = `${(clip.title || "clip").replace(/[^a-z0-9-_]+/gi, "_")}.${ext}`;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(objUrl), 1500);
    } catch { toast.error("Download failed"); }
  };

  const submitReport = async (reason: string) => {
    if (!clip || !me) return;
    await supabase.from("clip_reports").insert({ clip_id: clip.id, reporter_id: me, reason });
    setReportOpen(false);
    toast.success("Report submitted");
  };

  if (loading) {
    return (
      <div className="min-h-screen grid place-items-center bg-background">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!clip) {
    return (
      <div className="min-h-screen grid place-items-center bg-background text-center px-6">
        <div>
          <p className="text-2xl font-semibold">Clip not found</p>
          <p className="text-sm text-muted-foreground mt-2">It may be private, deleted, or the link is wrong.</p>
          <Button onClick={() => nav("/")} className="mt-6 rounded-xl">Go home</Button>
        </div>
      </div>
    );
  }

  const stream = publicUrl(clip.stream_path);
  const thumb = publicUrl(clip.thumbnail_path);

  return (
    <div className="relative min-h-screen overflow-hidden bg-background text-foreground">
      {/* Ambient blurred backdrop */}
      <div className="pointer-events-none absolute inset-0 -z-10">
        {thumb && (
          <img src={thumb} alt="" className="absolute inset-0 h-full w-full object-cover scale-110 blur-3xl opacity-40" />
        )}
        <div className="absolute inset-0 bg-gradient-to-b from-background/40 via-background/80 to-background" />
        <div className="absolute -top-40 left-1/2 h-[500px] w-[700px] -translate-x-1/2 rounded-full bg-primary/20 blur-3xl" />
      </div>

      {/* Top chrome */}
      <header className="sticky top-0 z-20 flex items-center gap-2 px-4 py-3 backdrop-blur bg-background/40 border-b border-border/40">
        <Button variant="ghost" size="icon" onClick={() => nav(-1)} aria-label="Back">
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex-1 min-w-0">
          <div className="truncate text-sm font-medium">{clip.title}</div>
          <div className="truncate text-[11px] text-muted-foreground">
            {clip.game_title || "RUBIX Clip"} · {clip.view_count} view{clip.view_count === 1 ? "" : "s"}
          </div>
        </div>
        <Button variant="ghost" size="sm" onClick={() => void copyLink()} className="rounded-xl">
          <Copy className="h-3.5 w-3.5 mr-1.5" />Copy
        </Button>
        <Button variant="ghost" size="sm" onClick={() => setShareOpen(true)} className="rounded-xl">
          <Share2 className="h-3.5 w-3.5 mr-1.5" />Share
        </Button>
        <Button variant="ghost" size="sm" onClick={() => void downloadClip()} className="rounded-xl">
          <Download className="h-3.5 w-3.5" />
        </Button>
        <Button variant="ghost" size="sm" onClick={() => setReportOpen(true)} className="rounded-xl text-muted-foreground">
          <Flag className="h-3.5 w-3.5" />
        </Button>
      </header>

      <main className="mx-auto grid max-w-6xl gap-6 px-4 py-6 lg:grid-cols-[1fr_320px]">
        <section className="space-y-4">
          <div className="relative overflow-hidden rounded-2xl border border-border/60 shadow-2xl bg-black">
            <video
              src={stream}
              poster={thumb || undefined}
              controls
              autoPlay
              className="aspect-video w-full"
            />
          </div>

          {/* Reactions */}
          <div className="flex flex-wrap items-center gap-2">
            {REACTIONS.map((emoji) => (
              <button
                key={emoji}
                onClick={() => void toggleReaction(emoji)}
                className={cn(
                  "flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm transition-all hover:scale-105",
                  myReactions.has(emoji)
                    ? "border-primary/60 bg-primary/15 text-primary"
                    : "border-border bg-card/70 text-muted-foreground hover:text-foreground",
                )}
              >
                <span>{emoji}</span>
                {reactions.get(emoji) ? <span className="text-xs tabular-nums">{reactions.get(emoji)}</span> : null}
              </button>
            ))}
          </div>
        </section>

        <aside className="space-y-4">
          {/* Uploader */}
          <div className="rounded-2xl border border-border/60 bg-card/60 backdrop-blur p-4">
            <Link to={uploader?.username ? `/u/${uploader.username}` : "#"} className="flex items-center gap-3">
              <Avatar className="h-10 w-10">
                <AvatarImage src={uploader?.avatar_url ?? undefined} />
                <AvatarFallback>{(uploader?.display_name ?? uploader?.username ?? "?").charAt(0).toUpperCase()}</AvatarFallback>
              </Avatar>
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium">
                  {uploader?.display_name || uploader?.username || "Unknown"}
                </div>
                <div className="text-[11px] text-muted-foreground">{timeAgo(clip.created_at)}</div>
              </div>
            </Link>
            {clip.game_title && (
              <div className="mt-3 rounded-xl bg-secondary/60 px-3 py-2 text-xs text-muted-foreground">
                <span className="text-foreground/80 font-medium">Game</span> · {clip.game_title}
              </div>
            )}
          </div>

          {/* Comments */}
          <div className="rounded-2xl border border-border/60 bg-card/60 backdrop-blur">
            <div className="flex items-center gap-2 px-4 py-3 border-b border-border/60">
              <MessageCircle className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm font-medium">Comments</span>
              <span className="text-xs text-muted-foreground">{comments.length}</span>
            </div>
            <div className="px-4 py-3 border-b border-border/60">
              <div className="flex gap-2">
                <Input
                  value={commentText}
                  onChange={(e) => setCommentText(e.target.value)}
                  placeholder={me ? "Write a comment…" : "Sign in to comment"}
                  disabled={!me}
                  className="rounded-xl"
                  onKeyDown={(e) => { if (e.key === "Enter") void postComment(); }}
                />
                <Button size="icon" onClick={() => void postComment()} disabled={!me || !commentText.trim()} className="rounded-xl">
                  <Send className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
            <div className="max-h-[400px] overflow-y-auto px-4 py-3 space-y-3">
              {comments.length === 0 && (
                <p className="text-xs text-muted-foreground py-6 text-center">Be the first to comment.</p>
              )}
              {comments.map((c) => {
                const p = commenters.get(c.user_id);
                return (
                  <div key={c.id} className="flex gap-2">
                    <Avatar className="h-7 w-7">
                      <AvatarImage src={p?.avatar_url ?? undefined} />
                      <AvatarFallback>{(p?.display_name ?? p?.username ?? "?").charAt(0).toUpperCase()}</AvatarFallback>
                    </Avatar>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-baseline gap-2">
                        <span className="text-xs font-medium truncate">{p?.display_name || p?.username || "User"}</span>
                        <span className="text-[10px] text-muted-foreground">{timeAgo(c.created_at)}</span>
                      </div>
                      <p className="text-sm text-foreground/90 break-words">{c.content}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </aside>
      </main>

      <ShareToChatDialog open={shareOpen} onOpenChange={setShareOpen} clip={clip} />

      {reportOpen && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-background/80 backdrop-blur p-4" onClick={() => setReportOpen(false)}>
          <div className="w-full max-w-sm rounded-2xl border border-border bg-card p-4 space-y-2" onClick={(e) => e.stopPropagation()}>
            <h3 className="font-semibold">Report clip</h3>
            <p className="text-xs text-muted-foreground">Why are you reporting this clip?</p>
            {["Inappropriate", "Spam", "Harassment", "Other"].map((r) => (
              <Button key={r} variant="outline" className="w-full justify-start rounded-xl" onClick={() => void submitReport(r)}>
                {r}
              </Button>
            ))}
            <Button variant="ghost" className="w-full rounded-xl" onClick={() => setReportOpen(false)}>Cancel</Button>
          </div>
        </div>
      )}
    </div>
  );
};

export default ClipViewer;
