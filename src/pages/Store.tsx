import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Sidebar } from "@/components/Sidebar";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { formatPrice, AGE_RATINGS } from "@/lib/store";
import { ShoppingBag, Search, Sparkles, Flame, ArrowRight } from "lucide-react";

type StoreGame = {
  id: string;
  title: string;
  slug: string;
  cover_url: string | null;
  price_cents: number;
  age_rating: string;
  created_at: string;
  description?: string | null;
};

type SortMode = "newest" | "price_asc" | "price_desc" | "title";

const Store = () => {
  const [games, setGames] = useState<StoreGame[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [age, setAge] = useState<string>("all");
  const [sort, setSort] = useState<SortMode>("newest");

  useEffect(() => {
    document.title = "RUBIX Store — Discover games";
    supabase
      .from("games")
      .select("id, title, slug, cover_url, price_cents, age_rating, created_at, description")
      .eq("status", "approved")
      .order("created_at", { ascending: false })
      .then(({ data }) => {
        setGames((data ?? []) as StoreGame[]);
        setLoading(false);
      });
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    let list = games.filter((g) => {
      if (age !== "all" && g.age_rating !== age) return false;
      if (q && !g.title.toLowerCase().includes(q)) return false;
      return true;
    });
    switch (sort) {
      case "price_asc":
        list = [...list].sort((a, b) => a.price_cents - b.price_cents);
        break;
      case "price_desc":
        list = [...list].sort((a, b) => b.price_cents - a.price_cents);
        break;
      case "title":
        list = [...list].sort((a, b) => a.title.localeCompare(b.title));
        break;
      default:
        list = [...list].sort(
          (a, b) => +new Date(b.created_at) - +new Date(a.created_at),
        );
    }
    return list;
  }, [games, query, age, sort]);

  const featured = games[0];
  const newReleases = useMemo(
    () =>
      [...games]
        .sort((a, b) => +new Date(b.created_at) - +new Date(a.created_at))
        .slice(0, 6),
    [games],
  );

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
        {/* Hero */}
        <section className="relative overflow-hidden border-b border-border">
          {featured?.cover_url && (
            <div
              aria-hidden
              className="absolute inset-0 opacity-40 blur-2xl scale-110"
              style={{
                backgroundImage: `url(${featured.cover_url})`,
                backgroundSize: "cover",
                backgroundPosition: "center",
              }}
            />
          )}
          <div className="absolute inset-0 bg-gradient-to-b from-background/40 via-background/80 to-background" />
          <div className="absolute inset-0 bg-[image:var(--gradient-primary)] opacity-10 mix-blend-overlay" />

          <div className="relative px-8 pt-12 pb-10 rubix-fade-up">
            <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-[0.2em] text-primary/90 mb-4">
              <span className="h-1.5 w-1.5 rounded-full bg-primary rubix-pulse-soft" />
              <Sparkles className="h-3.5 w-3.5" />
              RUBIX Store
            </div>
            <h1 className="text-5xl md:text-6xl font-bold tracking-tight max-w-3xl leading-[1.05]">
              Discover games <span className="bg-clip-text text-transparent bg-[image:var(--gradient-primary)]">crafted by indie devs</span>.
            </h1>
            <p className="text-muted-foreground mt-4 max-w-2xl text-lg">
              Hand-picked releases, fair pricing, instant downloads. Built for
              players, powered by creators.
            </p>

            {featured && (
              <div className="mt-8 flex flex-wrap items-center gap-4">
                <Link to={`/store/${featured.slug}`}>
                  <Button
                    size="lg"
                    className="rounded-2xl bg-[image:var(--gradient-primary)] hover:opacity-90 shadow-[var(--glow-primary)] h-12 px-6 text-base transition-transform hover:-translate-y-0.5"
                  >
                    <Flame className="h-4 w-4 mr-2" />
                    Featured: {featured.title}
                    <ArrowRight className="h-4 w-4 ml-2" />
                  </Button>
                </Link>
                <span className="text-sm text-muted-foreground">
                  {games.length} {games.length === 1 ? "title" : "titles"} available now
                </span>
              </div>
            )}
          </div>
        </section>

        {/* Filter bar */}
        <div className="sticky top-0 z-10 px-8 py-4 rubix-glass border-b border-border">
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative flex-1 min-w-[220px] max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search games by title…"
                className="pl-9 rounded-xl bg-card/60 border-border"
              />
            </div>
            <Select value={age} onValueChange={setAge}>
              <SelectTrigger className="w-[140px] rounded-xl bg-card/60">
                <SelectValue placeholder="Age" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All ages</SelectItem>
                {AGE_RATINGS.map((r) => (
                  <SelectItem key={r} value={r}>
                    {r}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={sort} onValueChange={(v) => setSort(v as SortMode)}>
              <SelectTrigger className="w-[180px] rounded-xl bg-card/60">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="newest">Newest</SelectItem>
                <SelectItem value="title">Title (A–Z)</SelectItem>
                <SelectItem value="price_asc">Price: low to high</SelectItem>
                <SelectItem value="price_desc">Price: high to low</SelectItem>
              </SelectContent>
            </Select>
            {!loading && (
              <span className="text-xs text-muted-foreground ml-auto">
                {filtered.length} of {games.length}
              </span>
            )}
          </div>
        </div>

        <section className="px-8 pt-8 pb-12 space-y-12">
          {/* New releases rail (only when not filtering) */}
          {!loading && newReleases.length > 1 && !query && age === "all" && (
            <div>
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-semibold tracking-tight flex items-center gap-2">
                  <Sparkles className="h-4 w-4 text-primary" />
                  Fresh on RUBIX
                </h2>
              </div>
              <div className="flex gap-4 overflow-x-auto pb-3 -mx-1 px-1 snap-x snap-mandatory">
                {newReleases.map((g) => (
                  <Link
                    key={g.id}
                    to={`/store/${g.slug}`}
                    className="snap-start shrink-0 w-[280px] group"
                  >
                    <div className="relative aspect-video rounded-2xl overflow-hidden bg-secondary border border-border group-hover:border-primary/60 transition-all">
                      {g.cover_url ? (
                        <img
                          src={g.cover_url}
                          alt={g.title}
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                          loading="lazy"
                        />
                      ) : (
                        <div className="w-full h-full grid place-items-center text-xs text-muted-foreground">
                          No cover
                        </div>
                      )}
                      <div className="absolute inset-0 bg-gradient-to-t from-background via-background/30 to-transparent" />
                      <div className="absolute bottom-0 left-0 right-0 p-3">
                        <h3 className="font-semibold text-sm truncate">{g.title}</h3>
                        <div className="flex items-center justify-between mt-1">
                          <Badge variant="outline" className="text-[10px] px-1.5 py-0 bg-background/60 backdrop-blur">
                            {g.age_rating}
                          </Badge>
                          <span className="text-sm font-semibold text-primary">
                            {formatPrice(g.price_cents)}
                          </span>
                        </div>
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          )}

          <div>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-semibold tracking-tight flex items-center gap-2">
                <ShoppingBag className="h-4 w-4 text-primary" />
                {query || age !== "all" ? "Results" : "All games"}
              </h2>
            </div>

            {loading ? (
              <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-5">
                {Array.from({ length: 8 }).map((_, i) => (
                  <Skeleton key={i} className="aspect-[3/4] rounded-2xl" />
                ))}
              </div>
            ) : filtered.length === 0 ? (
              <div className="text-center py-20 text-muted-foreground border border-dashed border-border rounded-2xl">
                <ShoppingBag className="h-10 w-10 mx-auto mb-3 opacity-40" />
                <p className="text-lg">
                  {games.length === 0
                    ? "No games published yet."
                    : "No games match your filters."}
                </p>
                <p className="text-sm mt-2">
                  {games.length === 0
                    ? "Check back soon — new releases land here regularly."
                    : "Try clearing the search or age filter."}
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-5">
                {filtered.map((g) => (
                  <Link key={g.id} to={`/store/${g.slug}`} className="group">
                    <Card className="overflow-hidden rounded-2xl border-border bg-card/40 transition-all duration-300 group-hover:-translate-y-1 group-hover:border-primary/60 group-hover:shadow-[var(--glow-primary)]">
                      <div className="aspect-[3/4] bg-secondary overflow-hidden relative">
                        {g.cover_url ? (
                          <img
                            src={g.cover_url}
                            alt={g.title}
                            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                            loading="lazy"
                          />
                        ) : (
                          <div className="w-full h-full grid place-items-center text-muted-foreground text-xs">
                            No cover
                          </div>
                        )}
                        <div className="absolute inset-0 bg-gradient-to-t from-background/90 via-background/0 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                        <Badge
                          variant="outline"
                          className="absolute top-2 left-2 text-[10px] px-1.5 py-0 bg-background/70 backdrop-blur border-border/60"
                        >
                          {g.age_rating}
                        </Badge>
                      </div>
                      <div className="p-3 space-y-1.5">
                        <h3 className="font-semibold text-sm truncate">{g.title}</h3>
                        <div className="flex items-center justify-between">
                          <span className="text-xs text-muted-foreground">
                            {g.price_cents === 0 ? "Free to play" : "Buy now"}
                          </span>
                          <span className="text-sm font-semibold text-primary">
                            {formatPrice(g.price_cents)}
                          </span>
                        </div>
                      </div>
                    </Card>
                  </Link>
                ))}
              </div>
            )}
          </div>
        </section>
      </main>
    </div>
  );
};

export default Store;
