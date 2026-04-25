/**
 * Mesh WebRTC manager for ≤4 participant audio calls.
 * Signaling rides on a Supabase Realtime broadcast channel: `call:{callId}`.
 */
import { supabase } from "@/integrations/supabase/client";
import type { RealtimeChannel } from "@supabase/supabase-js";

const ICE_CONFIG: RTCConfiguration = {
  iceServers: [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun1.l.google.com:19302" },
  ],
};

type SignalPayload =
  | { type: "hello"; from: string }
  | { type: "ready"; from: string }
  | { type: "offer"; from: string; to: string; sdp: RTCSessionDescriptionInit }
  | { type: "answer"; from: string; to: string; sdp: RTCSessionDescriptionInit }
  | { type: "ice"; from: string; to: string; candidate: RTCIceCandidateInit }
  | { type: "bye"; from: string };

export type RemotePeer = {
  peerId: string;
  stream: MediaStream;
};

export type CallEvents = {
  onPeersChange: (peers: RemotePeer[]) => void;
  onLocalStream: (stream: MediaStream) => void;
  onError: (err: Error) => void;
};

export class CallManager {
  readonly callId: string;
  readonly peerId: string;
  private channel: RealtimeChannel | null = null;
  private localStream: MediaStream | null = null;
  private peers = new Map<string, { pc: RTCPeerConnection; stream: MediaStream | null }>();
  private muted = false;

  constructor(callId: string, private events: CallEvents, localStream?: MediaStream) {
    this.callId = callId;
    this.peerId = `${Math.random().toString(36).slice(2)}-${Date.now()}`;
    this.localStream = localStream ?? null;
  }

  async start() {
    if (!this.localStream) {
      this.events.onError(new Error("Microphone permission denied"));
      throw new Error("Microphone permission denied");
    }
    this.events.onLocalStream(this.localStream);

    this.channel = supabase.channel(`call:${this.callId}`, {
      config: { broadcast: { self: false, ack: false } },
    });

    this.channel.on("broadcast", { event: "signal" }, ({ payload }) => {
      void this.handleSignal(payload as SignalPayload);
    });

    await new Promise<void>((resolve) => {
      this.channel!.subscribe((status) => {
        if (status === "SUBSCRIBED") resolve();
      });
    });

    // Announce ourselves so existing peers will create offers to us. Repeat once
    // because Realtime broadcasts can miss peers that are subscribing at the same time.
    this.broadcast({ type: "hello", from: this.peerId });
    window.setTimeout(() => this.broadcast({ type: "ready", from: this.peerId }), 1200);
  }

  setMuted(muted: boolean) {
    this.muted = muted;
    this.localStream?.getAudioTracks().forEach((t) => (t.enabled = !muted));
  }

  isMuted() {
    return this.muted;
  }

  async stop() {
    if (this.channel) {
      this.broadcast({ type: "bye", from: this.peerId });
    }
    this.peers.forEach(({ pc }) => pc.close());
    this.peers.clear();
    this.localStream?.getTracks().forEach((t) => t.stop());
    this.localStream = null;
    if (this.channel) {
      await supabase.removeChannel(this.channel);
      this.channel = null;
    }
    this.events.onPeersChange([]);
  }

  private broadcast(payload: SignalPayload) {
    if (!this.channel) return;
    void this.channel.send({ type: "broadcast", event: "signal", payload });
  }

  private emitPeers() {
    const list: RemotePeer[] = [];
    this.peers.forEach((v, k) => {
      if (v.stream) list.push({ peerId: k, stream: v.stream });
    });
    this.events.onPeersChange(list);
  }

