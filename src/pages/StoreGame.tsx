import { useEffect, useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Sidebar } from "@/components/Sidebar";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useRubixAuth } from "@/hooks/useRubixAuth";
import { formatPrice } from "@/lib/store";
import { Loader2, ShoppingCart, Check, ArrowLeft } from "lucide-react";
import { toast } from "sonner";

const StoreGame = () => {
  const { slug } = useParams();
  const navigate = useNavigate();
  const { user } = useRubixAuth();
  const [game, setGame] = useState<any>(null);
  const [screenshots, setScreenshots] = useState<{ url: string }[]>([]);
  const [reqs, setReqs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [owned, setOwned] = useState(false);
  const [buying, setBuying] = useState(false);

  useEffect(() => {
    if (!slug) return;
    (async () => {
      const { data: g } = await supabase
        .from("games")
        .select("*")
        .eq("slug", slug)
        .eq("status", "approved")
        .maybeSingle();
      if (!g) {
        setLoading(false);
        return;
      }
      setGame(g);
      document.title = `${g.title} — RUBIX Store`;

      const [{ data: ss }, { data: rq }] = await Promise.all([
        supabase.from("game_screenshots").select("url").eq("game_id", g.id).order("sort_order"),
        supabase.from("game_requirements").select("*").eq("game_id", g.id),
      ]);
      setScreenshots(ss ?? []);
      setReqs(rq ?? []);

      if (user) {
        const { data: o } = await supabase
          .from("orders")
          .select("id")
          .eq("user_id", user.id)
          .eq("game_id", g.id)
          .maybeSingle();
        setOwned(!!o);
      }
      setLoading(false);
    })();
  }, [slug, user]);

  const handleBuy = async () => {
    if (!user || !game) return;
    setBuying(true);
    const { error } = await supabase.from("orders").insert({
      user_id: user.id,
      game_id: game.id,
      price_cents: game.price_cents,
      status: "completed",
    });
    setBuying(false);
    if (error) {
      toast.error("Purchase failed", { description: error.message });
      return;
    }
    setOwned(true);
    toast.success("Added to your library!", { description: "Open the Library to download." });
  };

  const min = reqs.find((r) => r.type === "minimum");
  const rec = reqs.find((r) => r.type === "recommended");

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
        <div className="p-8 max-w-5xl mx-auto">
          <button
            onClick={() => navigate("/store")}
            className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground mb-6"
          >
            <ArrowLeft className="h-4 w-4" /> Back to store
          </button>

          {loading ? (
            <Skeleton className="h-96 rounded-2xl" />
          ) : !game ? (
            <div className="text-center py-20 text-muted-foreground">
              <p>Game not found.</p>
            </div>
          ) : (
            <div className="space-y-8">
              <div className="grid md:grid-cols-3 gap-6">
                <div className="md:col-span-1">
                  <div className="aspect-[3/4] rounded-2xl overflow-hidden bg-secondary">
                    {game.cover_url ? (
                      <img src={game.cover_url} alt={game.title} className="w-full h-full object-cover" />
                    ) : null}
                  </div>
                </div>
                <div className="md:col-span-2 space-y-4">
                  <div>
                    <h1 className="text-3xl font-bold tracking-tight">{game.title}</h1>
                    <div className="flex items-center gap-2 mt-2">
                      <Badge variant="outline">{game.age_rating}</Badge>
                      <span className="text-2xl font-bold text-primary">
                        {formatPrice(game.price_cents)}
                      </span>
                    </div>
                  </div>
                  <p className="text-sm text-muted-foreground whitespace-pre-line leading-relaxed">
                    {game.description || "No description provided."}
                  </p>
                  {owned ? (
                    <Button asChild size="lg" className="rounded-2xl">
                      <Link to="/library">
                        <Check className="h-4 w-4 mr-2" /> In your library
                      </Link>
                    </Button>
                  ) : user ? (
                    <Button
                      size="lg"
                      onClick={handleBuy}
                      disabled={buying}
                      className="rounded-2xl bg-[image:var(--gradient-primary)] hover:opacity-90 shadow-[var(--glow-primary)]"
                    >
                      {buying ? (
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      ) : (
                        <ShoppingCart className="h-4 w-4 mr-2" />
                      )}
                      {game.price_cents === 0 ? "Get for free" : `Buy for ${formatPrice(game.price_cents)}`}
                    </Button>
                  ) : (
                    <Button asChild size="lg" className="rounded-2xl">
                      <Link to="/login">Sign in to buy</Link>
                    </Button>
                  )}
                </div>
              </div>

              {screenshots.length > 0 && (
                <section>
                  <h2 className="text-lg font-semibold mb-3">Screenshots</h2>
                  <div className="flex gap-3 overflow-x-auto pb-2 snap-x">
                    {screenshots.map((s, i) => (
                      <img
                        key={i}
                        src={s.url}
                        alt=""
                        className="h-56 rounded-xl object-cover snap-start shrink-0"
                      />
                    ))}
                  </div>
                </section>
              )}

              {(min || rec) && (
                <section>
                  <h2 className="text-lg font-semibold mb-3">System requirements</h2>
                  <div className="grid md:grid-cols-2 gap-4">
                    {[
                      { label: "Minimum", req: min },
                      { label: "Recommended", req: rec },
                    ].map(
                      ({ label, req }) =>
                        req && (
                          <Card key={label} className="p-4 rounded-xl border-border bg-card/40">
                            <h3 className="font-semibold mb-2">{label}</h3>
                            <dl className="text-sm text-muted-foreground space-y-1">
                              {req.os && <div><span className="text-foreground">OS:</span> {req.os}</div>}
                              {req.cpu && <div><span className="text-foreground">CPU:</span> {req.cpu}</div>}
                              {req.gpu && <div><span className="text-foreground">GPU:</span> {req.gpu}</div>}
                              {req.ram_gb && <div><span className="text-foreground">RAM:</span> {req.ram_gb} GB</div>}
                              {req.storage_gb && <div><span className="text-foreground">Storage:</span> {req.storage_gb} GB</div>}
                            </dl>
                          </Card>
                        )
                    )}
                  </div>
                </section>
              )}
            </div>
          )}
        </div>
      </main>
    </div>
  );
};

export default StoreGame;
