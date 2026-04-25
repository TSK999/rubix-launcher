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
import {
  Loader2,
  ShoppingCart,
  Check,
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  Cpu,
  MemoryStick,
  HardDrive,
  Monitor,
  Gauge,
} from "lucide-react";
import { toast } from "sonner";

type ReqRow = {
  type: "minimum" | "recommended";
  os: string | null;
  cpu: string | null;
  gpu: string | null;
  ram_gb: number | null;
  storage_gb: number | null;
};

const REQ_FIELDS: {
  key: keyof ReqRow;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  fmt?: (v: any) => string;
}[] = [
  { key: "os", label: "OS", icon: Monitor },
  { key: "cpu", label: "CPU", icon: Cpu },
  { key: "gpu", label: "GPU", icon: Gauge },
  { key: "ram_gb", label: "RAM", icon: MemoryStick, fmt: (v) => `${v} GB` },
  {
    key: "storage_gb",
    label: "Storage",
    icon: HardDrive,
    fmt: (v) => `${v} GB`,
  },
];

const StoreGame = () => {
  const { slug } = useParams();
  const navigate = useNavigate();
  const { user } = useRubixAuth();
  const [game, setGame] = useState<any>(null);
  const [screenshots, setScreenshots] = useState<{ url: string }[]>([]);
  const [reqs, setReqs] = useState<ReqRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [owned, setOwned] = useState(false);
  const [buying, setBuying] = useState(false);
  const [shotIdx, setShotIdx] = useState(0);

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
        supabase
          .from("game_screenshots")
          .select("url")
          .eq("game_id", g.id)
          .order("sort_order"),
        supabase.from("game_requirements").select("*").eq("game_id", g.id),
      ]);
      setScreenshots(ss ?? []);
      setReqs((rq ?? []) as ReqRow[]);

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

  // Keyboard arrow navigation for the carousel
  useEffect(() => {
    if (screenshots.length < 2) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight")
        setShotIdx((i) => (i + 1) % screenshots.length);
      if (e.key === "ArrowLeft")
        setShotIdx((i) => (i - 1 + screenshots.length) % screenshots.length);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [screenshots.length]);

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
    toast.success("Added to your library!", {
      description: "Open the Library to download.",
    });
  };

  const min = reqs.find((r) => r.type === "minimum");
  const rec = reqs.find((r) => r.type === "recommended");
  const hasReqs = !!(min || rec);

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
                      <img
                        src={game.cover_url}
                        alt={game.title}
                        className="w-full h-full object-cover"
                      />
                    ) : null}
                  </div>
                </div>
                <div className="md:col-span-2 space-y-4">
                  <div>
                    <h1 className="text-3xl font-bold tracking-tight">
                      {game.title}
                    </h1>
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
                      {game.price_cents === 0
                        ? "Get for free"
                        : `Buy for ${formatPrice(game.price_cents)}`}
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
                  <div className="relative group rounded-2xl overflow-hidden bg-secondary">
                    <img
                      src={screenshots[shotIdx].url}
                      alt={`Screenshot ${shotIdx + 1}`}
                      className="w-full aspect-video object-cover"
                    />
                    {screenshots.length > 1 && (
                      <>
                        <button
                          aria-label="Previous screenshot"
                          onClick={() =>
                            setShotIdx(
                              (i) =>
                                (i - 1 + screenshots.length) %
                                screenshots.length,
                            )
                          }
                          className="absolute left-3 top-1/2 -translate-y-1/2 grid place-items-center h-10 w-10 rounded-full bg-background/70 backdrop-blur text-foreground hover:bg-background transition opacity-0 group-hover:opacity-100"
                        >
                          <ChevronLeft className="h-5 w-5" />
                        </button>
                        <button
                          aria-label="Next screenshot"
                          onClick={() =>
                            setShotIdx((i) => (i + 1) % screenshots.length)
                          }
                          className="absolute right-3 top-1/2 -translate-y-1/2 grid place-items-center h-10 w-10 rounded-full bg-background/70 backdrop-blur text-foreground hover:bg-background transition opacity-0 group-hover:opacity-100"
                        >
                          <ChevronRight className="h-5 w-5" />
                        </button>
                        <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-background/70 backdrop-blur text-xs text-foreground">
                          {shotIdx + 1} / {screenshots.length}
                        </div>
                      </>
                    )}
                  </div>
                  {screenshots.length > 1 && (
                    <div className="flex gap-2 mt-3 overflow-x-auto pb-1">
                      {screenshots.map((s, i) => (
                        <button
                          key={i}
                          onClick={() => setShotIdx(i)}
                          className={`shrink-0 rounded-lg overflow-hidden ring-2 transition ${
                            i === shotIdx
                              ? "ring-primary"
                              : "ring-transparent opacity-60 hover:opacity-100"
                          }`}
                        >
                          <img
                            src={s.url}
                            alt=""
                            className="h-16 w-28 object-cover"
                          />
                        </button>
                      ))}
                    </div>
                  )}
                </section>
              )}

              {hasReqs && (
                <section>
                  <h2 className="text-lg font-semibold mb-3">
                    System requirements
                  </h2>
                  <Card className="rounded-2xl border-border bg-card/40 overflow-hidden">
                    <div className="grid grid-cols-[120px_1fr_1fr] text-sm">
                      <div className="px-4 py-3 bg-secondary/40 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        Spec
                      </div>
                      <div className="px-4 py-3 bg-secondary/40 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        Minimum
                      </div>
                      <div className="px-4 py-3 bg-secondary/40 text-xs font-semibold uppercase tracking-wide text-primary">
                        Recommended
                      </div>
                      {REQ_FIELDS.map(({ key, label, icon: Icon, fmt }) => {
                        const minV = min?.[key];
                        const recV = rec?.[key];
                        if (minV == null && recV == null) return null;
                        return (
                          <div key={key} className="contents">
                            <div className="px-4 py-3 border-t border-border flex items-center gap-2 text-muted-foreground">
                              <Icon className="h-4 w-4" />
                              {label}
                            </div>
                            <div className="px-4 py-3 border-t border-border">
                              {minV != null && minV !== ""
                                ? fmt
                                  ? fmt(minV)
                                  : String(minV)
                                : "—"}
                            </div>
                            <div className="px-4 py-3 border-t border-border font-medium">
                              {recV != null && recV !== ""
                                ? fmt
                                  ? fmt(recV)
                                  : String(recV)
                                : "—"}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </Card>
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
