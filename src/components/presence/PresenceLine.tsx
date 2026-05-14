import { Gamepad2, Mic, Music2, Search, MoonStar } from "lucide-react";
import {
  formatSessionDuration,
  STATUS_LABEL,
  useRichPresence,
} from "@/lib/presence";
import { cn } from "@/lib/utils";

type Props = {
  userId: string | null | undefined;
  className?: string;
  compact?: boolean;
};

/**
 * One-line ambient summary of what a user is doing.
 *   "Playing Valorant · 1h 24m"
 *   "In General VC"
 *   "Listening to Bogota"
 *   "Looking to Play"
 */
export const PresenceLine = ({ userId, className, compact }: Props) => {
  const rich = useRichPresence(userId);

  if (rich.status === "offline") {
    return (
      <span className={cn("text-[10px] text-muted-foreground/70", className)}>Offline</span>
    );
  }

  if (rich.game) {
    const dur = formatSessionDuration(rich.gameStartedAt);
    return (
      <span className={cn("flex items-center gap-1.5 text-[10px] text-emerald-400 truncate", className)}>
        <Gamepad2 className="h-3 w-3 shrink-0" />
        <span className="truncate">
          Playing {rich.game}
          {dur && !compact && <span className="text-muted-foreground"> · {dur}</span>}
        </span>
      </span>
    );
  }

  if (rich.vc) {
    return (
      <span className={cn("flex items-center gap-1.5 text-[10px] text-sky-400 truncate", className)}>
        <Mic className="h-3 w-3 shrink-0" />
        <span className="truncate">In voice chat</span>
      </span>
    );
  }

  if (rich.spotify) {
    return (
      <span className={cn("flex items-center gap-1.5 text-[10px] text-fuchsia-400 truncate", className)}>
        <Music2 className="h-3 w-3 shrink-0" />
        <span className="truncate">{rich.spotify.track}</span>
      </span>
    );
  }

  if (rich.manualStatus === "looking_to_play") {
    return (
      <span className={cn("flex items-center gap-1.5 text-[10px] text-sky-400", className)}>
        <Search className="h-3 w-3 shrink-0" />
        Looking to Play
      </span>
    );
  }

  if (rich.manualStatus === "dnd") {
    return (
      <span className={cn("flex items-center gap-1.5 text-[10px] text-rose-400", className)}>
        <MoonStar className="h-3 w-3 shrink-0" />
        Do Not Disturb
      </span>
    );
  }

  return (
    <span className={cn("text-[10px] text-muted-foreground", className)}>
      {STATUS_LABEL[rich.status]}
    </span>
  );
};
