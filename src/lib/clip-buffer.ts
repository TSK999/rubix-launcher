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
type BufferedChunk = { data: Uint8Array; startedAt: number; endedAt: number };
type ClipSourceResult =
  | { ok: true; sourceId: string; displayId?: string; name?: string }
  | { ok: false; error?: string };
type RubixClipBridge = {
  rubix?: {
    isElectron?: boolean;
    clips?: { getSource?: () => Promise<ClipSourceResult> };
  };
};
type StableMediaRecorderOptions = MediaRecorderOptions & {
  videoKeyFrameIntervalDuration?: number;
};
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
const WEBM_CLUSTER_ID = [0x1f, 0x43, 0xb6, 0x75];

const rubixBridge = () => (window as Window & RubixClipBridge).rubix;

const findBytes = (data: Uint8Array, needle: number[], start = 0): number => {
  outer: for (let i = start; i <= data.length - needle.length; i += 1) {
    for (let j = 0; j < needle.length; j += 1) {
      if (data[i + j] !== needle[j]) continue outer;
    }
    return i;
  }
  return -1;
};

const readVint = (data: Uint8Array, offset: number, stripMarker: boolean) => {
  const first = data[offset];
  if (first === undefined || first === 0) return null;
  let mask = 0x80;
  let length = 1;
  while (length <= 8 && (first & mask) === 0) {
    mask >>= 1;
    length += 1;
  }
  if (length > 8 || offset + length > data.length) return null;
  let value = stripMarker ? first & (mask - 1) : first;
  for (let i = 1; i < length; i += 1) value = value * 256 + data[offset + i];
  return { length, value, next: offset + length };
};

const readUInt = (data: Uint8Array, offset: number, length: number) => {
  let value = 0;
  for (let i = 0; i < length; i += 1) value = value * 256 + (data[offset + i] ?? 0);
  return value;
};

const writeUInt = (data: Uint8Array, offset: number, length: number, value: number) => {
  let next = Math.max(0, Math.floor(value));
  for (let i = length - 1; i >= 0; i -= 1) {
    data[offset + i] = next & 0xff;
    next = Math.floor(next / 256);
  }
};

const forEachWebmClusterTimecode = (
  data: Uint8Array,
  cb: (value: number, valueOffset: number, valueLength: number) => void,
) => {
  let searchAt = 0;
  while (searchAt < data.length) {
    const clusterAt = findBytes(data, WEBM_CLUSTER_ID, searchAt);
    if (clusterAt < 0) break;
    const size = readVint(data, clusterAt + WEBM_CLUSTER_ID.length, true);
    if (!size) break;
    const contentStart = size.next;
    const nextClusterAt = findBytes(data, WEBM_CLUSTER_ID, contentStart);
    const declaredEnd = Number.isFinite(size.value) ? contentStart + size.value : data.length;
    const contentEnd = Math.min(
      declaredEnd > contentStart ? declaredEnd : data.length,
      nextClusterAt > contentStart ? nextClusterAt : data.length,
      data.length,
    );

    let pos = contentStart;
    while (pos < contentEnd) {
      const id = readVint(data, pos, false);
      if (!id) break;
      const elementSize = readVint(data, id.next, true);
      if (!elementSize) break;
      const valueOffset = elementSize.next;
      const valueEnd = valueOffset + elementSize.value;
      if (valueEnd > contentEnd) break;
      if (id.value === 0xe7) {
        cb(readUInt(data, valueOffset, elementSize.value), valueOffset, elementSize.value);
        break;
      }
      pos = valueEnd;
    }
    searchAt = Math.max(contentEnd, clusterAt + WEBM_CLUSTER_ID.length);
  }
};

const firstClusterTimecode = (chunks: BufferedChunk[]) => {
  for (const chunk of chunks) {
    let found: number | null = null;
    forEachWebmClusterTimecode(chunk.data, (value) => {
      if (found === null) found = value;
    });
    if (found !== null) return found;
  }
  return 0;
};

const normalizeClusterTimecodes = (data: Uint8Array, baseTimecode: number) => {
  const copy = new Uint8Array(data);
  forEachWebmClusterTimecode(copy, (value, valueOffset, valueLength) => {
    writeUInt(copy, valueOffset, valueLength, Math.max(0, value - baseTimecode));
  });
  return copy;
};


const resolutionToHeight = (r: string): number | null => {
  if (r === "source") return null;
  const n = Number(r);
  return Number.isFinite(n) && n > 0 ? n : null;
};

const targetVideoConstraints = (): { width?: number; height?: number; fps: number } => {
  const prefs = getClipPrefs();
  const h = resolutionToHeight(prefs.resolution);
  const w = h ? Math.round((h * 16) / 9) : undefined;
  return { width: w, height: h ?? undefined, fps: prefs.framerate };
};

