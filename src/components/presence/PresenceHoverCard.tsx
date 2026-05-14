import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { Gamepad2, Mic, Music2, MessageSquare, Volume2 } from "lucide-react";
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@/components/ui/hover-card";
import {
  formatSessionDuration,
  formatTotalToday,
  STATUS_LABEL,
  useRichPresence,
} from "@/lib/presence";
import { StatusDot } from "./StatusDot";
import { getOrCreateDm } from "@/lib/messaging";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

type Profile = {
  user_id: string;
  username: string;
  display_name: string | null;
  avatar_url: string | null;
};

type Props = {
  profile: Profile;
  children: ReactNode;
  side?: "right" | "left" | "top" | "bottom";
};

// Stable hue from a string for ambient gradient
const hueFromString = (s: string) => {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) % 360;
  return h;
};

export const PresenceHoverCard = ({ profile, children, side = "right" }: Props) => {
  const rich = useRichPresence(profile.user_id);
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [tick, setTick] = useState(0);

  // Keep session timer fresh while open
  useEffect(() => {
    if (!open) return;
    const t = window.setInterval(() => setTick((n) => n + 1), 30_000);
    return () => window.clearInterval(t);
  }, [open]);

  const ambient = useMemo(() => {
    const seed = rich.game ?? profile.username;
    const h = hueFromString(seed);
    return {
      background: `radial-gradient(120% 90% at 0% 0%, hsl(${h} 80% 22% / 0.55), transparent 55%), radial-gradient(120% 90% at 100% 100%, hsl(${(h + 60) % 360} 80% 22% / 0.45), transparent 55%)`,
    };
    // tick excluded on purpose
  }, [rich.game, profile.username]);

  const sessionDur = formatSessionDuration(rich.gameStartedAt);
  const todayTotal = formatTotalToday(rich.sessionSecondsToday);
  void tick;

  const handleMessage = async () => {
    try {
      const id = await getOrCreateDm(profile.user_id);
      navigate(`/messages?c=${id}`);
    } catch {
      toast.error("Could not open DM");
    }
  };

  const displayName = profile.display_name ?? profile.username;
  const initials = displayName.charAt(0).toUpperCase();

  return (
    <HoverCard openDelay={220} closeDelay={120} onOpenChange={setOpen}>
      <HoverCardTrigger asChild>{children}</HoverCardTrigger>
      <HoverCardContent
        side={side}
        align="start"
        sideOffset={10}
        className={cn(
          "w-72 p-0 overflow-hidden border-border/70",
          "bg-card/85 backdrop-blur-xl shadow-[0_30px_60px_-20px_hsl(0_0%_0%/0.65)]",
          "presence-card-in",
        )}
      >
        {/* Ambient gradient backdrop */}
        <div className="relative">
          <div
            className="absolute inset-0 presence-gradient-drift pointer-events-none"
            style={ambient}
          />
          <div className="relative p-4 flex items-start gap-3">
            <div className="relative">
              <div className="h-12 w-12 rounded-full overflow-hidden bg-secondary grid place-items-center ring-1 ring-border/60">
                {profile.avatar_url ? (
                  <img src={profile.avatar_url} alt="" className="h-full w-full object-cover" />
                ) : (
                  <span className="text-sm font-bold text-muted-foreground">{initials}</span>
                )}
              </div>
              <div className="absolute -bottom-0.5 -right-0.5">
                <StatusDot status={rich.status} size="md" ring />
              </div>
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold truncate text-foreground">{displayName}</p>
              <p className="text-[11px] text-muted-foreground truncate">@{profile.username}</p>
              <span className="mt-1 inline-flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-muted-foreground/90">
                <StatusDot status={rich.status} size="xs" />
                {STATUS_LABEL[rich.status]}
              </span>
            </div>
          </div>
        </div>

        {/* Activity blocks */}
        <div className="px-4 pb-3 space-y-2">
          {rich.game && (
            <ActivityRow
              icon={<Gamepad2 className="h-4 w-4 text-emerald-400" />}
              title={`Playing ${rich.game}`}
              meta={sessionDur ? `for ${sessionDur}` : undefined}
              accent="emerald"
            />
          )}

          {rich.vc && (
            <ActivityRow
              icon={
                rich.vc.speaking ? (
                  <span className="presence-speaking-ring inline-grid place-items-center h-4 w-4 rounded-full">
                    <Volume2 className="h-3.5 w-3.5 text-emerald-400" />
                  </span>
                ) : (
                  <Mic className="h-4 w-4 text-sky-400" />
                )
              }
              title="In voice chat"
              meta={rich.vc.joinedAt ? formatSessionDuration(rich.vc.joinedAt) : undefined}
              accent="sky"
            />
          )}

          {rich.spotify && (
            <div className="flex items-center gap-2.5 px-2.5 py-2 rounded-lg bg-secondary/40 border border-border/40">
              {rich.spotify.artUrl ? (
                <img
                  src={rich.spotify.artUrl}
                  alt=""
                  className="h-9 w-9 rounded-md object-cover shrink-0"
                />
              ) : (
                <div className="h-9 w-9 rounded-md bg-fuchsia-900/40 grid place-items-center shrink-0">
                  <Music2 className="h-4 w-4 text-fuchsia-400" />
                </div>
              )}
              <div className="min-w-0 flex-1">
                <p className="text-[11px] uppercase tracking-wider text-fuchsia-300/80">Listening</p>
                <p className="text-xs font-medium truncate">{rich.spotify.track}</p>
                {rich.spotify.artist && (
                  <p className="text-[10px] text-muted-foreground truncate">{rich.spotify.artist}</p>
                )}
              </div>
            </div>
          )}

          {!rich.game && !rich.vc && !rich.spotify && (
            <p className="text-xs text-muted-foreground py-1">
              {rich.status === "offline" ? "Currently offline" : "Idle on RUBIX"}
            </p>
          )}

          {(rich.lastGame || todayTotal) && (
            <div className="flex flex-wrap gap-x-3 gap-y-1 pt-1 text-[10px] text-muted-foreground/80">
              {todayTotal && <span>{todayTotal}</span>}
              {rich.lastGame && !rich.game && <span>Last played {rich.lastGame}</span>}
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="px-3 pb-3 pt-1 flex items-center gap-1.5 border-t border-border/40">
          <button
            onClick={handleMessage}
            className="flex-1 flex items-center justify-center gap-1.5 text-xs px-2.5 py-1.5 rounded-md bg-secondary/60 hover:bg-secondary text-foreground/90 transition-colors"
          >
            <MessageSquare className="h-3.5 w-3.5" />
            Message
          </button>
          <button
            onClick={() => navigate(`/u/${profile.username}`)}
            className="flex-1 flex items-center justify-center gap-1.5 text-xs px-2.5 py-1.5 rounded-md bg-secondary/60 hover:bg-secondary text-foreground/90 transition-colors"
          >
            View Profile
          </button>
        </div>
      </HoverCardContent>
    </HoverCard>
  );
};

const ActivityRow = ({
  icon,
  title,
  meta,
  accent,
}: {
  icon: ReactNode;
  title: string;
  meta?: string;
  accent: "emerald" | "sky" | "fuchsia";
}) => {
  const accentBorder = {
    emerald: "border-emerald-500/20",
    sky: "border-sky-500/20",
    fuchsia: "border-fuchsia-500/20",
  }[accent];
  return (
    <div
      className={cn(
        "flex items-center gap-2.5 px-2.5 py-2 rounded-lg bg-secondary/40 border",
        accentBorder,
      )}
    >
      <div className="shrink-0">{icon}</div>
      <div className="min-w-0 flex-1">
        <p className="text-xs font-medium truncate">{title}</p>
        {meta && <p className="text-[10px] text-muted-foreground truncate">{meta}</p>}
      </div>
    </div>
  );
};
