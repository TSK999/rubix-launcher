import type { Game } from "@/lib/game-types";

export const steamLaunchTarget = (appId: number | string) => `steam://run/${appId}`;

export const getGameLaunchTarget = (game: Game) => {
  if (game.steamAppId) return steamLaunchTarget(game.steamAppId);
  return game.path?.trim() || "";
};

export const isExternalProtocol = (target: string) => /^[a-z][a-z0-9+.-]*:\/\//i.test(target);

export type ExternalProtocolResult = {
  ok: boolean;
  method?: "direct-anchor" | "steam-linkfilter";
  url: string;
  fallbackUrl?: string;
};

export const getSteamProtocolFallbackUrl = (target: string) => {
  if (!/^steam:\/\//i.test(target)) return null;
  return `https://steamcommunity.com/linkfilter/?url=${encodeURIComponent(target)}`;
};

export const openExternalProtocol = (target: string) => {
  if (!isExternalProtocol(target)) return { ok: false, url: target } satisfies ExternalProtocolResult;

  const isFramed = (() => {
    try {
      return window.top !== window.self;
    } catch {
      return true;
    }
  })();

  const fallbackUrl = getSteamProtocolFallbackUrl(target) ?? undefined;

  if (isFramed && fallbackUrl) {
    try {
      const opened = window.open(fallbackUrl, "_blank", "noopener,noreferrer");
      if (opened) return { ok: true, method: "steam-linkfilter", url: target, fallbackUrl } satisfies ExternalProtocolResult;
    } catch {
      // fall through to anchor fallback
    }

    try {
      const link = document.createElement("a");
      link.href = fallbackUrl;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      link.style.display = "none";
      document.body.appendChild(link);
      link.click();
      link.remove();
      return { ok: true, method: "steam-linkfilter", url: target, fallbackUrl } satisfies ExternalProtocolResult;
    } catch {
      return { ok: false, url: target, fallbackUrl } satisfies ExternalProtocolResult;
    }
  }

  // Direct same-frame click works in deployed/standalone web. Sandboxed previews use the Steam HTTPS handoff above.
  try {
    const link = document.createElement("a");
    link.href = target;
    link.target = "_self";
    link.rel = "noopener noreferrer";
    link.style.display = "none";
    document.body.appendChild(link);
    link.click();
    link.remove();
    return { ok: true, method: "direct-anchor", url: target, fallbackUrl } satisfies ExternalProtocolResult;
  } catch {
    return { ok: false, url: target, fallbackUrl } satisfies ExternalProtocolResult;
  }
};