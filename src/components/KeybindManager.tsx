import { useEffect } from "react";
import { toast } from "sonner";
import { applyKeybinds, loadKeybinds } from "@/lib/keybinds";
import { callController } from "@/lib/call-controller";

// Mounts once. Pushes saved keybinds to Electron and wires action handlers
// (toggleMute, togglePresence). screenshot/clip are handled by their own
// dedicated managers which listen to their own IPC channels.
export const KeybindManager = () => {
  useEffect(() => {
    void applyKeybinds(loadKeybinds());

    const off = (window as any).rubix?.hotkeys?.onFired?.((data: { action: string }) => {
      switch (data.action) {
        case "toggleMute": {
          const state = callController.getState();
          if (state.status === "idle") {
            toast("Not in a voice call");
            return;
          }
          const muted = callController.toggleMute?.();
          toast(muted ? "Microphone muted" : "Microphone unmuted");
          break;
        }
        case "togglePresence": {
          window.dispatchEvent(new CustomEvent("rubix:toggle-dnd"));
          toast("Presence toggled");
          break;
        }
        default:
          break;
      }
    });

    const onChange = () => void applyKeybinds(loadKeybinds());
    window.addEventListener("rubix:keybinds-changed", onChange);

    return () => {
      off?.();
      window.removeEventListener("rubix:keybinds-changed", onChange);
    };
  }, []);
  return null;
};
