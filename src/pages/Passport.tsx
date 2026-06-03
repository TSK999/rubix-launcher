import { useEffect, useMemo, useState } from "react";
import { Sidebar } from "@/components/Sidebar";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { useRubixAuth } from "@/hooks/useRubixAuth";
import {
  fetchCatalog,
  fetchEarned,
  fetchPlaytime,
  sweepStampsOnLogin,
  RARITY_RING,
  RARITY_LABEL,
  RARITY_TEXT,
  type PassportStamp,
  type EarnedStamp,
  type GamePlaytime,
  type Rarity,
} from "@/lib/passport";
import { Loader2, Lock, BookMarked, Sparkles, Stamp } from "lucide-react";
import { cn } from "@/lib/utils";

const formatDate = (iso: string) =>
  new Date(iso).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });

const StampBadge = ({
  stamp,
  earned,
}: {
  stamp: PassportStamp;
  earned?: EarnedStamp;
}) => {
  const locked = !earned;
  return (
    <div className="group flex flex-col items-center text-center gap-2 w-28">
      <div
        className={cn(
          "relative grid place-items-center rounded-full ring-4 transition-all h-20 w-20 text-3xl",
          locked
            ? "bg-secondary/40 ring-border/40 grayscale opacity-50"
            : cn("bg-card", RARITY_RING[stamp.rarity], "group-hover:scale-105"),
          stamp.rarity === "legendary" && !locked && "animate-pulse",
        )}
      >
        <span
          className={cn(
            "select-none",
            !locked && "drop-shadow-[0_2px_6px_rgba(0,0,0,0.6)]",
          )}
        >
          {stamp.icon_emoji}
        </span>
        {locked && (
          <Lock className="absolute h-4 w-4 text-muted-foreground" />
        )}
        {!locked && (
          <span className="absolute -bottom-1 -right-1 text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-background border border-border uppercase tracking-wider">
            <span className={RARITY_TEXT[stamp.rarity]}>
              {stamp.rarity[0]}
            </span>
          </span>
        )}
      </div>
      <div className="space-y-0.5">
        <p
          className={cn(
            "text-xs font-semibold leading-tight",
            locked && "text-muted-foreground",
          )}
        >
          {stamp.name}
        </p>
        <p className="text-[10px] text-muted-foreground leading-tight line-clamp-2">
          {stamp.description}
        </p>
        {earned && (
          <p className="text-[10px] text-primary/80 font-medium">
            {formatDate(earned.earned_at)}
          </p>
        )}
      </div>
    </div>
  );
};

