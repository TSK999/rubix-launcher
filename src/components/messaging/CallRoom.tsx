import { useEffect, useRef, useState } from "react";
import { Mic, MicOff, PhoneOff, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { CallManager, type RemotePeer } from "@/lib/webrtc";
import {
  joinCall,
  leaveCall,
  listActiveParticipants,
  MESH_LIMIT,
  type CallParticipant,
} from "@/lib/calls";
import { fetchProfiles, type ProfileLite } from "@/lib/messaging";
import { toast } from "sonner";

type Props = {
  callId: string;
  meId: string;
  onLeave: () => void;
};

const pendingLeaveTimers = new Map<string, number>();

export const CallRoom = ({ callId, meId, onLeave }: Props) => {
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

      mgr = new CallManager(callId, {
        onPeersChange: (p) => !stopped && setPeers(p),
        onLocalStream: () => !stopped && setConnecting(false),
        onError: (err) => {
          if (stopped) return;
          toast.error(err.message);
          onLeave();
        },
      });
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
    void leaveCall(callId);
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
    <div className="flex-1 flex flex-col bg-card/20">
      <div className="flex-1 grid grid-cols-2 gap-4 p-6 place-items-center">
        {connecting && tiles.length === 1 ? (
          <div className="col-span-2 flex flex-col items-center gap-3 text-muted-foreground">
            <Loader2 className="h-6 w-6 animate-spin" />
            <p className="text-sm">Connecting…</p>
          </div>
        ) : (
          tiles.map((t) => {
            const prof = profiles.get(t.userId);
            return (
              <div
                key={t.key}
                className="aspect-square w-full max-w-[200px] rounded-2xl bg-secondary/60 border border-border flex flex-col items-center justify-center gap-2 relative"
              >
                <Avatar className="h-20 w-20">
                  <AvatarImage src={prof?.avatar_url ?? undefined} />
                  <AvatarFallback>
                    {(prof?.display_name ?? prof?.username ?? "?").slice(0, 2).toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                <p className="text-sm font-medium">
                  {t.isMe ? "You" : prof?.display_name ?? prof?.username ?? "…"}
                  {t.isMe && muted && <MicOff className="inline h-3 w-3 ml-1 text-destructive" />}
                </p>
                {t.stream && <RemoteAudio stream={t.stream} />}
              </div>
            );
          })
        )}
      </div>
      <div className="p-4 border-t border-border flex items-center justify-center gap-3">
        <Button
          size="lg"
          variant={muted ? "destructive" : "secondary"}
          onClick={toggleMute}
          className="rounded-full h-12 w-12 p-0"
        >
          {muted ? <MicOff className="h-5 w-5" /> : <Mic className="h-5 w-5" />}
        </Button>
        <Button
          size="lg"
          variant="destructive"
          onClick={onLeave}
          className="rounded-full h-12 px-6"
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
