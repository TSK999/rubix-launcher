import callStartUrl from "@/assets/sounds/call-start.mp3";
import callReceiveUrl from "@/assets/sounds/call-receive.mp3";
import msgUrl from "@/assets/sounds/msg.mp3";

type SoundName = "call-start" | "call-receive" | "msg";

const sources: Record<SoundName, string> = {
  "call-start": callStartUrl,
  "call-receive": callReceiveUrl,
  msg: msgUrl,
};

const cache = new Map<SoundName, HTMLAudioElement>();

function get(name: SoundName): HTMLAudioElement {
  let el = cache.get(name);
  if (!el) {
    el = new Audio(sources[name]);
    el.preload = "auto";
    cache.set(name, el);
  }
  return el;
}

export function playSound(name: SoundName, opts?: { loop?: boolean; volume?: number }) {
  try {
    const base = get(name);
    // Clone so overlapping plays work; loops use the cached element so we can stop it.
    if (opts?.loop) {
      base.loop = true;
      base.volume = opts.volume ?? 0.6;
      base.currentTime = 0;
      void base.play().catch(() => {});
      return () => stopSound(name);
    }
    const inst = base.cloneNode(true) as HTMLAudioElement;
    inst.volume = opts?.volume ?? 0.6;
    void inst.play().catch(() => {});
    return () => {
      inst.pause();
    };
  } catch {
    return () => {};
  }
}

export function stopSound(name: SoundName) {
  const el = cache.get(name);
  if (el) {
    el.pause();
    el.currentTime = 0;
    el.loop = false;
  }
}
