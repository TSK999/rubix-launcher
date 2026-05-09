import { useEffect, useRef, useState } from "react";
import { ChevronDown, Headphones, HeadphoneOff, Loader2, Mic, MicOff, PhoneOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { callController, useActiveCall, type CallContext } from "@/lib/call-controller";
import { listMicDevicesWithPermission, type MicDevice } from "@/lib/audio-devices";
import { fetchProfiles, type ProfileLite } from "@/lib/messaging";
import type { RemotePeer } from "@/lib/webrtc";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

type Props = {
  /** The call this surface is for. If different from the active call, shows a "Switch" prompt. */
  context: CallContext;
  meId: string;
  /** Called when the user explicitly leaves via the in-room controls. */
  onLeft?: () => void;
};

export const CallRoom = ({ context, meId, onLeft }: Props) => {
  const state = useActiveCall();
  const [profiles, setProfiles] = useState<Map<string, ProfileLite>>(new Map());
  const [micDevices, setMicDevices] = useState<MicDevice[]>([]);

  const showingThisCall = state.context && callController.isInCallContext(context);

  useEffect(() => {
    let cancelled = false;
    void listMicDevicesWithPermission().then((d) => {
      if (!cancelled) setMicDevices(d);
    });
    const handler = () => {
      void listMicDevicesWithPermission().then((d) => !cancelled && setMicDevices(d));
    };
    navigator.mediaDevices?.addEventListener?.("devicechange", handler);
    return () => {
      cancelled = true;
      navigator.mediaDevices?.removeEventListener?.("devicechange", handler);
    };
  }, []);

  useEffect(() => {
    const ids = state.participants.map((p) => p.user_id);
    if (ids.length === 0) {
      setProfiles(new Map());
      return;
    }
    let cancel = false;
    void fetchProfiles(ids).then((m) => !cancel && setProfiles(m));
    return () => {
      cancel = true;
    };
  }, [state.participants]);

  if (!showingThisCall) {
    return null;
  }

  const handleLeave = async () => {
    await callController.leave();
    onLeft?.();
  };

  const toggleMute = () => callController.setMuted(!state.muted);
  const toggleDeafen = () => callController.setDeafened(!state.deafened);

  const setMic = async (id: string) => {
    try {
      await callController.setMicDevice(id);
      toast.success("Microphone updated");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to switch microphone");
    }
  };

  // Build tiles: me + each remote peer
  const tiles: Array<{
    key: string;
    userId: string;
    isMe: boolean;
    stream: MediaStream | null;
    peerId?: string;
    peerState?: RemotePeer["state"];
  }> = [
    { key: "me", userId: meId, isMe: true, stream: null },
    ...state.peers.map((p: RemotePeer) => {
      const part = state.participants.find((pp) => pp.peer_id === p.peerId);
      return {
        key: p.peerId,
        userId: part?.user_id ?? p.peerId,
        isMe: false,
        stream: p.stream,
        peerId: p.peerId,
        peerState: p.state,
      };
    }),
  ];

  const connecting = state.status === "connecting" || state.status === "starting";
  const anyReconnecting = state.peers.some((p) => p.state === "reconnecting");
  const anyDisconnected = state.peers.some((p) => p.state === "disconnected");

  let banner:
    | { label: string; tone: "info" | "warn" | "danger" | "ok" }
    | null = null;
  if (state.micBlocked) {
    banner = { label: "Mic blocked — allow microphone access in your browser", tone: "danger" };
  } else if (connecting) {
    banner = { label: "Connecting…", tone: "info" };
  } else if (anyReconnecting) {
    banner = { label: "Reconnecting…", tone: "warn" };
  } else if (anyDisconnected) {
    banner = { label: "Peer disconnected", tone: "warn" };
  } else if (state.status === "live") {
    banner = { label: "Connected", tone: "ok" };
  }

  return (
    <div className="flex-1 flex flex-col bg-gradient-to-b from-background via-background to-card/40 relative overflow-hidden">
      <div aria-hidden className="absolute inset-0 pointer-events-none">
        <div className="absolute -top-32 -left-32 h-96 w-96 rounded-full bg-primary/15 blur-3xl rubix-pulse-soft" />
        <div className="absolute -bottom-32 -right-32 h-96 w-96 rounded-full bg-[hsl(220_90%_60%/0.15)] blur-3xl rubix-pulse-soft" />
      </div>

      <div className="relative flex-1 grid grid-cols-1 sm:grid-cols-2 gap-5 p-6 place-items-center auto-rows-fr">
        {connecting && tiles.length === 1 ? (
          <div className="col-span-full flex flex-col items-center gap-4 text-muted-foreground rubix-fade-up">
            <div className="rubix-ring-active h-20 w-20">
              <div className="h-full w-full rounded-full bg-card grid place-items-center">
                <Loader2 className="h-6 w-6 animate-spin text-primary" />
              </div>
            </div>
            <p className="text-sm font-medium">Connecting…</p>
            <p className="text-xs">Setting up secure peer link</p>
          </div>
        ) : (
          tiles.map((t) => {
            const prof = profiles.get(t.userId);
            const active = !!t.stream || (t.isMe && !state.muted);
            return (
              <div
                key={t.key}
                className={cn(
                  "aspect-square w-full max-w-[220px] rounded-3xl rubix-glass rubix-card-hi flex flex-col items-center justify-center gap-3 relative rubix-fade-up transition-all",
                  active && "border-primary/50",
                )}
              >
                <div className={cn("p-[2px] rounded-full", active ? "rubix-ring-active" : "bg-border")}>
                  <Avatar className="h-20 w-20 ring-2 ring-card">
                    <AvatarImage src={prof?.avatar_url ?? undefined} />
                    <AvatarFallback>
                      {(prof?.display_name ?? prof?.username ?? "?").slice(0, 2).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                </div>
                <div className="flex flex-col items-center gap-1">
                  <p className="text-sm font-semibold flex items-center gap-1.5">
                    {t.isMe ? "You" : prof?.display_name ?? prof?.username ?? "…"}
                    {t.isMe && state.muted && <MicOff className="h-3 w-3 text-destructive" />}
                  </p>
                  {active && !state.muted && (
                    <div className="flex items-end h-3.5">
                      <span className="rubix-eq-bar" />
                      <span className="rubix-eq-bar" />
                      <span className="rubix-eq-bar" />
                      <span className="rubix-eq-bar" />
                    </div>
                  )}
                </div>
                {t.stream && t.peerId && <RemoteAudio peerId={t.peerId} stream={t.stream} />}
              </div>
            );
          })
        )}
      </div>

      <div className="relative p-5 border-t border-border bg-background/60 backdrop-blur-xl flex items-center justify-center gap-3 flex-wrap">
        <div className="flex items-center">
          <Button
            size="lg"
            variant={state.muted ? "destructive" : "secondary"}
            onClick={toggleMute}
            className="rounded-l-full rounded-r-none h-12 w-12 p-0 shadow-md"
            title={state.muted ? "Unmute" : "Mute"}
          >
            {state.muted ? <MicOff className="h-5 w-5" /> : <Mic className="h-5 w-5" />}
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                size="lg"
                variant={state.muted ? "destructive" : "secondary"}
                className="rounded-r-full rounded-l-none h-12 w-7 p-0 shadow-md border-l border-background/30"
                title="Choose microphone"
              >
                <ChevronDown className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="center" className="w-72">
              <DropdownMenuLabel>Microphone input</DropdownMenuLabel>
              <DropdownMenuSeparator />
              {micDevices.length === 0 && (
                <DropdownMenuItem disabled>No microphones detected</DropdownMenuItem>
              )}
              {micDevices.map((d) => (
                <DropdownMenuItem
                  key={d.deviceId || d.label}
                  onClick={() => void setMic(d.deviceId)}
                  className={cn(state.micDeviceId === d.deviceId && "text-primary font-medium")}
                >
                  {d.label}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        <Button
          size="lg"
          variant={state.deafened ? "destructive" : "secondary"}
          onClick={toggleDeafen}
          className="rounded-full h-12 w-12 p-0 shadow-md"
          title={state.deafened ? "Undeafen" : "Deafen"}
        >
          {state.deafened ? <HeadphoneOff className="h-5 w-5" /> : <Headphones className="h-5 w-5" />}
        </Button>

        <Button
          size="lg"
          variant="destructive"
          onClick={handleLeave}
          className="rounded-full h-12 px-6 shadow-md"
        >
          <PhoneOff className="h-5 w-5 mr-2" /> Leave
        </Button>
      </div>
    </div>
  );
};

const RemoteAudio = ({ peerId, stream }: { peerId: string; stream: MediaStream }) => {
  const ref = useRef<HTMLAudioElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.srcObject = stream;
    callController.registerRemoteAudio(peerId, el);
    return () => {
      callController.registerRemoteAudio(peerId, null);
    };
  }, [peerId, stream]);
  return <audio ref={ref} autoPlay playsInline />;
};
