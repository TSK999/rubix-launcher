// Keybind management for global hotkeys (Electron globalShortcut).
// Stored in localStorage; applied via window.rubix.hotkeys.set.

export type HotkeyAction = "screenshot" | "clip" | "toggleMute" | "togglePresence";

export type HotkeyDef = {
  id: HotkeyAction;
  label: string;
  description: string;
  default: string;
  global?: boolean; // true = Electron global shortcut
};

export const HOTKEYS: HotkeyDef[] = [
  {
    id: "screenshot",
    label: "Capture screenshot",
    description: "Save a full-screen screenshot to the active game.",
    default: "F12",
    global: true,
  },
  {
    id: "clip",
    label: "Save instant replay",
    description: "Save the last 30 seconds of gameplay.",
    default: "F9",
    global: true,
  },
  {
    id: "toggleMute",
    label: "Toggle mic mute",
    description: "Mute or unmute yourself in voice chat.",
    default: "F7",
    global: true,
  },
  {
    id: "togglePresence",
    label: "Toggle Do Not Disturb",
    description: "Quickly flip between Online and Do Not Disturb.",
    default: "F8",
    global: true,
  },
];

const STORAGE_KEY = "rubix:keybinds:v1";

export type KeybindMap = Record<HotkeyAction, string>;

export const defaultKeybinds = (): KeybindMap => {
  const out = {} as KeybindMap;
  for (const h of HOTKEYS) out[h.id] = h.default;
  return out;
};

export const loadKeybinds = (): KeybindMap => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultKeybinds();
    const parsed = JSON.parse(raw) as Partial<KeybindMap>;
    return { ...defaultKeybinds(), ...parsed };
  } catch {
    return defaultKeybinds();
  }
};

export const saveKeybinds = (map: KeybindMap) => {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(map));
  void applyKeybinds(map);
  window.dispatchEvent(new CustomEvent("rubix:keybinds-changed", { detail: map }));
};

export const applyKeybinds = async (map: KeybindMap = loadKeybinds()) => {
  const api = (window as any).rubix?.hotkeys;
  if (!api?.set) return { ok: false, error: "not-electron" };
  try {
    return await api.set(map);
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
};

// Convert a KeyboardEvent to an Electron accelerator string.
export const eventToAccelerator = (e: KeyboardEvent): string | null => {
  const parts: string[] = [];
  if (e.ctrlKey) parts.push("CmdOrCtrl");
  if (e.altKey) parts.push("Alt");
  if (e.shiftKey) parts.push("Shift");
  if (e.metaKey && !e.ctrlKey) parts.push("Super");

  const k = e.key;
  // Ignore pure modifier presses
  if (["Control", "Shift", "Alt", "Meta", "OS"].includes(k)) return null;

  let main = k;
  if (k === " ") main = "Space";
  else if (k.length === 1) main = k.toUpperCase();
  else if (/^F\d{1,2}$/.test(k)) main = k;
  else if (k === "ArrowUp") main = "Up";
  else if (k === "ArrowDown") main = "Down";
  else if (k === "ArrowLeft") main = "Left";
  else if (k === "ArrowRight") main = "Right";
  else if (k === "Escape") main = "Esc";

  parts.push(main);
  return parts.join("+");
};

export const prettyAccelerator = (acc: string) =>
  acc
    .split("+")
    .map((p) => (p === "CmdOrCtrl" ? "Ctrl" : p))
    .join(" + ");
