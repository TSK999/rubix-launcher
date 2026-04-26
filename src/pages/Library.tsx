import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useRubixAuth } from "@/hooks/useRubixAuth";
import { Sidebar } from "@/components/Sidebar";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Library as LibraryIcon,
  Download,
  Clock,
  Package,
  Sparkles,
  CheckCircle2,
} from "lucide-react";
import { toast } from "sonner";

type LibraryGame = {
  id: string;
  title: string;
  slug: string;
  cover_url: string | null;
  purchased_at: string;
};

const HISTORY_KEY = "rubix:download-history";

type HistoryMap = Record<
  string,
  { downloaded_at: string; version?: string; platform?: string }
>;

const readHistory = (): HistoryMap => {
  try {
    return JSON.parse(localStorage.getItem(HISTORY_KEY) || "{}");
  } catch {
    return {};
  }
};

const writeHistory = (h: HistoryMap) => {
  localStorage.setItem(HISTORY_KEY, JSON.stringify(h));
};

const formatRelative = (iso: string) => {
  const d = new Date(iso);
  const diff = Date.now() - d.getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `${days}d ago`;
  return d.toLocaleDateString();
};

const Library = () => {
  const { user } = useRubixAuth();
  const [games, setGames] = useState<LibraryGame[]>([]);
  const [loading, setLoading] = useState(true);
  const [history, setHistory] = useState<HistoryMap>({});
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => {
    document.title = "Library — RUBIX";
    setHistory(readHistory());
    if (!user) {
      setLoading(false);
      return;
    }
    (async () => {
      const { data } = await supabase
        .from("orders")
        .select("created_at, game:games(id, title, slug, cover_url)")
        .eq("user_id", user.id)
        .eq("status", "completed")
        .order("created_at", { ascending: false });
      const list = (data ?? [])
        .map((o: any) =>
          o.game ? { ...(o.game as object), purchased_at: o.created_at } : null,
        )
        .filter(Boolean) as LibraryGame[];
      setGames(list);
      setLoading(false);
    })();
  }, [user]);

  const handleDownload = async (gameId: string) => {
    setBusyId(gameId);
    const { data: builds, error } = await supabase
      .from("game_builds")
      .select("*")
      .eq("game_id", gameId)
      .order("created_at", { ascending: false })
      .limit(1);
    if (error || !builds || builds.length === 0) {
      setBusyId(null);
      toast.error("No download available", {
        description: "The developer hasn't uploaded a build yet.",
      });
      return;
    }
    const build = builds[0];
    let opened = false;
    if (build.file_path) {
      const { data: signed, error: sErr } = await supabase.storage
        .from("game-builds")
        .createSignedUrl(build.file_path, 3600);
      if (sErr || !signed) {
        setBusyId(null);
        toast.error("Couldn't generate download link", {
          description: sErr?.message,
        });
        return;
      }
      window.open(signed.signedUrl, "_blank");
      opened = true;
    } else if (build.external_url) {
      window.open(build.external_url, "_blank");
      opened = true;
    }

    if (opened) {
      const next = {
        ...readHistory(),
        [gameId]: {
          downloaded_at: new Date().toISOString(),
          version: build.version,
          platform: build.platform,
        },
      };
      writeHistory(next);
      setHistory(next);
    } else {
      toast.error("No download source");
    }
    setBusyId(null);
  };

  const recentDownloads = useMemo(
    () =>
      games
        .map((g) => ({ g, h: history[g.id] }))
        .filter((x) => x.h)
        .sort(
          (a, b) =>
            +new Date(b.h!.downloaded_at) - +new Date(a.h!.downloaded_at),
        )
        .slice(0, 5),
    [games, history],
  );

  const downloadedCount = Object.keys(history).filter((id) =>
    games.some((g) => g.id === id),
  ).length;

  const heroImage = games[0]?.cover_url ?? null;

  return (
    <div className="min-h-screen flex bg-background text-foreground">
      <Sidebar
        collection="all"
        onCollection={() => {}}
        genres={[]}
        selectedGenre={null}
        onGenre={() => {}}
        counts={{ all: 0, favorites: 0, recent: 0 }}
        selectedSource={null}
        onSource={() => {}}
        sourceCounts={{ steam: 0, epic: 0, ea: 0, xbox: 0, riot: 0, other: 0 }}
      />
      <main className="flex-1 overflow-y-auto">
        {/* Cinematic header */}
        <section className="relative overflow-hidden border-b border-border">
          {heroImage && (
            <div
              aria-hidden
              className="absolute inset-0 opacity-30 blur-3xl scale-110"
              style={{
                backgroundImage: `url(${heroImage})`,
                backgroundSize: "cover",
                backgroundPosition: "center",
              }}
            />
          )}
          <div className="absolute inset-0 bg-gradient-to-b from-background/40 via-background/80 to-background" />
          <div className="absolute inset-0 bg-[image:var(--gradient-primary)] opacity-10 mix-blend-overlay" />

          <div className="relative px-8 pt-12 pb-8">
            <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-[0.2em] text-primary/90 mb-4">
              <LibraryIcon className="h-3.5 w-3.5" />
              Your collection
            </div>
            <h1 className="text-4xl md:text-5xl font-bold tracking-tight">
              Your <span className="bg-clip-text text-transparent bg-[image:var(--gradient-primary)]">Library</span>
            </h1>
            <p className="text-muted-foreground mt-3 max-w-xl">
              All your RUBIX Store purchases in one place — ready to download.
            </p>

            <div className="mt-6 flex flex-wrap gap-3">
              <div className="px-4 py-3 rounded-xl border border-border bg-card/50 backdrop-blur min-w-[140px]">
                <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-muted-foreground">
                  <Package className="h-3.5 w-3.5" /> Owned
                </div>
                <p className="text-2xl font-bold mt-1">{games.length}</p>
              </div>
              <div className="px-4 py-3 rounded-xl border border-border bg-card/50 backdrop-blur min-w-[140px]">
                <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-muted-foreground">
                  <CheckCircle2 className="h-3.5 w-3.5" /> Installed
                </div>
                <p className="text-2xl font-bold mt-1">{downloadedCount}</p>
              </div>
              <div className="px-4 py-3 rounded-xl border border-border bg-card/50 backdrop-blur min-w-[140px]">
                <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-muted-foreground">
                  <Clock className="h-3.5 w-3.5" /> Last download
                </div>
                <p className="text-sm font-medium mt-1.5 truncate">
                  {recentDownloads[0]
                    ? formatRelative(recentDownloads[0].h!.downloaded_at)
                    : "—"}
                </p>
              </div>
            </div>
          </div>
        </section>

        <section className="p-8 space-y-10">
          {recentDownloads.length > 0 && (
            <div>
              <h2 className="text-lg font-semibold tracking-tight flex items-center gap-2 mb-4">
                <Sparkles className="h-4 w-4 text-primary" /> Recent downloads
              </h2>
              <Card className="rounded-2xl border-border bg-card/40 overflow-hidden">
                <ul className="divide-y divide-border">
                  {recentDownloads.map(({ g, h }) => (
                    <li
                      key={g.id}
                      className="flex items-center gap-4 p-4 hover:bg-secondary/30 transition-colors"
                    >
                      <Link
                        to={`/store/${g.slug}`}
                        className="h-12 w-12 rounded-lg bg-secondary overflow-hidden shrink-0 ring-1 ring-border"
                      >
                        {g.cover_url && (
                          <img
                            src={g.cover_url}
                            alt=""
                            className="w-full h-full object-cover"
                          />
                        )}
                      </Link>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium truncate">{g.title}</p>
                        <p className="text-xs text-muted-foreground flex items-center gap-1.5 mt-0.5">
                          <Package className="h-3 w-3" />
                          {h!.platform ?? "—"} · v{h!.version ?? "?"}
                        </p>
                      </div>
                      <span className="text-xs text-muted-foreground shrink-0">
                        {formatRelative(h!.downloaded_at)}
                      </span>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleDownload(g.id)}
                        disabled={busyId === g.id}
                        className="rounded-lg shrink-0"
                      >
                        <Download className="h-3.5 w-3.5 mr-1.5" />
                        Re-download
                      </Button>
                    </li>
                  ))}
                </ul>
              </Card>
            </div>
          )}

          <div>
            <h2 className="text-lg font-semibold tracking-tight flex items-center gap-2 mb-4">
              <LibraryIcon className="h-4 w-4 text-primary" /> All games
            </h2>

            {loading ? (
              <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-5">
                {Array.from({ length: 4 }).map((_, i) => (
                  <div key={i} className="space-y-2">
                    <div className="aspect-[3/4] rounded-2xl rubix-shimmer" />
                    <div className="h-3 w-2/3 rounded rubix-shimmer" />
                    <div className="h-3 w-1/3 rounded rubix-shimmer" />
                  </div>
                ))}
              </div>
            ) : games.length === 0 ? (
              <div className="text-center py-20 text-muted-foreground border border-dashed border-border rounded-2xl">
                <LibraryIcon className="h-10 w-10 mx-auto mb-3 opacity-40" />
                <p className="text-lg">Your library is empty.</p>
                <p className="text-sm mt-1">
                  Discover something to play in the RUBIX Store.
                </p>
                <Button asChild className="mt-5 rounded-xl bg-[image:var(--gradient-primary)] shadow-[var(--glow-primary)]">
                  <Link to="/store">Browse the store</Link>
                </Button>
              </div>
            ) : (
              <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-5">
                {games.map((g) => {
                  const h = history[g.id];
                  return (
                    <Card
                      key={g.id}
                      className="overflow-hidden rounded-2xl border-border bg-card/40 flex flex-col group transition-all duration-300 hover:-translate-y-1 hover:border-primary/60 hover:shadow-[var(--glow-primary)]"
                    >
                      <Link
                        to={`/store/${g.slug}`}
                        className="block aspect-[3/4] bg-secondary overflow-hidden relative"
                      >
                        {g.cover_url ? (
                          <img
                            src={g.cover_url}
                            alt={g.title}
                            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                          />
                        ) : null}
                        <div className="absolute inset-0 bg-gradient-to-t from-background/90 via-transparent to-transparent" />
                        {h ? (
                          <Badge
                            className="absolute top-2 left-2 text-[10px] px-1.5 py-0 bg-primary/90 text-primary-foreground border-0"
                          >
                            <CheckCircle2 className="h-2.5 w-2.5 mr-1" />
                            Installed
                          </Badge>
                        ) : (
                          <Badge
                            variant="outline"
                            className="absolute top-2 left-2 text-[10px] px-1.5 py-0 bg-background/70 backdrop-blur"
                          >
                            New
                          </Badge>
                        )}
                      </Link>
                      <div className="p-3 space-y-2 flex-1 flex flex-col">
                        <h3 className="font-semibold text-sm truncate">{g.title}</h3>
                        <p className="text-[11px] text-muted-foreground">
                          {h ? (
                            <>
                              <Clock className="h-2.5 w-2.5 inline mr-1" />
                              {formatRelative(h.downloaded_at)}
                              {h.version ? ` · v${h.version}` : ""}
                            </>
                          ) : (
                            "Not downloaded yet"
                          )}
                        </p>
                        <Button
                          size="sm"
                          onClick={() => handleDownload(g.id)}
                          disabled={busyId === g.id}
                          className="w-full rounded-xl mt-auto bg-[image:var(--gradient-primary)] hover:opacity-90"
                        >
                          <Download className="h-3.5 w-3.5 mr-1.5" />
                          {h ? "Download again" : "Download"}
                        </Button>
                      </div>
                    </Card>
                  );
                })}
              </div>
            )}
          </div>
        </section>
      </main>
    </div>
  );
};

export default Library;
