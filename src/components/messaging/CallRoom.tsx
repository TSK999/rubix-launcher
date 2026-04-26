import { useEffect, useRef, useState } from "react";
import { Mic, MicOff, PhoneOff, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { CallManager, type RemotePeer } from "@/lib/webrtc";
import { consumeCallStream } from "@/lib/call-media";
import {
  endCall,
  joinCall,
  leaveCall,
  listActiveParticipants,
  MESH_LIMIT,
  type CallParticipant,
} from "@/lib/calls";
import { fetchProfiles, type ProfileLite } from "@/lib/messaging";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

type Props = {
  callId: string;
  meId: string;
  initialStream?: MediaStream | null;
  onLeave: () => void;
};

const pendingLeaveTimers = new Map<string, number>();

export const CallRoom = ({ callId, meId, initialStream, onLeave }: Props) => {
  const [peers, setPeers] = useState<RemotePeer[]>([]);
  const [participants, setParticipants] = useState<CallParticipant[]>([]);
  const [profiles, setProfiles] = useState<Map<string, ProfileLite>>(new Map());
  const [muted, setMuted] = useState(false);
  const [connecting, setConnecting] = useState(true);
  const managerRef = useRef<CallManager | null>(null);
  const leaveKeyRef = useRef(`${callId}:${meId}`);

  useEffect(() => {
    const leaveKey = `${callId}:${meId}`;
    leaveKeyRef.current = leaveKey;

    const pendingTimer = pendingLeaveTimers.get(leaveKey);
    if (pendingTimer) {
      window.clearTimeout(pendingTimer);
      pendingLeaveTimers.delete(leaveKey);
    }

    let stopped = false;
    let intervalId: number | null = null;
    let mgr: CallManager | null = null;

    const init = async () => {
      // Capacity check
      const current = await listActiveParticipants(callId);
      if (stopped) return;
      if (current.length >= MESH_LIMIT && !current.some((p) => p.user_id === meId)) {
        toast.error(`Call is full (max ${MESH_LIMIT})`);
        onLeave();
        return;
      }

      const localStream = initialStream ?? consumeCallStream(callId);
      if (!localStream) {
        toast.error("Tap Call again to allow microphone access");
        onLeave();
        return;
      }

      mgr = new CallManager(callId, {
        onPeersChange: (p) => !stopped && setPeers(p),
        onLocalStream: () => !stopped && setConnecting(false),
        onError: (err) => {
          if (stopped) return;
          toast.error(err.message);
          onLeave();
        },
      }, localStream);
      managerRef.current = mgr;

      try {
        await mgr.start();
        if (stopped) {
          await mgr.stop();
          return;
        }
        await joinCall(callId, mgr.peerId);
      } catch (e) {
        if (!stopped) {
          toast.error(e instanceof Error ? e.message : "Failed to join call");
          onLeave();
        }
        return;
      }

      const refreshRoster = async () => {
        const list = await listActiveParticipants(callId);
        if (stopped) return;
        setParticipants(list);
        const profMap = await fetchProfiles(list.map((p) => p.user_id));
        if (!stopped) setProfiles(profMap);
      };
      void refreshRoster();
      intervalId = window.setInterval(refreshRoster, 4000);
    };

    void init();

    return () => {
      stopped = true;
      if (intervalId !== null) window.clearInterval(intervalId);
      const m = managerRef.current;
      managerRef.current = null;
      void m?.stop();

      const timer = window.setTimeout(() => {
        pendingLeaveTimers.delete(leaveKey);
        void leaveCall(callId);
      }, 750);
      pendingLeaveTimers.set(leaveKey, timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [callId, meId]);

  const handleLeave = () => {
    const leaveKey = leaveKeyRef.current;
    const pendingTimer = pendingLeaveTimers.get(leaveKey);
    if (pendingTimer) {
      window.clearTimeout(pendingTimer);
      pendingLeaveTimers.delete(leaveKey);
    }
    void endCall(callId);
    onLeave();
  };

  const toggleMute = () => {
    const next = !muted;
    setMuted(next);
    managerRef.current?.setMuted(next);
  };

  const tiles: Array<{ key: string; userId: string; isMe: boolean; stream: MediaStream | null }> = [
    { key: "me", userId: meId, isMe: true, stream: null },
    ...peers.map((p) => {
      const part = participants.find((pp) => pp.peer_id === p.peerId);
      return {
        key: p.peerId,
        userId: part?.user_id ?? p.peerId,
        isMe: false,
        stream: p.stream,
      };
    }),
  ];

  return (
    <div className="flex-1 flex flex-col bg-gradient-to-b from-background via-background to-card/40 relative overflow-hidden">
      {/* Ambient backdrop */}
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
            const active = !!t.stream || (t.isMe && !muted);
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
                    {t.isMe && muted && <MicOff className="h-3 w-3 text-destructive" />}
                  </p>
                  {active && !muted && (
                    <div className="flex items-end h-3.5">
                      <span className="rubix-eq-bar" />
                      <span className="rubix-eq-bar" />
                      <span className="rubix-eq-bar" />
                      <span className="rubix-eq-bar" />
                    </div>
                  )}
                </div>
                {t.stream && <RemoteAudio stream={t.stream} />}
              </div>
            );
          })
        )}
      </div>
      <div className="relative p-5 border-t border-border bg-background/60 backdrop-blur-xl flex items-center justify-center gap-3">
        <Button
          size="lg"
          variant={muted ? "destructive" : "secondary"}
          onClick={toggleMute}
          className="rounded-full h-12 w-12 p-0 shadow-md"
          title={muted ? "Unmute" : "Mute"}
        >
          {muted ? <MicOff className="h-5 w-5" /> : <Mic className="h-5 w-5" />}
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

const RemoteAudio = ({ stream }: { stream: MediaStream }) => {
  const ref = useRef<HTMLAudioElement>(null);
  useEffect(() => {
    if (ref.current) ref.current.srcObject = stream;
  }, [stream]);
  return <audio ref={ref} autoPlay playsInline />;
};
