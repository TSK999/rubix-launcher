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
import {
  CLIP_DURATION_DEFAULT,
  CLIP_DURATION_MAX,
  getClipPrefs,
} from "./clip-prefs";


export type ClipBufferStatus = "idle" | "starting" | "recording" | "error";

export type ClipResult = {
  blob: Blob;
  durationSeconds: number;
  width: number;
  height: number;
};

type Listener = (s: ClipBufferStatus) => void;
type BufferedChunk = { blob: Blob; startedAt: number; endedAt: number };
type PreparedCapture = {
  stream: MediaStream;
  ownedStreams: MediaStream[];
  audioContext: AudioContext | null;
  audioNodes: MediaStreamAudioSourceNode[];
  hasAudio: boolean;
};

const TIMESLICE_MS = 1000;
// Buffer enough seconds for the longest configurable clip length, with a
// small safety margin so the last chunk is always available on save.
const MAX_CHUNKS = CLIP_DURATION_MAX + 4;


const getDisplayCapture = async (media: MediaDevices): Promise<MediaStream> => {
  if (!media.getDisplayMedia) {
    throw new Error("Display capture is unavailable");
  }
  const video = {
    frameRate: { ideal: 60, max: 60 },
    width: { ideal: 1920 },
    height: { ideal: 1080 },
  } as MediaTrackConstraints;
  const audio = {
    systemAudio: "include",
    echoCancellation: false,
    noiseSuppression: false,
    autoGainControl: false,
  } as MediaTrackConstraints;
  try {
    return await media.getDisplayMedia({ video, audio });
  } catch (err) {
    // Some Windows/Linux machines reject loopback audio even when screen capture
    // works. Fall back to video-only so mic capture can still be mixed in below.
    const audioError = err instanceof Error ? err.message : String(err);
    try {
      return await media.getDisplayMedia({ video, audio: false });
    } catch {
      throw new Error(audioError || "Display capture failed");
    }
  }
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

  const constraints = (withAudio: boolean) => ({
    audio: withAudio
      ? ({ mandatory: { chromeMediaSource: "desktop" } } as unknown as MediaTrackConstraints)
      : false,
    video: {
      mandatory: {
        chromeMediaSource: "desktop",
        chromeMediaSourceId: source.sourceId,
        maxFrameRate: 60,
      },
    } as unknown as MediaTrackConstraints,
  });

  try {
    return await media.getUserMedia!(constraints(true));
  } catch {
    return media.getUserMedia!(constraints(false));
  }
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

const getMicStream = async (media: MediaDevices): Promise<MediaStream | null> => {
  const prefs = getClipPrefs();
  if (!prefs.includeMic) return null;
  const baseAudio: MediaTrackConstraints = {
    echoCancellation: false,
    noiseSuppression: false,
    autoGainControl: false,
  };
  if (prefs.micDeviceId) {
    (baseAudio as MediaTrackConstraints & { deviceId?: ConstrainDOMString }).deviceId = {
      exact: prefs.micDeviceId,
    } as ConstrainDOMString;
  }
  try {
    return await media.getUserMedia({ audio: baseAudio, video: false });
  } catch {
    // Fall back to default mic if the pinned device is no longer available.
    if (prefs.micDeviceId) {
      try {
        return await media.getUserMedia({
          audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
          video: false,
        });
      } catch {
        return null;
      }
    }
    return null;
  }
};

const mixAudioIntoCapture = async (capture: MediaStream): Promise<PreparedCapture> => {
  const media = navigator.mediaDevices;
  const prefs = getClipPrefs();
  // Drop loopback tracks if the user disabled desktop audio.
  if (!prefs.includeDesktopAudio) {
    capture.getAudioTracks().forEach((t) => {
      t.stop();
      capture.removeTrack(t);
    });
  }
  const mic = await getMicStream(media);
  const audioTracks = [...capture.getAudioTracks(), ...(mic?.getAudioTracks() ?? [])];
  if (audioTracks.length === 0) {
    return { stream: capture, ownedStreams: [capture], audioContext: null, audioNodes: [], hasAudio: false };
  }

  const AudioContextCtor = window.AudioContext || (window as any).webkitAudioContext;
  if (!AudioContextCtor) {
    return {
      stream: new MediaStream([...capture.getVideoTracks(), ...audioTracks]),
      ownedStreams: mic ? [capture, mic] : [capture],
      audioContext: null,
      audioNodes: [],
      hasAudio: true,
    };
  }

  const audioContext = new AudioContextCtor();
  const destination = audioContext.createMediaStreamDestination();
  const audioNodes: MediaStreamAudioSourceNode[] = [];
  const streams = [capture, mic].filter(Boolean) as MediaStream[];
  streams.forEach((stream) => {
    if (stream.getAudioTracks().length > 0) {
      const source = audioContext.createMediaStreamSource(stream);
      source.connect(destination);
      audioNodes.push(source);
    }
  });

  return {
    stream: new MediaStream([...capture.getVideoTracks(), ...destination.stream.getAudioTracks()]),
    ownedStreams: streams,
    audioContext,
    audioNodes,
    hasAudio: destination.stream.getAudioTracks().length > 0,
  };
};

class ClipBuffer {
  private stream: MediaStream | null = null;
  private ownedStreams: MediaStream[] = [];
  private audioContext: AudioContext | null = null;
  private audioNodes: MediaStreamAudioSourceNode[] = [];
  private recorder: MediaRecorder | null = null;
  private chunks: BufferedChunk[] = [];
  private initChunk: BufferedChunk | null = null;
  private mime = "video/webm;codecs=vp9";
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

  async start(options?: { preferDisplayMedia?: boolean; restart?: boolean }): Promise<void> {
    if (this.status === "starting") return;
    if (this.status === "recording") {
      if (!options?.preferDisplayMedia && !options?.restart) return;
      this.stop();
    }
    const api = (window as any).rubix;
    if (!api?.isElectron) {
      throw new Error("Clip buffer only runs inside the desktop app");
    }
    this.setStatus("starting");

    // Prefer Electron's desktopCapturer source-id video capture path so the
    // rolling buffer can start automatically after sign-in.
    let prepared: PreparedCapture;
    try {
      const capture = await getCaptureStream(Boolean(options?.preferDisplayMedia));
      prepared = await mixAudioIntoCapture(capture);
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      this.setStatus("error", error);
      throw new Error(error);
    }
    const stream = prepared.stream;
    this.stream = stream;
    this.ownedStreams = prepared.ownedStreams;
    this.audioContext = prepared.audioContext;
    this.audioNodes = prepared.audioNodes;

    const track = stream.getVideoTracks()[0];
    if (!track) {
      prepared.ownedStreams.forEach((s) => s.getTracks().forEach((t) => t.stop()));
      void prepared.audioContext?.close();
      this.setStatus("error", "Video capture started without a video track");
      throw new Error("Video capture started without a video track");
    }
    const settings = track.getSettings?.() ?? {};
    this.width = settings.width ?? 0;
    this.height = settings.height ?? 0;

    // Pick a supported codec.
    const candidates = prepared.hasAudio
      ? ["video/webm;codecs=vp9,opus", "video/webm;codecs=vp8,opus", "video/webm"]
      : ["video/webm;codecs=vp9", "video/webm;codecs=vp8", "video/webm"];
    this.mime =
      candidates.find((m) =>
        (window as any).MediaRecorder?.isTypeSupported?.(m),
      ) ?? "video/webm";

    const rec = new MediaRecorder(stream, {
      mimeType: this.mime,
      videoBitsPerSecond: 6_000_000,
    });
    let chunkStartedAt = Date.now();
    rec.ondataavailable = (e) => {
      const endedAt = Date.now();
      if (!e.data || e.data.size === 0) return;
      const chunk: BufferedChunk = { blob: e.data, startedAt: chunkStartedAt, endedAt };
      chunkStartedAt = endedAt;
      // The first chunk emitted by MediaRecorder carries the WebM init/header
      // segment. Without it, any later slice is an unplayable/corrupt file.
      // Keep it pinned and prepend on save.
      if (!this.initChunk) {
        this.initChunk = chunk;
        return;
      }
      this.chunks.push(chunk);
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
    this.ownedStreams.forEach((s) => s.getTracks().forEach((t) => t.stop()));
    if (this.ownedStreams.length === 0) {
      this.stream?.getTracks().forEach((t) => t.stop());
    }
    void this.audioContext?.close();
    this.recorder = null;
    this.stream = null;
    this.ownedStreams = [];
    this.audioContext = null;
    this.audioNodes = [];
    this.chunks = [];
    this.initChunk = null;
    this.setStatus("idle");
  }

  async saveClip(seconds = getClipPrefs().durationSeconds || CLIP_DURATION_DEFAULT): Promise<ClipResult> {
    if (this.status !== "recording" || !this.recorder) {
      throw new Error("Buffer is not recording");
    }
    // Flush any in-flight chunk so the tail of the clip lands on disk.
    await new Promise<void>((resolve) => {
      const rec = this.recorder!;
      const once = () => {
        window.clearTimeout(timeout);
        rec.removeEventListener("dataavailable", once);
        resolve();
      };
      const timeout = window.setTimeout(() => {
        rec.removeEventListener("dataavailable", once);
        resolve();
      }, 1200);
      rec.addEventListener("dataavailable", once);
      try {
        rec.requestData();
      } catch {
        resolve();
      }
    });

    if (this.chunks.length <= 0 || !this.initChunk) {
      throw new Error("Clip recorder is warming up — try again in a few seconds");
    }
    const latest = this.chunks[this.chunks.length - 1];
    const cutoff = latest.endedAt - seconds * 1000;
    const slice = this.chunks.filter((chunk) => chunk.endedAt >= cutoff);
    const first = slice[0] ?? latest;
    const durationSeconds = Math.max(1, Math.round((latest.endedAt - first.startedAt) / 1000));
    // Always prepend the init segment so the WebM container stays valid even
    // after the original first chunk has aged out of the rolling buffer.
    const parts = [this.initChunk.blob, ...slice.map((c) => c.blob)];
    const blob = new Blob(parts, { type: this.mime });
    return {
      blob,
      durationSeconds: Math.min(seconds, durationSeconds),
      width: this.width,
      height: this.height,
    };
  }
}

export const clipBuffer = new ClipBuffer();
