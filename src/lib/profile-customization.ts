// Deep profile customization — types, presets, helpers.

import type React from "react";

export type AccentPreset = {
  key: string;
  name: string;
  hue: number;
  sat: number;
  light: number;
};

export const ACCENT_PRESETS: AccentPreset[] = [
  { key: "rubix", name: "Rubix", hue: 220, sat: 90, light: 60 },
  { key: "sunset", name: "Sunset", hue: 18, sat: 92, light: 60 },
  { key: "neon", name: "Neon Pink", hue: 320, sat: 95, light: 62 },
  { key: "matrix", name: "Matrix", hue: 142, sat: 70, light: 48 },
  { key: "amber", name: "Amber", hue: 38, sat: 95, light: 55 },
  { key: "violet", name: "Violet", hue: 270, sat: 85, light: 65 },
  { key: "cyan", name: "Cyan", hue: 190, sat: 90, light: 55 },
  { key: "rose", name: "Rose", hue: 350, sat: 80, light: 62 },
  { key: "lime", name: "Lime", hue: 80, sat: 85, light: 55 },
  { key: "ice", name: "Ice", hue: 200, sat: 30, light: 78 },
  { key: "blood", name: "Blood", hue: 0, sat: 80, light: 45 },
  { key: "gold", name: "Gold", hue: 45, sat: 90, light: 52 },
];

export type BannerOverlay =
  | "none"
  | "soft"
  | "vignette"
  | "noise"
  | "scanlines"
  | "aurora"
  | "prism"
  | "mesh"
  | "dots"
  | "grid"
  | "holo"
  | "sparkle";
export const BANNER_OVERLAYS: { key: BannerOverlay; name: string }[] = [
  { key: "none", name: "None" },
  { key: "soft", name: "Soft fade" },
  { key: "vignette", name: "Vignette" },
  { key: "noise", name: "Film grain" },
  { key: "scanlines", name: "Scanlines" },
  { key: "aurora", name: "Aurora glow" },
  { key: "prism", name: "Prism rays" },
  { key: "mesh", name: "Gradient mesh" },
  { key: "dots", name: "Dot matrix" },
  { key: "grid", name: "Tech grid" },
  { key: "holo", name: "Holographic" },
  { key: "sparkle", name: "Sparkle dust" },
];

export type BannerEffect = "none" | "parallax" | "kenburns" | "tilt" | "blur";
export const BANNER_EFFECTS: { key: BannerEffect; name: string }[] = [
  { key: "none", name: "Static" },
  { key: "parallax", name: "Parallax scroll" },
  { key: "kenburns", name: "Ken Burns zoom" },
  { key: "tilt", name: "Mouse tilt" },
  { key: "blur", name: "Soft blur" },
];

export type BannerHeight = "short" | "medium" | "tall" | "cinema";
export const BANNER_HEIGHTS: { key: BannerHeight; name: string }[] = [
  { key: "short", name: "Short" },
  { key: "medium", name: "Medium" },
  { key: "tall", name: "Tall" },
  { key: "cinema", name: "Cinematic" },
];

export type NameEffect =
  | "none"
  | "gradient"
  | "glow"
  | "shimmer"
  | "outline"
  | "rainbow"
  | "chrome"
  | "neon"
  | "fire"
  | "typewriter"
  | "bounce";
export const NAME_EFFECTS: { key: NameEffect; name: string }[] = [
  { key: "none", name: "None" },
  { key: "gradient", name: "Accent gradient" },
  { key: "glow", name: "Soft glow" },
  { key: "shimmer", name: "Shimmer" },
  { key: "outline", name: "Outline" },
  { key: "rainbow", name: "Rainbow" },
  { key: "chrome", name: "Chrome" },
  { key: "neon", name: "Neon flicker" },
  { key: "fire", name: "Fire" },
  { key: "typewriter", name: "Typewriter caret" },
  { key: "bounce", name: "Bounce in" },
];

export type AvatarFrame =
  | "none"
  | "ring"
  | "glow"
  | "double"
  | "dashed"
  | "pixel"
  | "rotate"
  | "pulse"
  | "gem";
export const AVATAR_FRAMES: { key: AvatarFrame; name: string }[] = [
  { key: "none", name: "Plain" },
  { key: "ring", name: "Accent ring" },
  { key: "glow", name: "Glow" },
  { key: "double", name: "Double ring" },
  { key: "dashed", name: "Dashed" },
  { key: "pixel", name: "Pixel border" },
  { key: "rotate", name: "Rotating gradient" },
  { key: "pulse", name: "Pulse" },
  { key: "gem", name: "Gem facets" },
];

