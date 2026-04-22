import steamIcon from "@/assets/steam-icon.png";
import epicIcon from "@/assets/epic-games-icon.png";
import eaIcon from "@/assets/ea-icon.svg";
import xboxIcon from "@/assets/xbox-icon.svg";
import riotIcon from "@/assets/riot-games-icon.png";
import { cn } from "@/lib/utils";
import type { GameSource } from "@/lib/game-types";

type StoreIconSource = Exclude<GameSource, "other">;

const ICONS: Record<StoreIconSource, string> = {
  steam: steamIcon,
  epic: epicIcon,
  ea: eaIcon,
  xbox: xboxIcon,
  riot: riotIcon,
};

const LABELS: Record<StoreIconSource, string> = {
  steam: "Steam",
  epic: "Epic Games",
  ea: "EA app",
  xbox: "Xbox",
  riot: "Riot Games",
};

type StoreIconProps = {
  source: StoreIconSource;
  className?: string;
  decorative?: boolean;
};

export const StoreIcon = ({ source, className, decorative = true }: StoreIconProps) => (
  <img
    src={ICONS[source]}
    alt={decorative ? "" : LABELS[source]}
    aria-hidden={decorative || undefined}
    className={cn("h-4 w-4 shrink-0 object-contain", className)}
  />
);
