import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";

type Ctx = {
  enabled: boolean;
  setEnabled: (v: boolean) => void;
  toggle: () => void;
  controllerConnected: boolean;
};

const ControllerContext = createContext<Ctx | null>(null);
const STORAGE_KEY = "rubix:controller-mode";

export const ControllerModeProvider = ({ children }: { children: ReactNode }) => {
  const [enabled, setEnabledState] = useState<boolean>(() => {
    try {
      return localStorage.getItem(STORAGE_KEY) === "1";
    } catch {
      return false;
    }
  });
  const [controllerConnected, setControllerConnected] = useState(false);

  const setEnabled = useCallback((v: boolean) => {
    setEnabledState(v);
    try {
      localStorage.setItem(STORAGE_KEY, v ? "1" : "0");
    } catch {}
  }, []);

  const toggle = useCallback(() => setEnabled(!enabled), [enabled, setEnabled]);

  // Toggle body class for controller-friendly styles
  useEffect(() => {
    const cls = "controller-mode";
    if (enabled) document.body.classList.add(cls);
    else document.body.classList.remove(cls);
    return () => document.body.classList.remove(cls);
  }, [enabled]);

  // Track gamepad connect/disconnect (always polling so the badge stays accurate
  // even when controller-mode is off — the Gamepad API only reports devices
  // after the user presses a button while the page is focused).
  useEffect(() => {
    const onConnect = () => setControllerConnected(true);
    const onDisconnect = () => {
      const pads = navigator.getGamepads?.() ?? [];
      setControllerConnected(Array.from(pads).some((p) => p));
    };
    window.addEventListener("gamepadconnected", onConnect);
    window.addEventListener("gamepaddisconnected", onDisconnect);

    // Light poll — getGamepads() may need to be called repeatedly before the
    // browser surfaces a connected pad (especially in Chromium).
    const interval = window.setInterval(() => {
      const pads = navigator.getGamepads?.() ?? [];
      const any = Array.from(pads).some((p) => p);
      setControllerConnected((prev) => (prev !== any ? any : prev));
    }, 1000);

    return () => {
      window.removeEventListener("gamepadconnected", onConnect);
      window.removeEventListener("gamepaddisconnected", onDisconnect);
      window.clearInterval(interval);
    };
  }, []);

  // Gamepad polling — only when controller mode is enabled
  useEffect(() => {
    if (!enabled) return;

    const DEADZONE = 0.5;
    const REPEAT_DELAY = 380;
    const REPEAT_RATE = 110;

    type DirState = { active: boolean; nextAt: number };
    const dirs: Record<"up" | "down" | "left" | "right", DirState> = {
      up: { active: false, nextAt: 0 },
      down: { active: false, nextAt: 0 },
      left: { active: false, nextAt: 0 },
      right: { active: false, nextAt: 0 },
    };
    const buttonsPrev: boolean[] = [];

    const pressKey = (key: string) => {
      const el = (document.activeElement as HTMLElement | null) ?? document.body;
      el.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true }));
      el.dispatchEvent(new KeyboardEvent("keyup", { key, bubbles: true, cancelable: true }));
    };

    const focusableSelector =
      'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

    const moveFocus = (dir: "up" | "down" | "left" | "right") => {
      const active = document.activeElement as HTMLElement | null;
      const all = Array.from(document.querySelectorAll<HTMLElement>(focusableSelector)).filter(
        (el) => el.offsetParent !== null || el === document.activeElement
      );
      if (all.length === 0) return;

      // If nothing focused, focus the first
      if (!active || active === document.body) {
        all[0].focus();
        return;
      }

      const aRect = active.getBoundingClientRect();
      const ax = aRect.left + aRect.width / 2;
      const ay = aRect.top + aRect.height / 2;

      let best: HTMLElement | null = null;
      let bestScore = Infinity;

      for (const el of all) {
        if (el === active) continue;
        const r = el.getBoundingClientRect();
        const x = r.left + r.width / 2;
        const y = r.top + r.height / 2;
        const dx = x - ax;
        const dy = y - ay;
        let primary = 0;
        let secondary = 0;
        if (dir === "up") {
          if (dy >= -2) continue;
          primary = -dy;
          secondary = Math.abs(dx);
        } else if (dir === "down") {
          if (dy <= 2) continue;
          primary = dy;
          secondary = Math.abs(dx);
        } else if (dir === "left") {
          if (dx >= -2) continue;
          primary = -dx;
          secondary = Math.abs(dy);
        } else {
          if (dx <= 2) continue;
          primary = dx;
          secondary = Math.abs(dy);
        }
        const score = primary + secondary * 2;
        if (score < bestScore) {
          bestScore = score;
          best = el;
        }
      }

      if (best) {
        best.focus();
        best.scrollIntoView({ block: "nearest", inline: "nearest", behavior: "smooth" });
      } else {
        // fallback to arrow key for native components (selects, sliders, etc.)
        pressKey(
          dir === "up" ? "ArrowUp" : dir === "down" ? "ArrowDown" : dir === "left" ? "ArrowLeft" : "ArrowRight"
        );
      }
    };

    const handleDir = (
      dir: "up" | "down" | "left" | "right",
      pressed: boolean,
      now: number
    ) => {
      const s = dirs[dir];
      if (pressed) {
        if (!s.active) {
          s.active = true;
          s.nextAt = now + REPEAT_DELAY;
          moveFocus(dir);
        } else if (now >= s.nextAt) {
          s.nextAt = now + REPEAT_RATE;
          moveFocus(dir);
        }
      } else {
        s.active = false;
        s.nextAt = 0;
      }
    };

    const handleButton = (idx: number, pressed: boolean) => {
      const wasPressed = buttonsPrev[idx] === true;
      buttonsPrev[idx] = pressed;
      if (pressed && !wasPressed) {
        // Standard mapping: 0=A, 1=B, 9=Start
        if (idx === 0) {
          const el = document.activeElement as HTMLElement | null;
          if (el && el !== document.body) el.click();
        } else if (idx === 1) {
          pressKey("Escape");
        } else if (idx === 9) {
          // Start button: nothing global yet
        }
      }
    };

    let raf = 0;
    const loop = () => {
      const now = performance.now();
      const pads = navigator.getGamepads?.() ?? [];
      for (const pad of pads) {
        if (!pad) continue;

        const ax0 = pad.axes[0] ?? 0;
        const ax1 = pad.axes[1] ?? 0;
        const dpadUp = pad.buttons[12]?.pressed ?? false;
        const dpadDown = pad.buttons[13]?.pressed ?? false;
        const dpadLeft = pad.buttons[14]?.pressed ?? false;
        const dpadRight = pad.buttons[15]?.pressed ?? false;

        handleDir("up", dpadUp || ax1 < -DEADZONE, now);
        handleDir("down", dpadDown || ax1 > DEADZONE, now);
        handleDir("left", dpadLeft || ax0 < -DEADZONE, now);
        handleDir("right", dpadRight || ax0 > DEADZONE, now);

        for (let i = 0; i < pad.buttons.length; i++) {
          handleButton(i, pad.buttons[i]?.pressed ?? false);
        }
        break; // only first connected pad
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [enabled]);

  return (
    <ControllerContext.Provider value={{ enabled, setEnabled, toggle, controllerConnected }}>
      {children}
    </ControllerContext.Provider>
  );
};

export const useControllerMode = () => {
  const ctx = useContext(ControllerContext);
  if (!ctx) throw new Error("useControllerMode must be used within ControllerModeProvider");
  return ctx;
};
