import { useEffect } from "react";
import { Gamepad2 } from "lucide-react";
import type { Game } from "@/lib/game-types";

type LaunchAnimationProps = {
  game: Game;
  onComplete: () => void;
};

export const LaunchAnimation = ({ game, onComplete }: LaunchAnimationProps) => {
  useEffect(() => {
    const timeout = window.setTimeout(onComplete, 1600);
    return () => window.clearTimeout(timeout);
  }, [onComplete]);

  return (
    <div className="fixed inset-0 z-[100] overflow-hidden bg-background animate-enter">
      {game.cover ? (
        <img
          src={game.cover}
          alt={`${game.title} launch banner`}
          className="absolute inset-0 h-full w-full object-cover animate-[scale-in_1.6s_ease-out]"
        />
      ) : (
        <div className="absolute inset-0 grid place-items-center bg-[image:var(--gradient-primary)]">
          <Gamepad2 className="h-32 w-32 text-primary-foreground/70" />
        </div>
      )}
      <div className="absolute inset-0 bg-gradient-to-t from-background via-background/55 to-background/10" />
      <div className="absolute inset-0 bg-gradient-to-r from-background/60 via-transparent to-transparent" />

      <div className="relative z-10 flex h-full w-full flex-col justify-end p-8 sm:p-12 lg:p-16">
        <div className="max-w-5xl rubix-fade-up">
          <p className="mb-3 inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.28em] text-primary">
            <span className="h-1.5 w-1.5 rounded-full bg-primary rubix-pulse-soft" />
            Launching
          </p>
          <h1 className="break-words text-5xl font-black leading-none text-foreground sm:text-7xl lg:text-8xl">
            {game.title}
          </h1>

          {/* Progress bar */}
          <div className="mt-8 h-1 w-full max-w-md overflow-hidden rounded-full bg-secondary/60">
            <div
              className="h-full bg-[image:var(--gradient-primary)] shadow-[var(--glow-primary)]"
              style={{ animation: "rubix-launch-progress 1.6s cubic-bezier(0.22, 1, 0.36, 1) forwards" }}
            />
          </div>
        </div>
      </div>

      <style>{`
        @keyframes rubix-launch-progress {
          0% { width: 0%; }
          100% { width: 100%; }
        }
      `}</style>
    </div>
  );
};