export type AvatarShape = "circle" | "squircle" | "hex" | "square";
export const AVATAR_SHAPES: { key: AvatarShape; name: string }[] = [
  { key: "circle", name: "Circle" },
  { key: "squircle", name: "Squircle" },
  { key: "hex", name: "Hexagon" },
  { key: "square", name: "Square" },
];

export type CardStyle = "glass" | "solid" | "outline" | "gradient" | "neon" | "paper";
export const CARD_STYLES: { key: CardStyle; name: string }[] = [
  { key: "glass", name: "Glass" },
  { key: "solid", name: "Solid" },
  { key: "outline", name: "Outline" },
  { key: "gradient", name: "Gradient" },
  { key: "neon", name: "Neon" },
  { key: "paper", name: "Paper" },
];

export type FontPair = "default" | "serif" | "mono" | "display" | "round" | "techno";
export const FONT_PAIRS: { key: FontPair; name: string }[] = [
  { key: "default", name: "Default sans" },
  { key: "serif", name: "Editorial serif" },
  { key: "mono", name: "Mono terminal" },
  { key: "display", name: "Display bold" },
  { key: "round", name: "Friendly round" },
  { key: "techno", name: "Techno wide" },
];

export type CornerRadius = "sharp" | "soft" | "round" | "pill";
export const CORNER_RADII: { key: CornerRadius; name: string; rem: number }[] = [
  { key: "sharp", name: "Sharp", rem: 0.25 },
  { key: "soft", name: "Soft", rem: 0.75 },
  { key: "round", name: "Round", rem: 1.25 },
  { key: "pill", name: "Pill", rem: 2 },
];

export type Density = "airy" | "comfortable" | "compact";
export const DENSITIES: { key: Density; name: string }[] = [
  { key: "airy", name: "Airy" },
  { key: "comfortable", name: "Comfortable" },
  { key: "compact", name: "Compact" },
];

export type CursorStyle = "default" | "accent" | "trail" | "sparkle";
export const CURSOR_STYLES: { key: CursorStyle; name: string }[] = [
  { key: "default", name: "Default" },
  { key: "accent", name: "Accent ring" },
  { key: "trail", name: "Glow trail" },
  { key: "sparkle", name: "Sparkle" },
];

export type ClickEffect = "none" | "ripple" | "burst" | "hearts" | "stars";
export const CLICK_EFFECTS: { key: ClickEffect; name: string }[] = [
  { key: "none", name: "None" },
  { key: "ripple", name: "Ripple" },
  { key: "burst", name: "Color burst" },
  { key: "hearts", name: "Hearts" },
  { key: "stars", name: "Stars" },
];

export type MotionLevel = "full" | "reduced" | "none";
export const MOTION_LEVELS: { key: MotionLevel; name: string }[] = [
  { key: "full", name: "Full motion" },
  { key: "reduced", name: "Reduced" },
  { key: "none", name: "None" },
];

export type SectionKey = "about" | "status" | "socials" | "fields" | "quote" | "badges";
export const ALL_SECTIONS: { key: SectionKey; name: string }[] = [
  { key: "about", name: "About / Bio" },
  { key: "status", name: "Status" },
  { key: "socials", name: "Social links" },
  { key: "fields", name: "About-me fields" },
  { key: "quote", name: "Pinned quote" },
  { key: "badges", name: "Badges" },
];

export type CustomField = { label: string; value: string };

export type PinnedQuote = {
  text: string;
  attribution?: string;
};

export type ProfileCustomization = {
  // Color
  accent?: string;
  customAccentHex?: string | null; // overrides preset if set
  secondaryAccentHex?: string | null; // for dual-color gradients
  // Banner
  bannerOverlay?: BannerOverlay;
  bannerEffect?: BannerEffect;
  bannerHeight?: BannerHeight;
  bannerTintOpacity?: number; // 0..1
  // Name
  nameEffect?: NameEffect;
  nameWeight?: number; // 400..900
  // Avatar
  avatarFrame?: AvatarFrame;
  avatarShape?: AvatarShape;
  // Cards
  cardStyle?: CardStyle;
  cornerRadius?: CornerRadius;
  density?: Density;
  // Typography
  fontPair?: FontPair;
  // Behavior
  cursorStyle?: CursorStyle;
  clickEffect?: ClickEffect;
  motionLevel?: MotionLevel;
  // Layout
  showcaseSocials?: boolean;
  compactLayout?: boolean;
  sectionOrder?: SectionKey[];
  hiddenSections?: SectionKey[];
  // Content
  customFields?: CustomField[];
  pinnedQuote?: PinnedQuote | null;
};

export const DEFAULT_CUSTOMIZATION: Required<
  Omit<ProfileCustomization, "customAccentHex" | "secondaryAccentHex" | "pinnedQuote">
