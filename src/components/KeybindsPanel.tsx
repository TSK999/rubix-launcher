import { useEffect, useState } from "react";
import { Keyboard, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  HOTKEYS,
  defaultKeybinds,
  eventToAccelerator,
  loadKeybinds,
  prettyAccelerator,
  saveKeybinds,
  type HotkeyAction,
  type KeybindMap,
} from "@/lib/keybinds";
import { cn } from "@/lib/utils";

export const KeybindsPanel = () => {
  const [map, setMap] = useState<KeybindMap>(() => loadKeybinds());
  const [recording, setRecording] = useState<HotkeyAction | null>(null);

  useEffect(() => {
    if (!recording) return;
    const onKey = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (e.key === "Escape") {
        setRecording(null);
        return;
      }
      const acc = eventToAccelerator(e);
      if (!acc) return;
      const conflict = (Object.entries(map) as [HotkeyAction, string][]).find(
        ([id, v]) => id !== recording && v === acc,
      );
      if (conflict) {
        const other = HOTKEYS.find((h) => h.id === conflict[0]);
        toast.error("Shortcut already in use", {
          description: `${prettyAccelerator(acc)} is bound to "${other?.label ?? conflict[0]}". Pick another combination.`,
        });
        setRecording(null);
        return;
      }
      const next = { ...map, [recording]: acc };
      setMap(next);
      saveKeybinds(next);
      setRecording(null);
      toast.success("Keybind updated", { description: prettyAccelerator(acc) });
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [recording, map]);

  const reset = () => {
    const d = defaultKeybinds();
    setMap(d);
    saveKeybinds(d);
    toast("Keybinds reset to defaults");
  };

  const isElectron = typeof window !== "undefined" && (window as any).rubix?.isElectron;

  return (
    <div className="space-y-3">
      <div className="rounded-2xl rubix-glass rubix-card-hi p-4">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-sm font-medium">
            <Keyboard className="h-4 w-4 text-primary" />
            Global keybinds
          </div>
          <Button variant="ghost" size="sm" className="rounded-xl" onClick={reset}>
            <RotateCcw className="mr-1.5 h-3.5 w-3.5" />
            Reset
          </Button>
        </div>
        {!isElectron && (
          <p className="mt-2 text-[11px] text-muted-foreground">
            Global hotkeys only work in the desktop app. Bindings will save and apply once you run RUBIX Launcher.
          </p>
        )}
        <div className="mt-3 divide-y divide-border/60">
          {HOTKEYS.map((h) => {
            const value = map[h.id];
            const active = recording === h.id;
            return (
              <div key={h.id} className="flex items-center justify-between gap-3 py-2.5">
                <div className="min-w-0">
                  <p className="text-sm font-medium">{h.label}</p>
                  <p className="mt-0.5 text-[11px] text-muted-foreground">{h.description}</p>
                </div>
                <button
                  type="button"
                  onClick={() => setRecording(active ? null : h.id)}
                  className={cn(
                    "min-w-[120px] rounded-lg border border-border bg-secondary/60 px-3 py-1.5 font-mono text-xs transition-colors hover:bg-secondary",
                    active && "border-primary bg-primary/15 text-primary animate-pulse",
                  )}
                >
                  {active ? "Press any key…" : prettyAccelerator(value)}
                </button>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
