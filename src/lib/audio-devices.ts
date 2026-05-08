// Mic device enumeration + persisted preference for voice calls.

const STORAGE_KEY = "rubix:mic-device-id";

export type MicDevice = { deviceId: string; label: string };

export const getPreferredMicId = (): string | null => {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
};

export const setPreferredMicId = (id: string | null) => {
  try {
    if (id) localStorage.setItem(STORAGE_KEY, id);
    else localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
  micChangeListeners.forEach((cb) => cb(id));
};

const micChangeListeners = new Set<(id: string | null) => void>();
export const onPreferredMicChange = (cb: (id: string | null) => void) => {
  micChangeListeners.add(cb);
  return () => micChangeListeners.delete(cb);
};

export const listMicDevices = async (): Promise<MicDevice[]> => {
  if (!navigator.mediaDevices?.enumerateDevices) return [];
  // Labels are only populated after permission has been granted at least once.
  const devices = await navigator.mediaDevices.enumerateDevices();
  return devices
    .filter((d) => d.kind === "audioinput")
    .map((d, i) => ({
      deviceId: d.deviceId,
      label: d.label || `Microphone ${i + 1}`,
    }));
};

/** Prompt for permission so labels become visible, then enumerate. */
export const listMicDevicesWithPermission = async (): Promise<MicDevice[]> => {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    stream.getTracks().forEach((t) => t.stop());
  } catch {
    /* user may have denied; we still try to enumerate */
  }
  return listMicDevices();
};