> & {
  customAccentHex: string | null;
  secondaryAccentHex: string | null;
  pinnedQuote: PinnedQuote | null;
} = {
  accent: "rubix",
  customAccentHex: null,
  secondaryAccentHex: null,
  bannerOverlay: "soft",
  bannerEffect: "none",
  bannerHeight: "medium",
  bannerTintOpacity: 0.4,
  nameEffect: "none",
  nameWeight: 700,
  avatarFrame: "ring",
  avatarShape: "circle",
  cardStyle: "glass",
  cornerRadius: "soft",
  density: "comfortable",
  fontPair: "default",
  cursorStyle: "default",
  clickEffect: "none",
  motionLevel: "full",
  showcaseSocials: true,
  compactLayout: false,
  sectionOrder: ["quote", "about", "fields", "socials", "badges"],
  hiddenSections: [],
  customFields: [],
  pinnedQuote: null,
};

export type ResolvedCustomization = typeof DEFAULT_CUSTOMIZATION;

export const resolveCustomization = (raw: unknown): ResolvedCustomization => {
  const c = (raw && typeof raw === "object" ? raw : {}) as ProfileCustomization;
  return {
    ...DEFAULT_CUSTOMIZATION,
    ...c,
    sectionOrder: Array.isArray(c.sectionOrder) && c.sectionOrder.length
      ? c.sectionOrder
      : DEFAULT_CUSTOMIZATION.sectionOrder,
    hiddenSections: Array.isArray(c.hiddenSections) ? c.hiddenSections : [],
    customFields: Array.isArray(c.customFields) ? c.customFields : [],
    pinnedQuote: c.pinnedQuote ?? null,
  };
};

export const getAccent = (key: string): AccentPreset =>
  ACCENT_PRESETS.find((p) => p.key === key) ?? ACCENT_PRESETS[0];

// hex -> "h s% l%"
const hexToHsl = (hex: string): string | null => {
  const m = hex.replace("#", "").trim();
  if (!/^([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(m)) return null;
  const full = m.length === 3 ? m.split("").map((c) => c + c).join("") : m;
  const r = parseInt(full.slice(0, 2), 16) / 255;
  const g = parseInt(full.slice(2, 4), 16) / 255;
  const b = parseInt(full.slice(4, 6), 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  let h = 0;
  let s = 0;
  const l = (max + min) / 2;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = (g - b) / d + (g < b ? 6 : 0); break;
      case g: h = (b - r) / d + 2; break;
      case b: h = (r - g) / d + 4; break;
    }
    h *= 60;
  }
  return `${Math.round(h)} ${Math.round(s * 100)}% ${Math.round(l * 100)}%`;
};

export const accentVarStyle = (
  presetKey: string,
  customHex?: string | null,
  secondaryHex?: string | null,
): React.CSSProperties => {
  let primary: string;
  if (customHex) {
    primary = hexToHsl(customHex) ?? "";
  }
  if (!customHex || !primary!) {
    const a = getAccent(presetKey);
    primary = `${a.hue} ${a.sat}% ${a.light}%`;
  }
  const secondary = secondaryHex ? hexToHsl(secondaryHex) : null;
  const style: Record<string, string> = {
    "--profile-accent": primary,
  };
  if (secondary) style["--profile-accent-2"] = secondary;
  else style["--profile-accent-2"] = primary;
  return style as React.CSSProperties;
};

export const fontFamilyFor = (pair: FontPair): string => {
  switch (pair) {
    case "serif": return "'Iowan Old Style','Apple Garamond','Georgia',serif";
    case "mono": return "'JetBrains Mono','SFMono-Regular',ui-monospace,monospace";
    case "display": return "'Bebas Neue','Impact',system-ui,sans-serif";
    case "round": return "'Nunito','Quicksand',ui-rounded,system-ui,sans-serif";
    case "techno": return "'Orbitron','Rajdhani',system-ui,sans-serif";
    default: return "inherit";
  }
};

export const radiusRem = (r: CornerRadius): number =>
  CORNER_RADII.find((c) => c.key === r)?.rem ?? 0.75;

export const densityPad = (d: Density): { gap: string; pad: string } => {
  switch (d) {
    case "airy": return { gap: "1.75rem", pad: "1.5rem" };
    case "compact": return { gap: "0.75rem", pad: "0.75rem" };
    default: return { gap: "1.25rem", pad: "1.1rem" };
  }
};

export const bannerHeightClass = (h: BannerHeight, compact: boolean): string => {
  if (compact) return "h-40 md:h-48";
  switch (h) {
    case "short": return "h-40 md:h-48";
    case "tall": return "h-72 md:h-96";
    case "cinema": return "h-80 md:h-[28rem]";
    default: return "h-56 md:h-72";
  }
};
