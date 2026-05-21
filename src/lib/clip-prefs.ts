/**
 * User preferences for the clip recorder.
 * Persisted in localStorage; subscribers are notified on any change so the
 * clip buffer / main process can react (e.g. restart recorder when monitor
 * or audio sources change).
 */

export type ClipResolution = "source" | "2160" | "1440" | "1080" | "720" | "480";
export type ClipFramerate = 24 | 30 | 48 | 60 | 120;

export const CLIP_RESOLUTIONS: { value: ClipResolution; label: string }[] = [
  { value: "source", label: "Source (native)" },
  { value: "2160", label: "2160p (4K)" },
  { value: "1440", label: "1440p (2K)" },
  { value: "1080", label: "1080p (Full HD)" },
  { value: "720", label: "720p (HD)" },
  { value: "480", label: "480p" },
];

export const CLIP_FRAMERATES: ClipFramerate[] = [24, 30, 48, 60, 120];

export type ClipPrefs = {
  displayId: string | null;
  micDeviceId: string | null;
  desktopAudioDeviceId: string | null;
  includeDesktopAudio: boolean;
  includeMic: boolean;
  durationSeconds: number;          // 10..120
  resolution: ClipResolution;       // target vertical resolution
  framerate: ClipFramerate;         // target fps
};

const KEY = "rubix:clip-prefs";

export const CLIP_DURATION_MIN = 10;
export const CLIP_DURATION_MAX = 120;
export const CLIP_DURATION_DEFAULT = 30;

const DEFAULTS: ClipPrefs = {
  displayId: null,
  micDeviceId: null,
  desktopAudioDeviceId: null,
  // Off by default: Windows can't capture system audio without a loopback
  // device (Stereo Mix / VB-Cable) installed. Recording would fail silently.
  includeDesktopAudio: false,
  includeMic: false,
  durationSeconds: CLIP_DURATION_DEFAULT,
  resolution: "1080",
  framerate: 60,
};

const clamp = (n: number, min: number, max: number) =>
  Math.min(max, Math.max(min, Math.round(n)));

const read = (): ClipPrefs => {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { ...DEFAULTS };
    const parsed = JSON.parse(raw) as Partial<ClipPrefs>;
    // v1.3.3 and older could persist browser deviceId hashes / default audio
    // toggles that FFmpeg cannot use. Do not let stale prefs keep crashing the
    // recorder after the app updates.
    const validMic = parsed.micDeviceId && !/^[a-f0-9]{32,}$/i.test(parsed.micDeviceId)
      ? parsed.micDeviceId
      : null;
    const validDesktop = parsed.desktopAudioDeviceId && !/^[a-f0-9]{32,}$/i.test(parsed.desktopAudioDeviceId)
      ? parsed.desktopAudioDeviceId
      : null;
    return {
      ...DEFAULTS,
      ...parsed,
      micDeviceId: validMic,
      desktopAudioDeviceId: validDesktop,
      includeMic: Boolean(parsed.includeMic && validMic),
      includeDesktopAudio: Boolean(parsed.includeDesktopAudio && validDesktop),
      durationSeconds: clamp(
        parsed.durationSeconds ?? CLIP_DURATION_DEFAULT,
        CLIP_DURATION_MIN,
        CLIP_DURATION_MAX,
      ),
    };
  } catch {
    return { ...DEFAULTS };
  }
};

let cache: ClipPrefs = read();
const listeners = new Set<(p: ClipPrefs) => void>();

export const getClipPrefs = (): ClipPrefs => ({ ...cache });

export const setClipPrefs = (patch: Partial<ClipPrefs>) => {
  cache = {
    ...cache,
    ...patch,
    durationSeconds: clamp(
      patch.durationSeconds ?? cache.durationSeconds,
      CLIP_DURATION_MIN,
      CLIP_DURATION_MAX,
    ),
  };
  try {
    localStorage.setItem(KEY, JSON.stringify(cache));
  } catch {
    /* ignore */
  }
  listeners.forEach((cb) => cb({ ...cache }));
};

export const onClipPrefsChange = (cb: (p: ClipPrefs) => void) => {
  listeners.add(cb);
  return () => listeners.delete(cb);
};
