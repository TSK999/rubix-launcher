import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Sidebar } from "@/components/Sidebar";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { formatPrice } from "@/lib/store";
import { ShoppingBag } from "lucide-react";

type StoreGame = {
  id: string;
  title: string;
  slug: string;
  cover_url: string | null;
  price_cents: number;
  age_rating: string;
};

const Store = () => {
  const [games, setGames] = useState<StoreGame[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    document.title = "RUBIX Store — Discover games";
    supabase
      .from("games")
      .select("id, title, slug, cover_url, price_cents, age_rating")
      .eq("status", "approved")
      .order("created_at", { ascending: false })
      .then(({ data }) => {
        setGames((data ?? []) as StoreGame[]);
        setLoading(false);
      });
  }, []);

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
          <p className="text-muted-foreground">Discover games from independent developers.</p>
        </header>

        <section className="p-8">
          {loading ? (
            <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-5">
              {Array.from({ length: 8 }).map((_, i) => (
                <Skeleton key={i} className="aspect-[3/4] rounded-2xl" />
              ))}
            </div>
          ) : games.length === 0 ? (
            <div className="text-center py-20 text-muted-foreground">
              <p className="text-lg">No games published yet.</p>
              <p className="text-sm mt-2">Check back soon — new releases land here regularly.</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-5">
              {games.map((g) => (
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
