import { useEffect } from "react";
import { Gamepad2 } from "lucide-react";
import type { Game } from "@/lib/game-types";

type LaunchAnimationProps = {
  game: Game;
  onComplete: () => void;
};

export const LaunchAnimation = ({ game, onComplete }: LaunchAnimationProps) => {
  useEffect(() => {
    const timeout = window.setTimeout(onComplete, 1400);
    return () => window.clearTimeout(timeout);
  }, [onComplete]);

  return (
    <div className="fixed inset-0 z-[100] overflow-hidden bg-background animate-enter">
      {game.cover ? (
        <img
          src={game.cover}
          alt={`${game.title} launch banner`}
          className="absolute inset-0 h-full w-full object-cover animate-[scale-in_1.4s_ease-out]"
        />
      ) : (
        <div className="absolute inset-0 grid place-items-center bg-[image:var(--gradient-primary)]">
          <Gamepad2 className="h-32 w-32 text-primary-foreground/70" />
        </div>
      )}
      <div className="absolute inset-0 bg-gradient-to-t from-background via-background/45 to-background/10" />
      <div className="relative z-10 flex h-full w-full items-end p-8 sm:p-12 lg:p-16">
        <div className="max-w-5xl animate-fade-in">
          <p className="mb-3 text-xs font-semibold uppercase tracking-[0.28em] text-primary">
            Launching
          </p>
          <h1 className="break-words text-5xl font-black leading-none text-foreground sm:text-7xl lg:text-8xl">
            {game.title}
          </h1>
        </div>
      </div>
    </div>
  );
};