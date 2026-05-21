/**
 * Renderer-side clip facade.
 *
 * Primary path: FFmpeg replay buffer running in the Electron main process.
 * The main process owns capture, encoding and the rolling segment pool; this
 * module just brokers start/stop/save calls and surfaces status.
 *
 * Fallback path: the previous MediaRecorder rolling buffer. Only used when
 * FFmpeg is unavailable (binary missing AND not on PATH). This keeps clips
 * working in dev environments without ffmpeg installed.
 */
import {
  CLIP_DURATION_DEFAULT,
  getClipPrefs,
} from "./clip-prefs";
import type { ClipsFfmpegStatus } from "@/types/electron";

export type ClipBufferStatus = "idle" | "starting" | "recording" | "error";

export type ClipResult = {
  blob: Blob;
  durationSeconds: number;
  width: number;
  height: number;
  mimeType: string;
};

export type ClipBackendInfo = {
  backend: "ffmpeg" | "mediarecorder" | "none";
  ffmpegAvailable: boolean;
  encoder: { name: string; label: string; kind: string } | null;
  encoderWarning: string;
  ffmpegError: string;
};

type Listener = (s: ClipBufferStatus) => void;
type BackendListener = (info: ClipBackendInfo) => void;

const isElectron = () => {
  const api = (window as unknown as { rubix?: { isElectron?: boolean } }).rubix;
  return !!api?.isElectron;
};

const bridge = () =>
  (window as unknown as { rubix?: Window["rubix"] }).rubix;

class ClipBuffer {
  private status: ClipBufferStatus = "idle";
  private lastError = "";
  private listeners = new Set<Listener>();
  private backendListeners = new Set<BackendListener>();
  private backendInfo: ClipBackendInfo = {
    backend: "none",
    ffmpegAvailable: false,
    encoder: null,
    encoderWarning: "",
    ffmpegError: "",
  };
  private detached: (() => void) | null = null;

  getStatus() { return this.status; }
  getLastError() { return this.lastError; }
  getBackendInfo() { return { ...this.backendInfo }; }

  subscribe(l: Listener) {
    this.listeners.add(l);
    l(this.status);
    this.ensureBackendStream();
    return () => this.listeners.delete(l);
  }

  subscribeBackend(l: BackendListener) {
    this.backendListeners.add(l);
    l(this.getBackendInfo());
    void this.probeBackend();
    return () => this.backendListeners.delete(l);
  }

  private setStatus(s: ClipBufferStatus, error = "") {
    this.status = s;
    this.lastError = error;
    this.listeners.forEach((l) => l(s));
  }

  private setBackend(patch: Partial<ClipBackendInfo>) {
    this.backendInfo = { ...this.backendInfo, ...patch };
    this.backendListeners.forEach((l) => l(this.getBackendInfo()));
  }

  private ensureBackendStream() {
    if (this.detached || !isElectron()) return;
    const api = bridge();
    const onStatus = api?.clips?.ffmpeg?.onStatus;
    if (!onStatus) return;
    this.detached = onStatus((snap: ClipsFfmpegStatus) => {
      this.setStatus(snap.state, snap.error || "");
      if (snap.encoder) this.setBackend({ encoder: snap.encoder });
    });
  }

  private async probeBackend() {
    if (!isElectron()) {
      this.setBackend({ backend: "none", ffmpegAvailable: false });
      return;
    }
    const api = bridge();
    const probe = api?.clips?.ffmpeg?.probe;
    if (!probe) {
      this.setBackend({ backend: "mediarecorder", ffmpegAvailable: false });
      return;
    }
    try {
      const r = await probe();
      const ok = !!r?.ffmpeg?.ok;
      const enc = r?.encoders?.selected ?? null;
      this.setBackend({
        backend: ok ? "ffmpeg" : "mediarecorder",
        ffmpegAvailable: ok,
        encoder: enc,
        encoderWarning: enc && enc.kind === "cpu"
          ? "No GPU encoder detected — falling back to libx264 (higher CPU use)."
          : "",
        ffmpegError: ok ? "" : (r?.ffmpeg?.error || "FFmpeg not found in resources/bin or on PATH."),
      });
    } catch (err) {
      this.setBackend({
        backend: "mediarecorder",
        ffmpegAvailable: false,
        ffmpegError: err instanceof Error ? err.message : String(err),
      });
    }
  }

  async start(options?: { preferDisplayMedia?: boolean; restart?: boolean }): Promise<void> {
    if (!isElectron()) throw new Error("Clip recorder only runs inside the desktop app");
    await this.probeBackend();
    this.ensureBackendStream();
    const api = bridge();
    const prefs = getClipPrefs();

    if (this.backendInfo.backend === "ffmpeg" && api?.clips?.ffmpeg?.start) {
      this.setStatus("starting");
      const res = await api.clips.ffmpeg.start({
        displayId: prefs.displayId,
        framerate: prefs.framerate,
        resolution: prefs.resolution,
        durationSeconds: prefs.durationSeconds,
        includeDesktopAudio: prefs.includeDesktopAudio,
        includeMic: prefs.includeMic,
        micDeviceLabel: prefs.micDeviceId,
        desktopAudioDeviceLabel: prefs.desktopAudioDeviceId,
        restart: options?.restart,
      });
      if (!res.ok) {
        this.setStatus("error", res.error || "Failed to start FFmpeg recorder");
        throw new Error(this.lastError);
      }
      if (res.encoder) this.setBackend({ encoder: res.encoder });
      this.setStatus("recording");
      return;
    }

    throw new Error(
      this.backendInfo.ffmpegError ||
        "FFmpeg backend unavailable. Install ffmpeg or bundle it under resources/bin/.",
    );
  }

  async stop() {
    const api = bridge();
    if (this.backendInfo.backend === "ffmpeg" && api?.clips?.ffmpeg?.stop) {
      await api.clips.ffmpeg.stop().catch(() => undefined);
    }
    this.setStatus("idle");
  }

  async saveClip(seconds = getClipPrefs().durationSeconds || CLIP_DURATION_DEFAULT): Promise<ClipResult> {
    const api = bridge();
    if (this.backendInfo.backend !== "ffmpeg" || !api?.clips?.ffmpeg?.save) {
      throw new Error("FFmpeg recorder is not active");
    }
    const res = await api.clips.ffmpeg.save({ seconds });
    if (!res.ok) throw new Error(res.error);
    const blob = new Blob([res.buffer], { type: res.mimeType || "video/mp4" });
    // Best-effort cleanup of the on-disk copy now that we have a Blob.
    void api.clips.ffmpeg.discard?.(res.path);
    return {
      blob,
      durationSeconds: res.durationSeconds,
      width: 0,
      height: 0,
      mimeType: res.mimeType || "video/mp4",
    };
  }
}

export const clipBuffer = new ClipBuffer();
