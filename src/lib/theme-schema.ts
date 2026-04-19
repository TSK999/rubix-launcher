// Shared schema with RUBIX Theme Studio. Keep in sync.
export type RubixTheme = {
  name: string;
  version: 1;
  colors: {
    background: string; // HSL string like "0 0% 4%"
    surface: string;
    primary: string;
    accent: string;
    text: string;
    mutedText: string;
    border: string;
  };
  primaryGradient?: { from: string; to: string; angle: number };
  typography: {
    fontFamily: string;
    headingSize: number;
    bodySize: number;
    weight: number;
    letterSpacing: number;
  };
  layout: {
    radius: number; // rem
    spacing: number;
    cardAspect: "portrait" | "landscape" | "square";
    sidebarWidth: number; // px
  };
  effects: {
    glow: number; // 0-1
    shadow: number; // 0-1
    blur: number; // px
    hoverSpeed: number; // ms
  };
  background: {
    type: "solid" | "gradient" | "image" | "mesh";
    value: string; // hsl, css gradient, base64 data URL, or mesh preset id
  };
};

export const THEME_STORAGE_KEY = "rubix.theme.v1";
export const THEME_FILE_EXT = ".rubixtheme";
