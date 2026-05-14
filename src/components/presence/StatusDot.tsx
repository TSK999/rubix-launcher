import { cn } from "@/lib/utils";
import type { RichStatus } from "@/lib/presence";

type Props = {
  status: RichStatus;
  size?: "xs" | "sm" | "md";
  ring?: boolean;
  className?: string;
};

const SIZE: Record<NonNullable<Props["size"]>, string> = {
  xs: "h-1.5 w-1.5",
  sm: "h-2.5 w-2.5",
  md: "h-3 w-3",
};

export const StatusDot = ({ status, size = "sm", ring = false, className }: Props) => (
  <span
    className={cn(
      "inline-block rounded-full shrink-0",
      SIZE[size],
      `presence-dot-${status}`,
      ring && "ring-2 ring-card",
      className,
    )}
    aria-label={status}
  />
);
