import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Sidebar } from "@/components/Sidebar";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { formatPrice, AGE_RATINGS } from "@/lib/store";
import { ShoppingBag, Search } from "lucide-react";

type StoreGame = {
  id: string;
  title: string;
  slug: string;
  cover_url: string | null;
  price_cents: number;
  age_rating: string;
  created_at: string;
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
      .select("id, title, slug, cover_url, price_cents, age_rating, created_at")
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
            <ShoppingBag className="h-7 w-7 text-primary" />
            <h1 className="text-3xl font-bold tracking-tight">RUBIX Store</h1>
          </div>
          <p className="text-muted-foreground mb-5">
            Discover games from independent developers.
          </p>

          <div className="flex flex-wrap items-center gap-3">
            <div className="relative flex-1 min-w-[220px] max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search games by title…"
                className="pl-9 rounded-xl"
              />
            </div>
            <Select value={age} onValueChange={setAge}>
              <SelectTrigger className="w-[140px] rounded-xl">
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
              <SelectTrigger className="w-[170px] rounded-xl">
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
        </header>

        <section className="p-8">
          {loading ? (
            <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-5">
              {Array.from({ length: 8 }).map((_, i) => (
                <Skeleton key={i} className="aspect-[3/4] rounded-2xl" />
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-20 text-muted-foreground">
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
                <Link key={g.id} to={`/store/${g.slug}`}>
                  <Card className="group overflow-hidden hover:ring-2 hover:ring-primary transition-all rounded-2xl border-border bg-card/40">
                    <div className="aspect-[3/4] bg-secondary overflow-hidden">
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
                    </div>
                    <div className="p-3 space-y-2">
                      <h3 className="font-semibold text-sm truncate">{g.title}</h3>
                      <div className="flex items-center justify-between">
                        <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                          {g.age_rating}
                        </Badge>
                        <span className="text-sm font-medium text-primary">
                          {formatPrice(g.price_cents)}
                        </span>
                      </div>
                    </div>
                  </Card>
                </Link>
              ))}
            </div>
          )}
        </section>
      </main>
    </div>
  );
};

export default Store;
