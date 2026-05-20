/**
 * User preferences for the clip recorder.
 * Persisted in localStorage; subscribers are notified on any change so the
 * clip buffer / main process can react (e.g. restart recorder when monitor
 * or audio sources change).
 */

export type ClipPrefs = {
  displayId: string | null;        // electron screen id ("0", "1", ...)
  micDeviceId: string | null;       // separate from in-call mic
  desktopAudioDeviceId: string | null; // informational; null = system loopback
  includeDesktopAudio: boolean;
  includeMic: boolean;
  durationSeconds: number;          // 10..120
};

const KEY = "rubix:clip-prefs";

export const CLIP_DURATION_MIN = 10;
export const CLIP_DURATION_MAX = 120;
export const CLIP_DURATION_DEFAULT = 30;

const DEFAULTS: ClipPrefs = {
  displayId: null,
  micDeviceId: null,
  desktopAudioDeviceId: null,
  includeDesktopAudio: true,
  includeMic: true,
  durationSeconds: CLIP_DURATION_DEFAULT,
};

const clamp = (n: number, min: number, max: number) =>
  Math.min(max, Math.max(min, Math.round(n)));

const read = (): ClipPrefs => {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { ...DEFAULTS };
    const parsed = JSON.parse(raw) as Partial<ClipPrefs>;
    return {
      ...DEFAULTS,
      ...parsed,
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
