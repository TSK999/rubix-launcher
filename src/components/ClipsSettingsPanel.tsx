import { useEffect, useState } from "react";
import { Mic, Monitor, Volume2, Clock, Film, MonitorPlay, Gauge } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  CLIP_DURATION_MAX,
  CLIP_DURATION_MIN,
  CLIP_FRAMERATES,
  CLIP_RESOLUTIONS,
  getClipPrefs,
  onClipPrefsChange,
  setClipPrefs,
  type ClipFramerate,
  type ClipPrefs,
  type ClipResolution,
} from "@/lib/clip-prefs";
import { listMicDevicesWithPermission, type MicDevice } from "@/lib/audio-devices";

type Display = {
  id: string;
  label: string;
  width: number;
  height: number;
  isPrimary: boolean;
  isCursor: boolean;
};

type AudioOut = { deviceId: string; label: string };

const listAudioOutputs = async (): Promise<AudioOut[]> => {
  if (!navigator.mediaDevices?.enumerateDevices) return [];
  try {
    // Trigger a mic permission prompt so output labels populate too.
    const probe = await navigator.mediaDevices.getUserMedia({ audio: true });
    probe.getTracks().forEach((t) => t.stop());
  } catch {
    /* ignore */
  }
  const devices = await navigator.mediaDevices.enumerateDevices();
  return devices
    .filter((d) => d.kind === "audiooutput")
    .map((d, i) => ({ deviceId: d.deviceId, label: d.label || `Output ${i + 1}` }));
};

export const ClipsSettingsPanel = () => {
  const [prefs, setPrefs] = useState<ClipPrefs>(getClipPrefs());
  const [displays, setDisplays] = useState<Display[]>([]);
  const [mics, setMics] = useState<MicDevice[]>([]);
  const [outputs, setOutputs] = useState<AudioOut[]>([]);
  const api = (window as any).rubix;
  const isElectron = !!api?.isElectron;

  useEffect(() => {
    const off = onClipPrefsChange(setPrefs);
    return () => {
      off();
    };
  }, []);

  useEffect(() => {
    if (isElectron && api.clips?.listDisplays) {
      void api.clips.listDisplays().then((r: { ok: boolean; displays: Display[] }) => {
        if (r?.ok) setDisplays(r.displays);
      });
    }
    void listMicDevicesWithPermission().then(setMics);
    void listAudioOutputs().then(setOutputs);
  }, [isElectron, api]);

  const update = (patch: Partial<ClipPrefs>) => setClipPrefs(patch);

  return (
    <div className="space-y-3">
      <div className="rounded-2xl rubix-glass rubix-card-hi p-4">
        <div className="flex items-center gap-2 text-sm font-medium">
          <Monitor className="h-4 w-4 text-primary" />
          Monitor
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          Which display to record. Auto picks the screen the active game is on.
        </p>
        <div className="mt-3">
          <Select
            value={prefs.displayId ?? "auto"}
            onValueChange={(v) => update({ displayId: v === "auto" ? null : v })}
          >
            <SelectTrigger className="w-full rounded-xl">
              <SelectValue placeholder="Auto" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="auto">Auto (follow active game)</SelectItem>
              {displays.map((d) => (
                <SelectItem key={d.id} value={d.id}>
                  {d.label} · {d.width}×{d.height}
                  {d.isPrimary ? " · primary" : ""}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {!isElectron && (
            <p className="mt-2 text-[11px] text-muted-foreground">
              Monitor list only available inside the desktop app.
            </p>
          )}
        </div>
      </div>

      <div className="rounded-2xl rubix-glass rubix-card-hi p-4">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-sm font-medium flex items-center gap-2">
              <Volume2 className="h-4 w-4 text-primary" />
              Desktop audio
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              Capture game / system sound via loopback.
            </p>
          </div>
          <Switch
            checked={prefs.includeDesktopAudio}
            onCheckedChange={(v) => update({ includeDesktopAudio: v })}
            aria-label="Toggle desktop audio capture"
          />
        </div>
        <div className="mt-3">
          <Select
            value={prefs.desktopAudioDeviceId ?? "default"}
            onValueChange={(v) =>
              update({ desktopAudioDeviceId: v === "default" ? null : v })
            }
            disabled={!prefs.includeDesktopAudio}
          >
            <SelectTrigger className="w-full rounded-xl">
              <SelectValue placeholder="System default output" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="default">System default output</SelectItem>
              {outputs.map((o) => (
                <SelectItem key={o.deviceId || o.label} value={o.deviceId}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="rounded-2xl rubix-glass rubix-card-hi p-4">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-sm font-medium flex items-center gap-2">
              <Mic className="h-4 w-4 text-primary" />
              Microphone
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              Mixed into the clip alongside desktop audio.
            </p>
          </div>
          <Switch
            checked={prefs.includeMic}
            onCheckedChange={(v) => update({ includeMic: v })}
            aria-label="Toggle microphone capture"
          />
        </div>
        <div className="mt-3">
          <Select
            value={prefs.micDeviceId ?? "default"}
            onValueChange={(v) => update({ micDeviceId: v === "default" ? null : v })}
            disabled={!prefs.includeMic}
          >
            <SelectTrigger className="w-full rounded-xl">
              <SelectValue placeholder="System default mic" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="default">System default mic</SelectItem>
              {mics.map((m) => (
                <SelectItem key={m.deviceId || m.label} value={m.deviceId}>
                  {m.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="rounded-2xl rubix-glass rubix-card-hi p-4">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-sm font-medium flex items-center gap-2">
              <Clock className="h-4 w-4 text-primary" />
              Clip length
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              How many seconds of gameplay to save when you press your clip hotkey.
            </p>
          </div>
          <div className="flex items-center gap-1.5 text-sm font-semibold tabular-nums">
            <Film className="h-3.5 w-3.5 text-muted-foreground" />
            {prefs.durationSeconds}s
          </div>
        </div>
        <div className="mt-4">
          <Slider
            min={CLIP_DURATION_MIN}
            max={CLIP_DURATION_MAX}
            step={5}
            value={[prefs.durationSeconds]}
            onValueChange={([v]) => update({ durationSeconds: v })}
          />
          <div className="mt-1 flex justify-between text-[11px] text-muted-foreground">
            <span>{CLIP_DURATION_MIN}s</span>
            <span>{CLIP_DURATION_MAX}s</span>
          </div>
        </div>
      </div>
    </div>
  );
};