  private getOrCreatePeer(remoteId: string): RTCPeerConnection {
    let entry = this.peers.get(remoteId);
    if (entry) return entry.pc;

    const pc = new RTCPeerConnection(ICE_CONFIG);
    entry = { pc, stream: null };
    this.peers.set(remoteId, entry);

    if (this.localStream) {
      this.localStream.getTracks().forEach((track) => {
        const sender = pc.addTrack(track, this.localStream!);
        if (track.kind === "audio") {
          const params = sender.getParameters();
          params.encodings = [
            { maxBitrate: 510_000, priority: "high", networkPriority: "high" } as RTCRtpEncodingParameters,
          ];
          void sender.setParameters(params).catch(() => undefined);
        }
      });
    }

    pc.onicecandidate = (e) => {
      if (e.candidate) {
        this.broadcast({
          type: "ice",
          from: this.peerId,
          to: remoteId,
          candidate: e.candidate.toJSON(),
        });
      }
    };

    pc.ontrack = (e) => {
      const stream = e.streams[0] ?? new MediaStream([e.track]);
      const cur = this.peers.get(remoteId);
      if (cur) {
        cur.stream = stream;
        this.emitPeers();
      }
    };

    pc.onconnectionstatechange = () => {
      if (["disconnected", "failed", "closed"].includes(pc.connectionState)) {
        this.removePeer(remoteId);
      }
    };

    return pc;
  }

  private upgradeAudioSdp(sdp: string): string {
    // Force stereo + high-quality Opus on both directions.
    return sdp.replace(
      /a=fmtp:111 ([^\r\n]*)/g,
      (_match, params: string) => {
        const filtered = params
          .split(";")
          .map((p) => p.trim())
          .filter(
            (p) =>
              p &&
              !p.startsWith("stereo=") &&
              !p.startsWith("sprop-stereo=") &&
              !p.startsWith("maxaveragebitrate=") &&
              !p.startsWith("maxplaybackrate=") &&
              !p.startsWith("useinbandfec="),
          );
        filtered.push(
          "stereo=1",
          "sprop-stereo=1",
          "maxaveragebitrate=510000",
          "maxplaybackrate=48000",
          "minptime=10",
          "ptime=20",
          "useinbandfec=1",
          "cbr=0",
        );
        return `a=fmtp:111 ${filtered.join(";")}`;
      },
    );
  }

  private removePeer(remoteId: string) {
    const entry = this.peers.get(remoteId);
    if (!entry) return;
    entry.pc.close();
    this.peers.delete(remoteId);
    this.emitPeers();
  }

  private async handleSignal(payload: SignalPayload) {
    if (!payload || payload.from === this.peerId) return;

    if (payload.type === "hello" || payload.type === "ready") {
      // The peer receiving the hello is already in the room, so it must offer.
      // If only the lower peer id offered, half of joins never negotiated.
      const pc = this.getOrCreatePeer(payload.from);
      if (pc.signalingState !== "stable") return;
      const offer = await pc.createOffer();
      const tunedOffer = { ...offer, sdp: this.upgradeAudioSdp(offer.sdp ?? "") };
      await pc.setLocalDescription(tunedOffer);
      this.broadcast({ type: "offer", from: this.peerId, to: payload.from, sdp: tunedOffer });
      return;
    }

    if ("to" in payload && payload.to !== this.peerId) return;

    if (payload.type === "offer") {
      const pc = this.getOrCreatePeer(payload.from);
      const remote = { ...payload.sdp, sdp: this.upgradeAudioSdp(payload.sdp.sdp ?? "") };
      await pc.setRemoteDescription(remote);
      const answer = await pc.createAnswer();
      const tuned = { ...answer, sdp: this.upgradeAudioSdp(answer.sdp ?? "") };
      await pc.setLocalDescription(tuned);
      this.broadcast({ type: "answer", from: this.peerId, to: payload.from, sdp: tuned });
    } else if (payload.type === "answer") {
      const entry = this.peers.get(payload.from);
      if (entry) {
        const remote = { ...payload.sdp, sdp: this.upgradeAudioSdp(payload.sdp.sdp ?? "") };
        await entry.pc.setRemoteDescription(remote);
      }
    } else if (payload.type === "ice") {
      const entry = this.peers.get(payload.from);
      if (entry && payload.candidate) {
        try {
          await entry.pc.addIceCandidate(payload.candidate);
        } catch {
          /* ignore */
        }
      }
    } else if (payload.type === "bye") {
      this.removePeer(payload.from);
    }
  }
}
