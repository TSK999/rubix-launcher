import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useRubixAuth } from "@/hooks/useRubixAuth";
import { Sidebar } from "@/components/Sidebar";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Library as LibraryIcon, Download, Clock, Package } from "lucide-react";
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

  const recentDownloads = games
    .map((g) => ({ g, h: history[g.id] }))
    .filter((x) => x.h)
    .sort(
      (a, b) =>
        +new Date(b.h!.downloaded_at) - +new Date(a.h!.downloaded_at),
    )
    .slice(0, 5);

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
        <header className="px-8 pt-8 pb-6 border-b border-border">
          <div className="flex items-center gap-3 mb-2">
            <LibraryIcon className="h-7 w-7 text-primary" />
            <h1 className="text-3xl font-bold tracking-tight">Your Library</h1>
          </div>
          <p className="text-muted-foreground">
            Games you own from the RUBIX Store.
          </p>
        </header>

        <section className="p-8 space-y-8">
          {recentDownloads.length > 0 && (
            <Card className="p-5 rounded-2xl border-border bg-card/40">
              <div className="flex items-center gap-2 mb-3">
                <Clock className="h-4 w-4 text-primary" />
                <h2 className="text-sm font-semibold tracking-wide uppercase text-muted-foreground">
                  Recent downloads
                </h2>
              </div>
              <ul className="divide-y divide-border">
                {recentDownloads.map(({ g, h }) => (
                  <li
                    key={g.id}
                    className="flex items-center gap-3 py-2.5 first:pt-0 last:pb-0"
                  >
                    <div className="h-10 w-10 rounded-md bg-secondary overflow-hidden shrink-0">
                      {g.cover_url && (
                        <img
                          src={g.cover_url}
                          alt=""
                          className="w-full h-full object-cover"
                        />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{g.title}</p>
                      <p className="text-xs text-muted-foreground flex items-center gap-1.5">
                        <Package className="h-3 w-3" />
                        {h!.platform ?? "—"} · v{h!.version ?? "?"}
                      </p>
                    </div>
                    <span className="text-xs text-muted-foreground">
                      {formatRelative(h!.downloaded_at)}
                    </span>
                  </li>
                ))}
              </ul>
            </Card>
          )}

          {loading ? (
            <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-5">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="aspect-[3/4] rounded-2xl" />
              ))}
            </div>
          ) : games.length === 0 ? (
            <div className="text-center py-20 text-muted-foreground">
              <p className="text-lg">Your library is empty.</p>
              <Button asChild className="mt-4 rounded-2xl">
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
                    className="overflow-hidden rounded-2xl border-border bg-card/40 flex flex-col"
                  >
                    <Link
                      to={`/store/${g.slug}`}
                      className="block aspect-[3/4] bg-secondary overflow-hidden"
                    >
                      {g.cover_url ? (
                        <img
                          src={g.cover_url}
                          alt={g.title}
                          className="w-full h-full object-cover"
                        />
                      ) : null}
                    </Link>
                    <div className="p-3 space-y-2 flex-1 flex flex-col">
                      <h3 className="font-semibold text-sm truncate">{g.title}</h3>
                      <div className="flex items-center gap-1.5 flex-wrap">
                        {h ? (
                          <Badge
                            variant="secondary"
                            className="text-[10px] px-1.5 py-0"
                          >
                            <Clock className="h-2.5 w-2.5 mr-1" />
                            {formatRelative(h.downloaded_at)}
                          </Badge>
                        ) : (
                          <Badge
                            variant="outline"
                            className="text-[10px] px-1.5 py-0"
                          >
                            Not downloaded
                          </Badge>
                        )}
                      </div>
                      <Button
                        size="sm"
                        onClick={() => handleDownload(g.id)}
                        disabled={busyId === g.id}
                        className="w-full rounded-xl mt-auto"
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
        </section>
      </main>
    </div>
  );
};

export default Library;
