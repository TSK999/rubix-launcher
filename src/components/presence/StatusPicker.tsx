import { useState, useEffect } from "react";
import { Check } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { StatusDot } from "./StatusDot";
import {
  setManualStatus,
  useRichPresence,
  type ManualStatus,
  type RichStatus,
} from "@/lib/presence";
import { cn } from "@/lib/utils";

type Props = {
  userId: string | null;
  align?: "start" | "end" | "center";
  side?: "top" | "right" | "bottom" | "left";
};

const OPTIONS: { value: ManualStatus | null; label: string; status: RichStatus }[] = [
  { value: null, label: "Auto", status: "online" },
  { value: "online", label: "Online", status: "online" },
  { value: "available", label: "Available", status: "available" },
  { value: "looking_to_play", label: "Looking to Play", status: "looking_to_play" },
  { value: "idle", label: "Idle", status: "idle" },
  { value: "dnd", label: "Do Not Disturb", status: "dnd" },
];

export const StatusPicker = ({ userId, align = "start" }: Props) => {
  const rich = useRichPresence(userId);
  const [open, setOpen] = useState(false);
  // Track local optimistic value so it reflects instantly
  const [pending, setPending] = useState<ManualStatus | null | undefined>(undefined);
  useEffect(() => setPending(undefined), [rich.manualStatus]);

  const current = pending !== undefined ? pending : rich.manualStatus;
  const displayStatus: RichStatus = current ?? rich.status;
  const displayLabel =
    OPTIONS.find((o) => o.value === current)?.label ?? "Auto";

  if (!userId) return null;

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <button
          className={cn(
            "group flex items-center gap-2 px-2.5 py-1.5 rounded-full",
            "bg-secondary/50 hover:bg-secondary text-xs text-muted-foreground hover:text-foreground",
            "transition-colors border border-border/60",
          )}
        >
          <StatusDot status={displayStatus} size="xs" />
          <span className="truncate max-w-[110px]">{displayLabel}</span>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align={align} className="w-52">
        {OPTIONS.map((opt, i) => (
          <div key={String(opt.value ?? "auto")}>
            {i === 1 && <DropdownMenuSeparator />}
            <DropdownMenuItem
              onClick={() => {
                setPending(opt.value);
                setManualStatus(opt.value);
              }}
              className="flex items-center gap-2.5"
            >
              <StatusDot status={opt.status} size="sm" />
              <span className="flex-1">{opt.label}</span>
              {current === opt.value && <Check className="h-3.5 w-3.5 text-primary" />}
            </DropdownMenuItem>
          </div>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
};
