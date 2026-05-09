/**
 * Persistent floating call control. Visible on every page while a call is active.
 * Lets the user mute, deafen, or leave without navigating back to Messages.
 */
import { useNavigate } from "react-router-dom";
import { Headphones, HeadphoneOff, MessageSquare, Mic, MicOff, PhoneOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { callController, useActiveCall } from "@/lib/call-controller";
import { cn } from "@/lib/utils";

export const MiniCallWidget = () => {
  const state = useActiveCall();
  const navigate = useNavigate();

  if (state.status === "idle" || !state.context) return null;

  const ctx = state.context;
  const peerCount = state.peers.filter((p) => p.state !== "disconnected").length;
  const anyReconnecting = state.peers.some((p) => p.state === "reconnecting");
  const subtitle = state.micBlocked
    ? "Mic blocked"
    : state.status === "connecting" || state.status === "starting"
      ? "Connecting…"
      : anyReconnecting
        ? "Reconnecting…"
        : peerCount === 0
          ? "Connected · waiting for others"
          : `Connected · ${peerCount + 1} in call`;

  const goToCall = () => {
    if (ctx.kind === "dm") {
      navigate(`/messages?conv=${ctx.conversationId}`);
    } else {
      // Community channel — jump to messages; user can re-pick the channel.
      navigate(`/messages`);
    }
  };

  return (
    <div
      className={cn(
        "fixed bottom-4 right-4 z-50 rubix-glass rubix-card-hi rounded-2xl border border-border shadow-2xl",
        "px-3 py-2 flex items-center gap-2 min-w-[260px] max-w-sm",
        "animate-in slide-in-from-bottom-4 fade-in",
      )}
    >
      <button
        onClick={goToCall}
        className="flex items-center gap-2.5 flex-1 min-w-0 text-left hover:opacity-90 transition"
        title="Open call"
      >
        <span className="relative h-9 w-9 rounded-full grid place-items-center bg-primary/15 text-primary shrink-0">
          <MessageSquare className="h-4 w-4" />
          <span className="absolute -top-0.5 -right-0.5 h-2.5 w-2.5 rounded-full bg-emerald-500 ring-2 ring-card animate-pulse" />
        </span>
        <span className="min-w-0">
          <p className="text-xs font-semibold truncate">
            {ctx.title ?? (ctx.kind === "dm" ? "Direct call" : "Voice channel")}
          </p>
          <p className="text-[10px] text-muted-foreground truncate">{subtitle}</p>
        </span>
      </button>
      <div className="flex items-center gap-1 shrink-0">
        <Button
          size="icon"
          variant={state.muted ? "destructive" : "secondary"}
          className="h-8 w-8 rounded-full"
          onClick={() => callController.setMuted(!state.muted)}
          title={state.muted ? "Unmute" : "Mute"}
        >
          {state.muted ? <MicOff className="h-3.5 w-3.5" /> : <Mic className="h-3.5 w-3.5" />}
        </Button>
        <Button
          size="icon"
          variant={state.deafened ? "destructive" : "secondary"}
          className="h-8 w-8 rounded-full"
          onClick={() => callController.setDeafened(!state.deafened)}
          title={state.deafened ? "Undeafen" : "Deafen"}
        >
          {state.deafened ? <HeadphoneOff className="h-3.5 w-3.5" /> : <Headphones className="h-3.5 w-3.5" />}
        </Button>
        <Button
          size="icon"
          variant="destructive"
          className="h-8 w-8 rounded-full"
          onClick={() => void callController.leave()}
          title="Leave call"
        >
          <PhoneOff className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  );
};
