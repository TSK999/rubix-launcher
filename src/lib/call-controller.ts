/**
 * Global call controller — keeps an active voice call alive across page navigation.
 *
 * One singleton manages the CallManager + roster polling/heartbeat. React
 * components subscribe via `useActiveCall()` and read the current state.
 */
import { useSyncExternalStore } from "react";
import { CallManager, type RemotePeer } from "./webrtc";
import {
  endCall,
  heartbeatCall,
  joinCall,
  leaveCall,
  listActiveParticipants,
  MESH_LIMIT,
  startChannelCall,
  startDmCall,
  type CallParticipant,
  type CallSession,
} from "./calls";
import { requestCallMicrophone, stopCallStream } from "./call-media";
import { getPreferredMicId } from "./audio-devices";

export type CallContext =
  | { kind: "dm"; conversationId: string; title?: string }
  | { kind: "channel"; channelId: string; communityId?: string; title?: string };

export type ActiveCallState = {
  status: "idle" | "starting" | "connecting" | "live" | "leaving";
  callId: string | null;
  context: CallContext | null;
  peers: RemotePeer[];
  participants: CallParticipant[];
  muted: boolean;
  deafened: boolean;
  micDeviceId: string | null;
  micBlocked: boolean;
  error: string | null;
};

const initialState: ActiveCallState = {
  status: "idle",
  callId: null,
  context: null,
  peers: [],
  participants: [],
  muted: false,
  deafened: false,
  micDeviceId: null,
  micBlocked: false,
  error: null,
};


class CallController {
  private state: ActiveCallState = initialState;
  private listeners = new Set<() => void>();
  private manager: CallManager | null = null;
  private rosterTimer: number | null = null;
  private heartbeatTimer: number | null = null;
  private remoteAudioEls = new Map<string, HTMLAudioElement>();

  getState = (): ActiveCallState => this.state;

  subscribe = (cb: () => void): (() => void) => {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  };

  private set(patch: Partial<ActiveCallState>) {
    this.state = { ...this.state, ...patch };
    this.listeners.forEach((cb) => cb());
  }

  private clearTimers() {
    if (this.rosterTimer !== null) window.clearInterval(this.rosterTimer);
    if (this.heartbeatTimer !== null) window.clearInterval(this.heartbeatTimer);
    this.rosterTimer = null;
    this.heartbeatTimer = null;
  }

  isInCallContext(ctx: CallContext): boolean {
    const cur = this.state.context;
    if (!cur || cur.kind !== ctx.kind) return false;
    if (cur.kind === "dm" && ctx.kind === "dm") return cur.conversationId === ctx.conversationId;
    if (cur.kind === "channel" && ctx.kind === "channel") return cur.channelId === ctx.channelId;
    return false;
  }

  async start(ctx: CallContext, existingCallId?: string): Promise<void> {
    if (this.state.status !== "idle" && this.state.status !== "leaving") {
      // Already in a call — switching calls is not supported in one click.
      if (this.isInCallContext(ctx)) return;
      throw new Error("You're already in another call. Leave it first.");
    }

    this.set({ status: "starting", context: ctx, error: null });

    let session: CallSession;
    try {
      if (existingCallId) {
        session = { id: existingCallId } as CallSession;
      } else if (ctx.kind === "dm") {
        session = await startDmCall(ctx.conversationId);
      } else {
        session = await startChannelCall(ctx.channelId);
      }
    } catch (err) {
      this.set({ status: "idle", context: null, error: errMsg(err) });
      throw err;
    }

    // Capacity check
    const current = await listActiveParticipants(session.id);
    if (current.length >= MESH_LIMIT && !current.some((p) => p.peer_id && p.left_at === null && p.user_id && this.isMeFromList(p))) {
      this.set({ status: "idle", context: null, error: `Call is full (max ${MESH_LIMIT})` });
      throw new Error(`Call is full (max ${MESH_LIMIT})`);
    }

    // Acquire mic
    let stream: MediaStream;
    const micDeviceId = getPreferredMicId();
    try {
      stream = await requestCallMicrophone(micDeviceId);
      this.set({ micBlocked: false });
    } catch (err) {
      const blocked =
        err instanceof DOMException &&
        (err.name === "NotAllowedError" || err.name === "SecurityError" || err.name === "NotFoundError");
      this.set({
        status: "idle",
        context: null,
        micBlocked: blocked,
        error: blocked ? "Microphone access blocked" : errMsg(err),
      });
      throw err;
    }

    const mgr = new CallManager(session.id, {
      onPeersChange: (peers) => {
        this.syncRemoteAudio(peers);
        this.set({ peers });
      },
      onLocalStream: () => this.set({ status: "live" }),
      onError: (e) => {
        this.set({ error: e.message });
      },
    }, stream);
    this.manager = mgr;

    this.set({ status: "connecting", callId: session.id, micDeviceId });

    try {
      await mgr.start();
      await joinCall(session.id, mgr.peerId);
    } catch (err) {
      stopCallStream(stream);
      this.manager = null;
      this.set({ status: "idle", callId: null, context: null, error: errMsg(err) });
      throw err;
    }

    // Roster polling + heartbeat
    const refreshRoster = async () => {
      const list = await listActiveParticipants(session.id);
      this.set({ participants: list });
    };
    void refreshRoster();
    this.rosterTimer = window.setInterval(refreshRoster, 4000);
    this.heartbeatTimer = window.setInterval(() => {
      void heartbeatCall(session.id);
    }, 6000);
  }

