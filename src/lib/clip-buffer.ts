/**
 * Rolling clip buffer for Electron.
 *
 * Keeps the most recent N seconds of the active display in memory via a
 * MediaRecorder + circular chunk queue. When `saveClip()` is called, the
 * current chunks are spliced into a webm blob — like console-style instant
 * replay.
 *
 * Lives entirely in the renderer; main only resolves the desktopCapturer
 * source id and fires the F9 trigger.
 */

export type ClipBufferStatus = "idle" | "starting" | "recording" | "error";

export type ClipResult = {
  blob: Blob;
  durationSeconds: number;
  width: number;
  height: number;
};

type Listener = (s: ClipBufferStatus) => void;

const BUFFER_SECONDS = 30;
const TIMESLICE_MS = 1000;
const MAX_CHUNKS = BUFFER_SECONDS + 4; // small safety margin

class ClipBuffer {
  private stream: MediaStream | null = null;
  private recorder: MediaRecorder | null = null;
  private chunks: Blob[] = [];
  private mime = "video/webm;codecs=vp9,opus";
  private width = 0;
  private height = 0;
  private status: ClipBufferStatus = "idle";
  private listeners = new Set<Listener>();

  getStatus() {
    return this.status;
  }

  subscribe(l: Listener) {
    this.listeners.add(l);
    l(this.status);
    return () => this.listeners.delete(l);
  }

  private setStatus(s: ClipBufferStatus) {
    this.status = s;
    this.listeners.forEach((l) => l(s));
  }

  async start(): Promise<void> {
    if (this.status === "recording" || this.status === "starting") return;
    const api = (window as any).rubix;
    if (!api?.isElectron || !api.clips?.getSource) {
      throw new Error("Clip buffer only runs inside the desktop app");
    }
    this.setStatus("starting");

    const src = await api.clips.getSource();
    if (!src?.ok) throw new Error(src?.error || "No screen source");

    const stream = await (navigator.mediaDevices as any).getUserMedia({
      audio: false,
      video: {
        mandatory: {
          chromeMediaSource: "desktop",
          chromeMediaSourceId: src.sourceId,
          maxFrameRate: 30,
        },
      },
    });
    this.stream = stream;

    const track = stream.getVideoTracks()[0];
    const settings = track.getSettings?.() ?? {};
    this.width = settings.width ?? 0;
    this.height = settings.height ?? 0;

    // Pick a supported codec.
    const candidates = [
      "video/webm;codecs=vp9,opus",
      "video/webm;codecs=vp9",
      "video/webm;codecs=vp8",
      "video/webm",
    ];
    this.mime =
      candidates.find((m) =>
        (window as any).MediaRecorder?.isTypeSupported?.(m),
      ) ?? "video/webm";

    const rec = new MediaRecorder(stream, {
      mimeType: this.mime,
      videoBitsPerSecond: 6_000_000,
    });
    rec.ondataavailable = (e) => {
      if (!e.data || e.data.size === 0) return;
      this.chunks.push(e.data);
      if (this.chunks.length > MAX_CHUNKS) {
        this.chunks.splice(0, this.chunks.length - MAX_CHUNKS);
      }
    };
    rec.onerror = () => this.setStatus("error");
    rec.start(TIMESLICE_MS);
    this.recorder = rec;
    this.setStatus("recording");
  }

  stop() {
    try {
      this.recorder?.stop();
    } catch {
      /* noop */
    }
    this.stream?.getTracks().forEach((t) => t.stop());
    this.recorder = null;
    this.stream = null;
    this.chunks = [];
    this.setStatus("idle");
  }

  async saveClip(seconds = BUFFER_SECONDS): Promise<ClipResult> {
    if (this.status !== "recording" || !this.recorder) {
      throw new Error("Buffer is not recording");
    }
    // Flush any in-flight chunk so the tail of the clip lands on disk.
    await new Promise<void>((resolve) => {
      const rec = this.recorder!;
      const once = () => {
        rec.removeEventListener("dataavailable", once);
        resolve();
      };
      rec.addEventListener("dataavailable", once);
      try {
        rec.requestData();
      } catch {
        resolve();
      }
    });

    const want = Math.min(seconds, this.chunks.length);
    const slice = this.chunks.slice(-Math.max(want, 1));
    const blob = new Blob(slice, { type: this.mime });
    return {
      blob,
      durationSeconds: want,
      width: this.width,
      height: this.height,
    };
  }
}

export const clipBuffer = new ClipBuffer();