const getDisplayCapture = async (media: MediaDevices): Promise<MediaStream> => {
  if (!media.getDisplayMedia) {
    throw new Error("Display capture is unavailable");
  }
  const { width, height, fps } = targetVideoConstraints();
  const video: MediaTrackConstraints = {
    frameRate: { ideal: fps, max: fps },
    ...(width ? { width: { ideal: width } } : {}),
    ...(height ? { height: { ideal: height } } : {}),
  };
  const audio = {
    systemAudio: "include",
    echoCancellation: false,
    noiseSuppression: false,
    autoGainControl: false,
  } as MediaTrackConstraints;
  try {
    return await media.getDisplayMedia({ video, audio });
  } catch (err) {
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

  const { width, height, fps } = targetVideoConstraints();
  const constraints = (withAudio: boolean) => ({
    audio: withAudio
      ? ({ mandatory: { chromeMediaSource: "desktop" } } as unknown as MediaTrackConstraints)
      : false,
    video: {
      mandatory: {
        chromeMediaSource: "desktop",
        chromeMediaSourceId: source.sourceId,
        maxFrameRate: fps,
        ...(width ? { maxWidth: width } : {}),
        ...(height ? { maxHeight: height } : {}),
      },
    } as unknown as MediaTrackConstraints,
  });

  try {
    return await media.getUserMedia!(constraints(true));
  } catch {
    return media.getUserMedia!(constraints(false));
  }
};

const getCaptureStream = async (): Promise<MediaStream> => {
  const media = navigator.mediaDevices as MediaDevices & {
    getUserMedia?: (constraints: MediaStreamConstraints) => Promise<MediaStream>;
  };
  if (!navigator.mediaDevices || !media.getUserMedia) {
    throw new Error("Desktop capture is unavailable");
  }

  const attempts = [() => getDisplayCapture(media), () => getLegacyDesktopCapture(media)];

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
  private pendingChunkWrite: Promise<void> = Promise.resolve();
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
      const capture = await getCaptureStream();
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
      ? ["video/webm;codecs=vp8,opus", "video/webm;codecs=vp9,opus", "video/webm"]
      : ["video/webm;codecs=vp8", "video/webm;codecs=vp9", "video/webm"];
    this.mime =
      candidates.find((m) =>
        (window as any).MediaRecorder?.isTypeSupported?.(m),
      ) ?? "video/webm";

    const rec = new MediaRecorder(stream, {
      mimeType: this.mime,
      videoBitsPerSecond: 6_000_000,
      videoKeyFrameIntervalDuration: 1000,
    } as MediaRecorderOptions);
    let chunkStartedAt = Date.now();
    rec.ondataavailable = async (e) => {
      const endedAt = Date.now();
      if (!e.data || e.data.size === 0) return;
      const startedAt = chunkStartedAt;
      chunkStartedAt = endedAt;
      this.pendingChunkWrite = this.pendingChunkWrite.catch(() => undefined).then(async () => {
        const chunk: BufferedChunk = {
          data: new Uint8Array(await e.data.arrayBuffer()),
          startedAt,
          endedAt,
        };
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
      });
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
    this.pendingChunkWrite = Promise.resolve();
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
    await this.pendingChunkWrite.catch(() => undefined);

    if (this.chunks.length <= 0 || !this.initChunk) {
      throw new Error("Clip recorder is warming up — try again in a few seconds");
    }
    const latest = this.chunks[this.chunks.length - 1];
    const cutoff = latest.endedAt - seconds * 1000;
    const slice = this.chunks.filter((chunk) => chunk.endedAt >= cutoff);
    const first = slice[0] ?? latest;
    const durationSeconds = Math.max(1, Math.round((latest.endedAt - first.startedAt) / 1000));
    // Rebuild the saved clip from the original WebM header plus complete
    // cluster-bearing chunks only. Long clips were inconsistent because the
    // old path prepended the entire first one-second chunk (not just the init
    // segment), which duplicated media data and produced invalid timestamps
    // once the requested range crossed certain boundaries.
    const headerEnd = Math.max(0, findBytes(this.initChunk.data, WEBM_CLUSTER_ID));
    const header = this.initChunk.data.slice(0, headerEnd || this.initChunk.data.length);
    const clusterChunks = slice.filter((c) => findBytes(c.data, WEBM_CLUSTER_ID) >= 0);
    if (!header.length || !clusterChunks.length) {
      throw new Error("Clip recorder is warming up — try again in a few seconds");
    }
    const baseTimecode = firstClusterTimecode(clusterChunks);
    const parts: BlobPart[] = [header, ...clusterChunks.map((c) => normalizeClusterTimecodes(c.data, baseTimecode))];
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