  // We can't know "me" from a participant row alone; supabase auth is async.
  // This helper is intentionally permissive — capacity check runs again server-side via RLS.
  private isMeFromList(_p: CallParticipant): boolean {
    return false;
  }

  setMuted(muted: boolean) {
    this.manager?.setMuted(muted);
    this.set({ muted });
  }

  setDeafened(deafened: boolean) {
    this.remoteAudioEls.forEach((el) => {
      el.muted = deafened;
    });
    // When deafened, also mute the mic so we don't broadcast while we can't hear.
    if (deafened && !this.state.muted) {
      this.manager?.setMuted(true);
      this.set({ muted: true, deafened });
    } else {
      this.set({ deafened });
    }
  }

  async setMicDevice(deviceId: string) {
    if (!this.manager) return;
    try {
      const newStream = await requestCallMicrophone(deviceId);
      await this.manager.replaceLocalStream(newStream);
      this.set({ micDeviceId: deviceId });
    } catch (err) {
      this.set({ error: errMsg(err) });
      throw err;
    }
  }

  /** Register / unregister the <audio> element used to play a remote peer. */
  registerRemoteAudio(peerId: string, el: HTMLAudioElement | null) {
    if (el) {
      el.muted = this.state.deafened;
      this.remoteAudioEls.set(peerId, el);
    } else {
      this.remoteAudioEls.delete(peerId);
    }
  }

  private syncRemoteAudio(peers: RemotePeer[]) {
    const alive = new Set(peers.map((p) => p.peerId));
    [...this.remoteAudioEls.keys()].forEach((id) => {
      if (!alive.has(id)) this.remoteAudioEls.delete(id);
    });
  }

  async leave(opts: { endForEveryone?: boolean } = {}): Promise<void> {
    if (this.state.status === "idle") return;
    const callId = this.state.callId;
    this.set({ status: "leaving" });
    this.clearTimers();
    const m = this.manager;
    this.manager = null;
    try {
      await m?.stop();
    } catch {
      /* ignore */
    }
    this.remoteAudioEls.clear();
    if (callId) {
      try {
        if (opts.endForEveryone) await endCall(callId);
        else await leaveCall(callId);
      } catch {
        /* ignore */
      }
    }
    this.set({
      status: "idle",
      callId: null,
      context: null,
      peers: [],
      participants: [],
      muted: false,
      deafened: false,
      error: null,
    });
  }
}

const errMsg = (e: unknown) => (e instanceof Error ? e.message : "Unknown error");

export const callController = new CallController();

export const useActiveCall = (): ActiveCallState =>
  useSyncExternalStore(callController.subscribe, callController.getState, callController.getState);

// Best-effort cleanup if the tab is closed mid-call.
if (typeof window !== "undefined") {
  window.addEventListener("beforeunload", () => {
    const s = callController.getState();
    if (s.callId) {
      try {
        const url = `${import.meta.env.VITE_SUPABASE_URL}/rest/v1/call_participants?call_id=eq.${s.callId}`;
        // We can't easily auth a beacon here; rely on the heartbeat/stale filter on other clients.
        navigator.sendBeacon?.(url);
      } catch {
        /* ignore */
      }
    }
  });
}
