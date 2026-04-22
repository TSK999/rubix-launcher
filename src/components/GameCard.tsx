import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Gamepad2, GripVertical, Heart, Play } from "lucide-react";
import { getGameSource, type Game } from "@/lib/game-types";
import { Button } from "@/components/ui/button";
import { StoreIcon } from "@/components/StoreIcon";
import { cn } from "@/lib/utils";

const SOURCE_LABEL: Record<"steam" | "epic" | "ea" | "xbox" | "riot", string> = {
  steam: "Steam",
  epic: "Epic",
  ea: "EA",
  xbox: "Xbox",
  riot: "Riot",
};

const SOURCE_STYLES: Record<"steam" | "epic" | "ea" | "xbox" | "riot", string> = {
  steam: "bg-[#1b2838]/90 text-[#66c0f4] border border-[#66c0f4]/30",
  epic: "bg-black/80 text-white border border-white/20",
  ea: "bg-[#ea0029]/90 text-white border border-white/20",
  xbox: "bg-[#107c10]/90 text-white border border-white/20",
  riot: "bg-[#d13639]/90 text-white border border-white/20",
};

type Props = {
  game: Game;
  onOpen: (g: Game) => void;
  onLaunch: (g: Game) => void;
  onToggleFavorite: (id: string) => void;
};

export const GameCard = ({ game, onOpen, onLaunch, onToggleFavorite }: Props) => {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: game.id,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  };

  return (
    <article
      ref={setNodeRef}
      style={style}
      onClick={() => onOpen(game)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onOpen(game);
        }
      }}
      tabIndex={0}
      role="button"
      aria-label={`Open ${game.title}`}
      className={cn(
        "group rubix-card-focusable relative rounded-3xl bg-card border border-border overflow-hidden cursor-pointer",
        "transition-all hover:-translate-y-1 hover:shadow-[var(--glow-primary)] hover:border-primary/40",
        isDragging && "ring-2 ring-primary"
      )}
    >
      <div className="aspect-video bg-secondary overflow-hidden relative">
        {game.cover ? (
          <img
            src={game.cover}
            alt={`${game.title} cover`}
            className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
            loading="lazy"
          />
        ) : (
          <div className="h-full w-full grid place-items-center bg-[image:var(--gradient-primary)] opacity-30">
            <Gamepad2 className="h-12 w-12" />
          </div>
        )}
        {game.status && (
          <span className="absolute top-2 right-2 px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wider bg-primary/90 text-primary-foreground backdrop-blur-sm shadow-[var(--glow-primary)]">
            {game.status === "early-access" ? "Early Access" : "Beta"}
          </span>
        )}
        {(() => {
          const src = getGameSource(game);
          if (src === "other") return null;
          return (
            <span
              className={cn(
                "absolute bottom-2 left-2 inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wider backdrop-blur-sm",
                SOURCE_STYLES[src],
              )}
            >
              <StoreIcon source={src} className="mr-1.5 h-3 w-3" />
              {SOURCE_LABEL[src]}
            </span>
          );
        })()}
      </div>

      <div className="p-4 flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="font-semibold truncate">{game.title}</h3>
          {game.genre && (
            <p className="text-xs text-muted-foreground truncate mt-0.5">{game.genre}</p>
          )}
        </div>
        <button
          onClick={(e) => {
            e.stopPropagation();
            onToggleFavorite(game.id);
          }}
          className={cn(
            "shrink-0 h-8 w-8 grid place-items-center rounded-full transition-colors",
            game.favorite
              ? "text-primary"
              : "text-muted-foreground hover:text-foreground hover:bg-secondary"
          )}
          aria-label="Toggle favorite"
        >
          <Heart className={cn("h-4 w-4", game.favorite && "fill-current")} />
        </button>
      </div>

      {/* Drag handle */}
      <button
        {...attributes}
        {...listeners}
        onClick={(e) => e.stopPropagation()}
        className="absolute top-2 left-2 h-8 w-8 grid place-items-center rounded-full bg-background/70 backdrop-blur-sm text-muted-foreground hover:text-foreground opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity cursor-grab active:cursor-grabbing"
        aria-label="Drag to reorder"
      >
        <GripVertical className="h-4 w-4" />
      </button>

      {/* Play button overlay */}
      <div className="absolute inset-x-0 bottom-0 p-4 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity pointer-events-none">
        <Button
          onClick={(e) => {
            e.stopPropagation();
            onLaunch(game);
          }}
          className="rounded-2xl w-full bg-[image:var(--gradient-primary)] shadow-[var(--glow-primary)] pointer-events-auto"
        >
          <Play className="h-4 w-4 mr-2 fill-current" /> Play
        </Button>
      </div>
    </article>
  );
};
