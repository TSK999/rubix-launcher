import { useState } from "react";
import { Clock, Gamepad2, Heart, Loader2, Pencil, Play, Sparkles, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { searchRawg } from "@/lib/rawg";
import type { Game } from "@/lib/game-types";

type Props = {
  game: Game | null;
  onClose: () => void;
  onLaunch: (g: Game) => void;
  onEdit: (g: Game) => void;
  onDelete: (id: string) => void;
  onToggleFavorite: (id: string) => void;
  onUpdate: (id: string, patch: Partial<Game>) => void;
};

const formatDate = (ts?: number) => {
  if (!ts) return "Never";
  const d = new Date(ts);
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
};

export const GameDetail = ({
  game,
  onClose,
  onLaunch,
  onEdit,
  onDelete,
  onToggleFavorite,
  onUpdate,
}: Props) => {
  const [refreshing, setRefreshing] = useState(false);

  const refreshMetadata = async () => {
    if (!game) return;
    setRefreshing(true);
    try {
      const results = await searchRawg(game.title, 1);
      const top = results[0];
      if (!top) {
        toast("No match found on RAWG");
        return;
      }
      onUpdate(game.id, {
        cover: top.cover ?? game.cover,
        genre: top.genre ?? game.genre,
        developer: top.developer ?? game.developer,
        description: top.description ?? game.description,
      });
      toast.success(`Updated from: ${top.title}`);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Unknown error";
      toast.error("Refresh failed", { description: msg });
    } finally {
      setRefreshing(false);
    }
  };

  return (
    <Sheet open={!!game} onOpenChange={(o) => !o && onClose()}>
        <SheetContent
          side="right"
          className="w-full sm:max-w-2xl bg-card border-border p-0 overflow-y-auto"
        >
        {game && (
          <>
            {/* Hero banner */}
            <div className="relative aspect-video bg-secondary overflow-hidden">
              {game.cover ? (
                <img
                  src={game.cover}
                  alt={`${game.title} cover`}
                  className="h-full w-full object-cover"
                />
              ) : (
                <div className="h-full w-full grid place-items-center bg-[image:var(--gradient-primary)] opacity-40">
                  <Gamepad2 className="h-20 w-20" />
                </div>
              )}
              <div className="absolute inset-0 bg-gradient-to-t from-card via-card/40 to-transparent" />

              <button
                onClick={onClose}
                className="absolute top-4 right-4 h-9 w-9 grid place-items-center rounded-full bg-background/60 backdrop-blur-sm hover:bg-background/80 transition-colors"
                aria-label="Close"
              >
                <X className="h-4 w-4" />
              </button>

              <button
                onClick={() => onToggleFavorite(game.id)}
                className={cn(
                  "absolute top-4 left-4 h-9 w-9 grid place-items-center rounded-full backdrop-blur-sm transition-colors",
                  game.favorite
                    ? "bg-primary/30 text-primary"
                    : "bg-background/60 text-foreground hover:bg-background/80"
                )}
                aria-label="Toggle favorite"
              >
                <Heart className={cn("h-4 w-4", game.favorite && "fill-current")} />
              </button>
            </div>

            <div className="p-6 -mt-16 relative space-y-6">
              <div>
                <h2 className="text-3xl font-bold tracking-tight">{game.title}</h2>
                <div className="flex flex-wrap items-center gap-2 mt-2 text-sm text-muted-foreground">
                  {game.developer && <span>{game.developer}</span>}
                  {game.developer && game.genre && <span>·</span>}
                  {game.genre && (
                    <span className="px-2 py-0.5 rounded-full bg-secondary text-xs">
                      {game.genre}
                    </span>
                  )}
                  {game.status && (
                    <span className="px-2 py-0.5 rounded-full bg-primary/90 text-primary-foreground text-[10px] font-semibold uppercase tracking-wider">
                      {game.status === "early-access" ? "Early Access" : "Beta"}
                    </span>
                  )}
                </div>
              </div>

              <div className="flex flex-wrap gap-2">
                <Button
                  onClick={() => onLaunch(game)}
                  size="lg"
                  className="rounded-2xl bg-[image:var(--gradient-primary)] shadow-[var(--glow-primary)] flex-1 min-w-[140px]"
                >
                  <Play className="h-4 w-4 mr-2 fill-current" /> Play
                </Button>
                <Button
                  onClick={() => onEdit(game)}
                  variant="secondary"
                  size="lg"
                  className="rounded-2xl"
                >
                  <Pencil className="h-4 w-4 mr-2" /> Edit
                </Button>
                <Button
                  onClick={refreshMetadata}
                  variant="secondary"
                  size="lg"
                  disabled={refreshing}
                  className="rounded-2xl"
                  title="Refresh cover & metadata from RAWG"
                >
                  {refreshing ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Sparkles className="h-4 w-4" />
                  )}
                </Button>
                <Button
                  onClick={() => {
                    onDelete(game.id);
                    onClose();
                  }}
                  variant="ghost"
                  size="lg"
                  className="rounded-2xl text-muted-foreground hover:bg-destructive/20 hover:text-destructive"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>

              {game.description && (
                <div>
                  <h3 className="text-xs uppercase tracking-wider text-muted-foreground font-medium mb-2">
                    About
                  </h3>
                  <p className="text-sm leading-relaxed text-foreground/90 whitespace-pre-wrap">
                    {game.description}
                  </p>
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-2xl bg-secondary/60 p-4">
                  <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
                    <Clock className="h-3 w-3" /> Last played
                  </div>
                  <p className="font-semibold">{formatDate(game.lastPlayedAt)}</p>
                </div>
                <div className="rounded-2xl bg-secondary/60 p-4">
                  <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
                    <Play className="h-3 w-3" /> Times launched
                  </div>
                  <p className="font-semibold">{game.playCount ?? 0}</p>
                </div>
              </div>

              {game.path && (
                <div>
                  <h3 className="text-xs uppercase tracking-wider text-muted-foreground font-medium mb-2">
                    Launch target
                  </h3>
                  <code className="block text-xs bg-secondary rounded-xl px-3 py-2 text-foreground/80 break-all">
                    {game.path}
                  </code>
                </div>
              )}
            </div>
          </>
        )}
        </SheetContent>
    </Sheet>
  );
};
