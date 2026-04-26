// Deep profile customization types and presets.

export type AccentPreset = {
  key: string;
  name: string;
  // HSL values WITHOUT hsl() wrapper, matching index.css convention
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
];

export type BannerOverlay = "none" | "soft" | "vignette" | "noise" | "scanlines" | "aurora";
export const BANNER_OVERLAYS: { key: BannerOverlay; name: string }[] = [
  { key: "none", name: "None" },
  { key: "soft", name: "Soft fade" },
  { key: "vignette", name: "Vignette" },
  { key: "noise", name: "Film grain" },
  { key: "scanlines", name: "Scanlines" },
  { key: "aurora", name: "Aurora glow" },
];

export type NameEffect = "none" | "gradient" | "glow" | "shimmer" | "outline";
export const NAME_EFFECTS: { key: NameEffect; name: string }[] = [
  { key: "none", name: "None" },
  { key: "gradient", name: "Accent gradient" },
  { key: "glow", name: "Soft glow" },
  { key: "shimmer", name: "Shimmer" },
  { key: "outline", name: "Outline" },
];

export type AvatarFrame = "none" | "ring" | "glow" | "double" | "dashed";
export const AVATAR_FRAMES: { key: AvatarFrame; name: string }[] = [
  { key: "none", name: "Plain" },
  { key: "ring", name: "Accent ring" },
  { key: "glow", name: "Glow" },
  { key: "double", name: "Double ring" },
  { key: "dashed", name: "Dashed" },
];

export type CardStyle = "glass" | "solid" | "outline" | "gradient";
export const CARD_STYLES: { key: CardStyle; name: string }[] = [
  { key: "glass", name: "Glass" },
  { key: "solid", name: "Solid" },
  { key: "outline", name: "Outline" },
  { key: "gradient", name: "Gradient" },
];

export type FontPair = "default" | "serif" | "mono" | "display";
export const FONT_PAIRS: { key: FontPair; name: string }[] = [
  { key: "default", name: "Default sans" },
  { key: "serif", name: "Editorial serif" },
  { key: "mono", name: "Mono terminal" },
  { key: "display", name: "Display bold" },
];

export type ProfileCustomization = {
  accent?: string; // AccentPreset key
  bannerOverlay?: BannerOverlay;
  nameEffect?: NameEffect;
  avatarFrame?: AvatarFrame;
  cardStyle?: CardStyle;
  fontPair?: FontPair;
  showcaseSocials?: boolean;
  compactLayout?: boolean;
};

export const DEFAULT_CUSTOMIZATION: Required<ProfileCustomization> = {
  accent: "rubix",
  bannerOverlay: "soft",
  nameEffect: "none",
  avatarFrame: "ring",
  cardStyle: "glass",
  fontPair: "default",
  showcaseSocials: true,
  compactLayout: false,
};

export const resolveCustomization = (
  raw: unknown,
): Required<ProfileCustomization> => {
  const c = (raw && typeof raw === "object" ? raw : {}) as ProfileCustomization;
  return { ...DEFAULT_CUSTOMIZATION, ...c };
};

export const getAccent = (key: string): AccentPreset =>
  ACCENT_PRESETS.find((p) => p.key === key) ?? ACCENT_PRESETS[0];

export const accentVarStyle = (key: string): React.CSSProperties => {
  const a = getAccent(key);
  return {
    // expose --profile-accent for child styles
    ["--profile-accent" as never]: `${a.hue} ${a.sat}% ${a.light}%`,
  } as React.CSSProperties;
};

export const fontFamilyFor = (pair: FontPair): string => {
  switch (pair) {
    case "serif":
      return "'Iowan Old Style', 'Apple Garamond', 'Georgia', serif";
    case "mono":
      return "'JetBrains Mono', 'SFMono-Regular', ui-monospace, monospace";
    case "display":
      return "'Bebas Neue', 'Impact', system-ui, sans-serif";
    default:
      return "inherit";
  }
};
