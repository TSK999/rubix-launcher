import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowLeft, Eye, Film, Flame, Gamepad2, Heart, MessageCircle, Sparkles, TrendingUp } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useRubixAuth } from "@/hooks/useRubixAuth";
import { publicUrl, type SharedClip } from "@/lib/clip-share";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

type Profile = { user_id: string; username: string; display_name: string | null; avatar_url: string | null };
type Tab = "for-you" | "trending" | "recent";

type FeedClip = SharedClip & {
  reaction_count: number;
  comment_count: number;
  in_library: boolean;
};

const normalize = (s: string | null | undefined) =>
  (s ?? "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

const timeAgo = (iso: string) => {
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  return `${Math.floor(s / 86400)}d`;
};

const ClipsFeed = () => {
  const { user } = useRubixAuth();
  const nav = useNavigate();
  const [tab, setTab] = useState<Tab>("for-you");
  const [clips, setClips] = useState<FeedClip[]>([]);
  const [uploaders, setUploaders] = useState<Map<string, Profile>>(new Map());
  const [loading, setLoading] = useState(true);
  const [libraryTitles, setLibraryTitles] = useState<Set<string>>(new Set());

  useEffect(() => {
    document.title = "Clips — RUBIX";
  }, []);

  // Fetch user's library (owned games) for "in_library" prioritization
  useEffect(() => {
    if (!user) return;
    (async () => {
      const { data } = await supabase
        .from("orders")
        .select("game:games(title, slug)")
        .eq("user_id", user.id)
        .eq("status", "completed");
      const titles = new Set<string>();
      (data ?? []).forEach((o: any) => {
        if (o.game?.title) titles.add(normalize(o.game.title));
        if (o.game?.slug) titles.add(normalize(o.game.slug));
      });
      setLibraryTitles(titles);
    })();
  }, [user]);

  // Load feed
  useEffect(() => {
    let alive = true;
    setLoading(true);
    (async () => {
      const { data: rows } = await supabase
        .from("shared_clips")
        .select("*")
        .neq("visibility", "private")
        .eq("processing_status", "ready")
        .order("created_at", { ascending: false })
        .limit(120);

      const base = (rows ?? []) as SharedClip[];
      if (base.length === 0) {
        if (alive) { setClips([]); setLoading(false); }
        return;
      }

      const ids = base.map((c) => c.id);
      const userIds = Array.from(new Set(base.map((c) => c.user_id)));

      const [rxRes, cmRes, profRes] = await Promise.all([
        supabase.from("clip_reactions").select("clip_id").in("clip_id", ids),
        supabase.from("clip_comments").select("clip_id").in("clip_id", ids),
        supabase
          .from("profiles")
          .select("user_id, username, display_name, avatar_url")
          .in("user_id", userIds),
      ]);

      const rxMap = new Map<string, number>();
      (rxRes.data ?? []).forEach((r: any) => rxMap.set(r.clip_id, (rxMap.get(r.clip_id) ?? 0) + 1));
      const cmMap = new Map<string, number>();
      (cmRes.data ?? []).forEach((r: any) => cmMap.set(r.clip_id, (cmMap.get(r.clip_id) ?? 0) + 1));

      const enriched: FeedClip[] = base.map((c) => ({
        ...c,
        reaction_count: rxMap.get(c.id) ?? 0,
        comment_count: cmMap.get(c.id) ?? 0,
        in_library: libraryTitles.has(normalize(c.game_title)) || libraryTitles.has(normalize(c.game_key)),
      }));

      if (alive) {
        setClips(enriched);
        setUploaders(new Map(((profRes.data as Profile[]) ?? []).map((p) => [p.user_id, p])));
        setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [libraryTitles]);

  const sorted = useMemo(() => {
    const arr = [...clips];
    if (tab === "trending") {
      arr.sort((a, b) => {
        const score = (c: FeedClip) =>
          c.view_count + c.reaction_count * 4 + c.comment_count * 6 + c.share_count * 5;
        return score(b) - score(a);
      });
    } else if (tab === "recent") {
      arr.sort((a, b) => +new Date(b.created_at) - +new Date(a.created_at));
    } else {
      // for-you: library matches first, then trending-ish score
      arr.sort((a, b) => {
        if (a.in_library !== b.in_library) return a.in_library ? -1 : 1;
        const score = (c: FeedClip) =>
          c.reaction_count * 3 + c.comment_count * 4 + c.view_count + +new Date(c.created_at) / 1e10;
        return score(b) - score(a);
      });
    }
    return arr;
  }, [clips, tab]);

  const tabs: { id: Tab; label: string; icon: typeof Flame }[] = [
    { id: "for-you", label: "For you", icon: Sparkles },
    { id: "trending", label: "Trending", icon: TrendingUp },
    { id: "recent", label: "Recent", icon: Flame },
  ];

  return (
    <div className="relative min-h-screen bg-background text-foreground">
      {/* Ambient backdrop */}
      <div className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
        <div className="absolute -top-40 left-1/4 h-[500px] w-[700px] rounded-full bg-primary/20 blur-3xl" />
        <div className="absolute top-1/3 right-0 h-[400px] w-[500px] rounded-full bg-fuchsia-500/10 blur-3xl" />
      </div>

      <header className="sticky top-0 z-20 border-b border-border/60 bg-background/70 backdrop-blur-xl">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center gap-4">
          <Button variant="ghost" size="sm" onClick={() => nav(-1)} className="rounded-xl">
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div className="flex items-center gap-2">
            <div>
              <h1 className="text-lg font-bold leading-none tracking-tight">RUBIX Clips</h1>
              <p className="text-[11px] text-muted-foreground mt-1">Plays from the community</p>
            </div>
          </div>
          <div className="ml-auto flex items-center gap-1 rounded-2xl bg-secondary/30 border border-border/50 p-1">
            {tabs.map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                onClick={() => setTab(id)}
                className={cn(
                  "px-3 py-1.5 rounded-xl text-sm flex items-center gap-2 transition-colors",
                  tab === id
                    ? "bg-card text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                <Icon className="h-3.5 w-3.5" />
                {label}
              </button>
            ))}
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-6 py-8">
        {tab === "for-you" && libraryTitles.size === 0 && !loading && (
          <div className="mb-6 rounded-2xl border border-dashed border-border/60 bg-card/30 px-4 py-3 text-sm text-muted-foreground flex items-center gap-2">
            <Gamepad2 className="h-4 w-4" />
            Add games to your library to see clips from titles you play first.
          </div>
        )}

        {loading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="aspect-video rounded-2xl" />
            ))}
          </div>
        ) : sorted.length === 0 ? (
          <div className="text-center py-24">
            <Film className="h-10 w-10 mx-auto text-muted-foreground/60" />
            <p className="mt-4 text-lg font-semibold">No clips yet</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Be the first — press your clip hotkey in-game.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {sorted.map((c) => {
              const up = uploaders.get(c.user_id);
              const thumb = publicUrl(c.thumbnail_path);
              return (
                <Link
                  key={c.id}
                  to={`/clip/${c.share_slug}`}
                  className="group relative rounded-2xl overflow-hidden bg-card/60 border border-border/50 hover:border-primary/50 transition-all hover:-translate-y-0.5 hover:shadow-[var(--glow-primary)]"
                >
                  <div className="relative aspect-video bg-secondary/40 overflow-hidden">
                    {thumb ? (
                      <img
                        src={thumb}
                        alt={c.title}
                        loading="lazy"
                        className="h-full w-full object-cover group-hover:scale-105 transition-transform duration-500"
                      />
                    ) : (
                      <div className="h-full w-full grid place-items-center text-muted-foreground/60">
                        <Film className="h-8 w-8" />
                      </div>
                    )}
                    <div className="absolute inset-0 bg-gradient-to-t from-background/90 via-transparent to-transparent" />
                    {c.duration_seconds != null && (
                      <span className="absolute bottom-2 right-2 px-1.5 py-0.5 rounded-md bg-background/80 backdrop-blur text-[10px] font-mono">
                        {Math.floor(c.duration_seconds / 60)}:
                        {String(Math.floor(c.duration_seconds % 60)).padStart(2, "0")}
                      </span>
                    )}
                    {c.in_library && (
                      <Badge className="absolute top-2 left-2 bg-primary/90 text-primary-foreground border-0 backdrop-blur">
                        <Gamepad2 className="h-3 w-3 mr-1" />
                        In your library
                      </Badge>
                    )}
                  </div>

                  <div className="p-3 space-y-2">
                    <div className="flex items-start gap-2">
                      <Avatar className="h-8 w-8 shrink-0">
                        <AvatarImage src={up?.avatar_url ?? undefined} />
                        <AvatarFallback className="text-[10px]">
                          {(up?.display_name || up?.username || "?")[0]?.toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold truncate group-hover:text-primary transition-colors">
                          {c.title}
                        </p>
                        <p className="text-[11px] text-muted-foreground truncate">
                          @{up?.username ?? "unknown"}
                          {c.game_title ? <span className="opacity-60"> · {c.game_title}</span> : null}
                          <span className="opacity-60"> · {timeAgo(c.created_at)}</span>
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-3 text-[11px] text-muted-foreground pt-1">
                      <span className="flex items-center gap-1"><Eye className="h-3 w-3" />{c.view_count}</span>
                      <span className="flex items-center gap-1"><Heart className="h-3 w-3" />{c.reaction_count}</span>
                      <span className="flex items-center gap-1"><MessageCircle className="h-3 w-3" />{c.comment_count}</span>
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
};

export default ClipsFeed;