const Passport = () => {
  const { user } = useRubixAuth();
  const [catalog, setCatalog] = useState<PassportStamp[]>([]);
  const [earned, setEarned] = useState<EarnedStamp[]>([]);
  const [playtimes, setPlaytimes] = useState<GamePlaytime[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    document.title = "Passport — RUBIX";
    if (!user) {
      setLoading(false);
      return;
    }
    (async () => {
      await sweepStampsOnLogin(user.id);
      const [c, e, p] = await Promise.all([
        fetchCatalog(),
        fetchEarned(user.id),
        fetchPlaytime(user.id),
      ]);
      setCatalog(c);
      setEarned(e);
      setPlaytimes(p);
      setLoading(false);
    })();
  }, [user]);

  const earnedByStamp = useMemo(() => {
    const m = new Map<string, EarnedStamp>();
    earned.forEach((e) => {
      const existing = m.get(e.stamp_id);
      if (!existing || e.earned_at < existing.earned_at) m.set(e.stamp_id, e);
    });
    return m;
  }, [earned]);

  const globalStamps = useMemo(
    () => catalog.filter((s) => !s.game_key),
    [catalog],
  );

  const earnedCount = earned.length;
  const totalCount = catalog.length;
  const completion = totalCount > 0 ? (earnedCount / totalCount) * 100 : 0;

  const totalPlayHours = useMemo(
    () =>
      Math.round(
        playtimes.reduce((acc, p) => acc + p.total_seconds, 0) / 3600,
      ),
    [playtimes],
  );

  const rarityCounts = useMemo(() => {
    const counts: Record<Rarity, { earned: number; total: number }> = {
      common: { earned: 0, total: 0 },
      rare: { earned: 0, total: 0 },
      epic: { earned: 0, total: 0 },
      legendary: { earned: 0, total: 0 },
    };
    catalog.forEach((s) => {
      counts[s.rarity].total += 1;
      if (earnedByStamp.has(s.id)) counts[s.rarity].earned += 1;
    });
    return counts;
  }, [catalog, earnedByStamp]);

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
        sourceCounts={{
          steam: 0,
          epic: 0,
          ea: 0,
          xbox: 0,
          riot: 0,
          other: 0,
        }}
      />
      <main className="flex-1 overflow-y-auto">
        <section className="relative overflow-hidden border-b border-border">
          <div className="absolute inset-0 bg-[image:var(--gradient-primary)] opacity-10" />
          <div
            aria-hidden
            className="absolute inset-0 opacity-30"
            style={{
              backgroundImage:
                "radial-gradient(hsl(var(--primary)/0.15) 1px, transparent 1px)",
              backgroundSize: "24px 24px",
            }}
          />
          <div className="relative px-8 py-12 max-w-6xl">
            <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-[0.28em] text-primary/90 mb-4">
              <BookMarked className="h-3.5 w-3.5" />
              Your gaming passport
            </div>
            <h1 className="text-4xl md:text-5xl font-bold tracking-tight">
              The{" "}
              <span className="bg-clip-text text-transparent bg-[image:var(--gradient-primary)]">
                RUBIX Passport
              </span>
            </h1>
            <p className="text-muted-foreground mt-3 max-w-xl text-lg">
              Every game you play stamps a page. Collect milestones, mark
              memories, build a record of your gaming life.
            </p>

            <div className="mt-8 grid grid-cols-2 md:grid-cols-4 gap-3 max-w-3xl">
              <Card className="p-4 rounded-2xl border-border bg-card/40 backdrop-blur">
                <div className="text-xs uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                  <Stamp className="h-3 w-3" /> Stamps
                </div>
                <p className="text-2xl font-bold mt-1">
                  {earnedCount}
                  <span className="text-muted-foreground text-sm font-normal">
                    {" "}
                    / {totalCount}
                  </span>
                </p>
                <div className="mt-2 h-1.5 rounded-full bg-secondary overflow-hidden">
                  <div
                    className="h-full bg-[image:var(--gradient-primary)] transition-all"
                    style={{ width: `${completion}%` }}
                  />
                </div>
              </Card>
              <Card className="p-4 rounded-2xl border-border bg-card/40 backdrop-blur">
                <div className="text-xs uppercase tracking-wider text-muted-foreground">
                  Games tracked
                </div>
                <p className="text-2xl font-bold mt-1">{playtimes.length}</p>
              </Card>
              <Card className="p-4 rounded-2xl border-border bg-card/40 backdrop-blur">
                <div className="text-xs uppercase tracking-wider text-muted-foreground">
                  Total hours
                </div>
                <p className="text-2xl font-bold mt-1">{totalPlayHours}</p>
              </Card>
              <Card className="p-4 rounded-2xl border-border bg-card/40 backdrop-blur">
                <div className="text-xs uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                  <Sparkles className="h-3 w-3" /> Legendary
                </div>
                <p className="text-2xl font-bold mt-1 text-amber-300">
                  {rarityCounts.legendary.earned}
                  <span className="text-muted-foreground text-sm font-normal">
                    {" "}
                    / {rarityCounts.legendary.total}
                  </span>
                </p>
              </Card>
            </div>
          </div>
        </section>

        <section className="px-8 py-8 max-w-6xl">
          {loading ? (
            <div className="flex justify-center py-20">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <Tabs defaultValue="stamps" className="space-y-6">
              <TabsList className="rounded-xl">
                <TabsTrigger value="stamps" className="rounded-lg">
                  Stamps
                </TabsTrigger>
                <TabsTrigger value="games" className="rounded-lg">
                  Game pages
                </TabsTrigger>
              </TabsList>

              <TabsContent value="stamps" className="space-y-10">
                {(["legendary", "epic", "rare", "common"] as Rarity[]).map(
                  (rarity) => {
                    const stamps = globalStamps.filter(
                      (s) => s.rarity === rarity,
                    );
                    if (stamps.length === 0) return null;
                    return (
                      <div key={rarity}>
                        <div className="flex items-baseline gap-3 mb-5">
                          <h2
                            className={cn(
                              "text-lg font-semibold tracking-tight",
                              RARITY_TEXT[rarity],
                            )}
                          >
                            {RARITY_LABEL[rarity]}
                          </h2>
                          <span className="text-xs text-muted-foreground">
                            {rarityCounts[rarity].earned} of{" "}
                            {rarityCounts[rarity].total} collected
                          </span>
                        </div>
                        <Card className="rounded-3xl border-border bg-gradient-to-b from-card/60 to-card/20 p-8 backdrop-blur">
                          <div className="flex flex-wrap gap-6 justify-start">
                            {stamps.map((s) => (
                              <StampBadge
                                key={s.id}
                                stamp={s}
                                earned={earnedByStamp.get(s.id)}
                              />
                            ))}
                          </div>
                        </Card>
                      </div>
                    );
                  },
                )}
              </TabsContent>

              <TabsContent value="games" className="space-y-4">
                {playtimes.length === 0 ? (
                  <Card className="rounded-2xl border-dashed border-border p-12 text-center text-muted-foreground">
                    <BookMarked className="h-10 w-10 mx-auto mb-3 opacity-40" />
                    <p className="text-lg">No game pages yet.</p>
                    <p className="text-sm mt-1">
                      Launch any game from your library to open its first
                      passport page.
                    </p>
                  </Card>
                ) : (
                  playtimes
                    .sort((a, b) => b.total_seconds - a.total_seconds)
                    .map((p) => {
                      const hours = Math.floor(p.total_seconds / 3600);
                      const mins = Math.floor((p.total_seconds % 3600) / 60);
                      return (
                        <Card
                          key={p.game_key}
                          className="rounded-2xl border-border bg-card/40 p-5 flex items-center gap-4"
                        >
                          <div className="h-14 w-14 grid place-items-center rounded-xl bg-secondary text-2xl">
                            🎮
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="font-semibold truncate">
                              {p.title_snapshot ?? "Unknown game"}
                            </p>
                            <p className="text-xs text-muted-foreground mt-0.5">
                              First played {formatDate(p.first_launched_at)} ·
                              last {formatDate(p.last_launched_at)}
                            </p>
                          </div>
                          <div className="flex gap-2">
                            <Badge
                              variant="outline"
                              className="rounded-lg text-xs"
                            >
                              {hours}h {mins}m
                            </Badge>
                            <Badge
                              variant="outline"
                              className="rounded-lg text-xs"
                            >
                              {p.launch_count} launches
                            </Badge>
                          </div>
                        </Card>
                      );
                    })
                )}
              </TabsContent>
            </Tabs>
          )}
        </section>
      </main>
    </div>
  );
};

export default Passport;
