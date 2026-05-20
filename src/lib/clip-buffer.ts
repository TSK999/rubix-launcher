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

const getDisplayCapture = async (media: MediaDevices): Promise<MediaStream> => {
  if (!media.getDisplayMedia) {
    throw new Error("Display capture is unavailable");
  }
  return media.getDisplayMedia({
    video: { frameRate: 30 } as MediaTrackConstraints,
    audio: false,
  });
};

const getLegacyDesktopCapture = async (
  media: MediaDevices & { getUserMedia?: (constraints: MediaStreamConstraints) => Promise<MediaStream> },
): Promise<MediaStream> => {
  const api = (window as any).rubix;
  if (!api?.clips?.getSource) {
    throw new Error("Desktop source bridge is unavailable");
  }
  const source = await api.clips.getSource();
  if (!source?.ok || !source.sourceId) {
    throw new Error(source?.error || "No screen source found");
  }

  return media.getUserMedia!({
    audio: false,
    video: {
      mandatory: {
        chromeMediaSource: "desktop",
        chromeMediaSourceId: source.sourceId,
        maxFrameRate: 30,
      },
    } as unknown as MediaTrackConstraints,
  });
};

const getCaptureStream = async (preferDisplayMedia = false): Promise<MediaStream> => {
  const media = navigator.mediaDevices as MediaDevices & {
    getUserMedia?: (constraints: MediaStreamConstraints) => Promise<MediaStream>;
  };
  if (!navigator.mediaDevices || !media.getUserMedia) {
    throw new Error("Desktop capture is unavailable");
  }

  const attempts = preferDisplayMedia
    ? [() => getDisplayCapture(media), () => getLegacyDesktopCapture(media)]
    : [() => getLegacyDesktopCapture(media), () => getDisplayCapture(media)];

  const errors: string[] = [];
  for (const attempt of attempts) {
    try {
      return await attempt();
    } catch (err) {
      errors.push(err instanceof Error ? err.message : String(err));
    }
  }
  throw new Error(`Video capture failed: ${errors.filter(Boolean).join(" | ")}`);
};

class ClipBuffer {
  private stream: MediaStream | null = null;
  private recorder: MediaRecorder | null = null;
  private chunks: Blob[] = [];
  private mime = "video/webm;codecs=vp9,opus";
  private width = 0;
  private height = 0;
  private status: ClipBufferStatus = "idle";
  private lastError = "";
  private listeners = new Set<Listener>();

  getStatus() {
    return this.status;
  }

  getLastError() {
    return this.lastError;
  }

  subscribe(l: Listener) {
    this.listeners.add(l);
    l(this.status);
    return () => this.listeners.delete(l);
  }

  private setStatus(s: ClipBufferStatus, error = "") {
    this.status = s;
    this.lastError = error;
    this.listeners.forEach((l) => l(s));
  }

  async start(options?: { preferDisplayMedia?: boolean }): Promise<void> {
    if (this.status === "recording" || this.status === "starting") return;
    const api = (window as any).rubix;
    if (!api?.isElectron) {
      throw new Error("Clip buffer only runs inside the desktop app");
    }
    this.setStatus("starting");

    // Prefer Electron's desktopCapturer source-id video capture path so the
    // rolling buffer can start automatically after sign-in.
    let stream: MediaStream;
    try {
      stream = await getCaptureStream(Boolean(options?.preferDisplayMedia));
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      this.setStatus("error", error);
      throw new Error(error);
    }
    this.stream = stream;

    const track = stream.getVideoTracks()[0];
    if (!track) {
      stream.getTracks().forEach((t) => t.stop());
      this.setStatus("error", "Video capture started without a video track");
      throw new Error("Video capture started without a video track");
    }
    const settings = track.getSettings?.() ?? {};
    this.width = settings.width ?? 0;
    this.height = settings.height ?? 0;

    // Pick a supported codec.
    const candidates = [
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
      const timeout = window.setTimeout(() => {
        rec.removeEventListener("dataavailable", once);
        resolve();
      }, 1200);
      const once = () => {
        window.clearTimeout(timeout);
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
    if (want <= 0) {
      throw new Error("Clip recorder is warming up — try again in a few seconds");
    }
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
