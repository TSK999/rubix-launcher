import { Github, Globe, Instagram, Twitch, Youtube } from "lucide-react";
import type { ComponentType } from "react";

type IconComponent = ComponentType<{ className?: string }>;

export type SocialKey =
  | "youtube"
  | "twitter"
  | "instagram"
  | "tiktok"
  | "twitch"
  | "github"
  | "discord"
  | "website";

export type Socials = Partial<Record<SocialKey, string>>;

type SocialMeta = {
  key: SocialKey;
  label: string;
  placeholder: string;
  icon: IconComponent;
  // Build a URL from the raw user input (handle or full URL)
  toUrl: (raw: string) => string | null;
  // For pure-handle services, what to show as a label
  display: (raw: string) => string;
};

const stripAt = (s: string) => s.trim().replace(/^@+/, "");
const isUrl = (s: string) => /^https?:\/\//i.test(s.trim());

export const SOCIALS: SocialMeta[] = [
  {
    key: "youtube",
    label: "YouTube",
    placeholder: "@channel or full URL",
    icon: Youtube,
    toUrl: (raw) => {
      const v = raw.trim();
      if (!v) return null;
      if (isUrl(v)) return v;
      return `https://youtube.com/@${stripAt(v)}`;
    },
    display: (raw) => (isUrl(raw) ? raw : `@${stripAt(raw)}`),
  },
  {
    key: "twitter",
    label: "X / Twitter",
    placeholder: "@handle",
    icon: XIcon,
    toUrl: (raw) => {
      const v = raw.trim();
      if (!v) return null;
      if (isUrl(v)) return v;
      return `https://x.com/${stripAt(v)}`;
    },
    display: (raw) => (isUrl(raw) ? raw : `@${stripAt(raw)}`),
  },
  {
    key: "instagram",
    label: "Instagram",
    placeholder: "@handle",
    icon: Instagram,
    toUrl: (raw) => {
      const v = raw.trim();
      if (!v) return null;
      if (isUrl(v)) return v;
      return `https://instagram.com/${stripAt(v)}`;
    },
    display: (raw) => (isUrl(raw) ? raw : `@${stripAt(raw)}`),
  },
  {
    key: "tiktok",
    label: "TikTok",
    placeholder: "@handle",
    icon: TikTokIcon,
    toUrl: (raw) => {
      const v = raw.trim();
      if (!v) return null;
      if (isUrl(v)) return v;
      return `https://tiktok.com/@${stripAt(v)}`;
    },
    display: (raw) => (isUrl(raw) ? raw : `@${stripAt(raw)}`),
  },
  {
    key: "twitch",
    label: "Twitch",
    placeholder: "username",
    icon: Twitch,
    toUrl: (raw) => {
      const v = raw.trim();
      if (!v) return null;
      if (isUrl(v)) return v;
      return `https://twitch.tv/${stripAt(v)}`;
    },
    display: (raw) => (isUrl(raw) ? raw : stripAt(raw)),
  },
  {
    key: "github",
    label: "GitHub",
    placeholder: "username",
    icon: Github,
    toUrl: (raw) => {
      const v = raw.trim();
      if (!v) return null;
      if (isUrl(v)) return v;
      return `https://github.com/${stripAt(v)}`;
    },
    display: (raw) => (isUrl(raw) ? raw : stripAt(raw)),
  },
  {
    key: "discord",
    label: "Discord",
    placeholder: "username or invite URL",
    icon: DiscordIcon,
    toUrl: (raw) => {
      const v = raw.trim();
      if (!v) return null;
      if (isUrl(v)) return v;
      return null; // Plain Discord usernames aren't linkable
    },
    display: (raw) => raw.trim(),
  },
  {
    key: "website",
    label: "Website",
    placeholder: "https://…",
    icon: Globe,
    toUrl: (raw) => {
      const v = raw.trim();
      if (!v) return null;
      if (isUrl(v)) return v;
      return `https://${v}`;
    },
    display: (raw) => raw.trim().replace(/^https?:\/\//, ""),
  },
];

// Custom inline SVG icons (lucide doesn't ship these)
function XIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden>
      <path d="M18.244 2H21l-6.52 7.45L22 22h-6.83l-4.78-6.27L4.8 22H2.04l6.98-7.97L2 2h6.91l4.32 5.7L18.244 2Zm-1.2 18h1.66L7.06 4H5.3l11.74 16Z" />
    </svg>
  );
}

function TikTokIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden>
      <path d="M16.5 3a5.5 5.5 0 0 0 5 5v3a8.5 8.5 0 0 1-5-1.6V15a6 6 0 1 1-6-6c.34 0 .67.03 1 .09V12a3 3 0 1 0 2 2.83V3h3Z" />
    </svg>
  );
}

function DiscordIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden>
      <path d="M20.317 4.369A19.79 19.79 0 0 0 16.558 3a14.7 14.7 0 0 0-.66 1.36 18.27 18.27 0 0 0-5.797 0A14.7 14.7 0 0 0 9.442 3a19.79 19.79 0 0 0-3.76 1.369C2.06 9.79 1.07 15.07 1.56 20.27a19.94 19.94 0 0 0 6.06 3.07c.49-.67.93-1.39 1.31-2.14-.72-.27-1.41-.6-2.06-.99.17-.13.34-.26.5-.4 3.97 1.83 8.27 1.83 12.19 0 .17.14.33.27.5.4-.65.39-1.34.72-2.06.99.38.75.82 1.47 1.31 2.14a19.94 19.94 0 0 0 6.06-3.07c.57-6.04-.99-11.27-4.13-15.91ZM8.52 16.13c-1.18 0-2.16-1.09-2.16-2.43s.95-2.43 2.16-2.43 2.18 1.09 2.16 2.43c0 1.34-.95 2.43-2.16 2.43Zm6.97 0c-1.18 0-2.16-1.09-2.16-2.43s.95-2.43 2.16-2.43 2.18 1.09 2.16 2.43c0 1.34-.95 2.43-2.16 2.43Z" />
    </svg>
  );
}
