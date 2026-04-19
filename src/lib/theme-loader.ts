import { THEME_STORAGE_KEY, type RubixTheme } from "./theme-schema";

const FONT_LINK_ID = "rubix-theme-font";
const BG_STYLE_ID = "rubix-theme-bg";

export function applyTheme(theme: RubixTheme) {
  const root = document.documentElement;
  const c = theme.colors;

  // Core HSL tokens (values are stored as "H S% L%" strings).
  root.style.setProperty("--background", c.background);
  root.style.setProperty("--foreground", c.text);
  root.style.setProperty("--card", c.surface);
  root.style.setProperty("--card-foreground", c.text);
  root.style.setProperty("--popover", c.surface);
  root.style.setProperty("--popover-foreground", c.text);
  root.style.setProperty("--primary", c.primary);
  root.style.setProperty("--primary-foreground", "0 0% 100%");
  root.style.setProperty("--secondary", c.surface);
  root.style.setProperty("--secondary-foreground", c.text);
  root.style.setProperty("--muted", c.surface);
  root.style.setProperty("--muted-foreground", c.mutedText);
  root.style.setProperty("--accent", c.accent);
  root.style.setProperty("--accent-foreground", "0 0% 100%");
  root.style.setProperty("--border", c.border);
  root.style.setProperty("--input", c.border);
  root.style.setProperty("--ring", c.primary);

  // Layout / radius
  root.style.setProperty("--radius", `${theme.layout.radius}rem`);

  // Gradient + glow
  const g = theme.primaryGradient;
  const gradient = g
    ? `linear-gradient(${g.angle}deg, hsl(${g.from}), hsl(${g.to}))`
    : `linear-gradient(135deg, hsl(${c.primary}), hsl(${c.accent}))`;
  root.style.setProperty("--gradient-primary", gradient);
  root.style.setProperty(
    "--glow-primary",
    `0 0 ${Math.round(20 + theme.effects.glow * 60)}px hsl(${c.primary} / ${0.2 + theme.effects.glow * 0.4})`
  );

  // Typography
  root.style.setProperty("--font-family", theme.typography.fontFamily);
  document.body.style.fontFamily = theme.typography.fontFamily;
  document.body.style.letterSpacing = `${theme.typography.letterSpacing}px`;

  loadGoogleFont(theme.typography.fontFamily);

  // Background layer
  applyBackground(theme.background);
}

function loadGoogleFont(family: string) {
  const systemFonts = [
    "system-ui",
    "sans-serif",
    "serif",
    "monospace",
    "Arial",
    "Helvetica",
    "Times New Roman",
    "Georgia",
  ];
  const primary = family.split(",")[0].replace(/['"]/g, "").trim();
  if (!primary || systemFonts.some((f) => primary.toLowerCase() === f.toLowerCase())) {
    document.getElementById(FONT_LINK_ID)?.remove();
    return;
  }
  const href = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(
    primary
  )}:wght@400;500;600;700&display=swap`;
  let link = document.getElementById(FONT_LINK_ID) as HTMLLinkElement | null;
  if (!link) {
    link = document.createElement("link");
    link.id = FONT_LINK_ID;
    link.rel = "stylesheet";
    document.head.appendChild(link);
  }
  if (link.href !== href) link.href = href;
}

function applyBackground(bg: RubixTheme["background"]) {
  let style = document.getElementById(BG_STYLE_ID) as HTMLStyleElement | null;
  if (!style) {
    style = document.createElement("style");
    style.id = BG_STYLE_ID;
    document.head.appendChild(style);
  }
  let css = "";
  if (bg.type === "solid") {
    css = `body{background-color: hsl(${bg.value});}`;
  } else if (bg.type === "gradient" || bg.type === "mesh") {
    css = `body{background: ${bg.value}; background-attachment: fixed;}`;
  } else if (bg.type === "image") {
    css = `body{background-image: url("${bg.value}"); background-size: cover; background-position: center; background-attachment: fixed;}`;
  }
  style.textContent = css;
}

export function clearTheme() {
  const root = document.documentElement;
  const props = [
    "--background", "--foreground", "--card", "--card-foreground",
    "--popover", "--popover-foreground", "--primary", "--primary-foreground",
    "--secondary", "--secondary-foreground", "--muted", "--muted-foreground",
    "--accent", "--accent-foreground", "--border", "--input", "--ring",
    "--radius", "--gradient-primary", "--glow-primary", "--font-family",
  ];
  props.forEach((p) => root.style.removeProperty(p));
  document.body.style.fontFamily = "";
  document.body.style.letterSpacing = "";
  document.getElementById(FONT_LINK_ID)?.remove();
  document.getElementById(BG_STYLE_ID)?.remove();
  localStorage.removeItem(THEME_STORAGE_KEY);
}

export function saveTheme(theme: RubixTheme) {
  localStorage.setItem(THEME_STORAGE_KEY, JSON.stringify(theme));
}

export function loadStoredTheme(): RubixTheme | null {
  try {
    const raw = localStorage.getItem(THEME_STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as RubixTheme;
  } catch {
    return null;
  }
}

export function parseThemeFile(text: string): RubixTheme {
  const data = JSON.parse(text);
  if (!data || typeof data !== "object" || !data.colors || data.version !== 1) {
    throw new Error("Invalid .rubixtheme file");
  }
  return data as RubixTheme;
}

export async function importThemeFromFile(file: File): Promise<RubixTheme> {
  const text = await file.text();
  return parseThemeFile(text);
}
