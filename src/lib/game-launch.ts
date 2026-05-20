import type { Game } from "@/lib/game-types";

export const steamLaunchTarget = (appId: number | string) => `steam://run/${appId}`;

export const getGameLaunchTarget = (game: Game) => {
  if (game.steamAppId) return steamLaunchTarget(game.steamAppId);
  return game.path?.trim() || "";
};

export const isExternalProtocol = (target: string) => /^[a-z][a-z0-9+.-]*:\/\//i.test(target);

export const getSteamAppIdFromProtocol = (target: string) =>
  /^steam:\/\/(?:run|rungameid)\/(\d+)/i.exec(target)?.[1] ?? null;

export type ExternalProtocolResult = {
  ok: boolean;
  method?: "direct-anchor" | "steam-handoff";
  url: string;
  handoffUrl?: string;
};

export const getSteamLaunchHandoffUrl = (target: string) => {
  const appId = getSteamAppIdFromProtocol(target);
  if (!appId || typeof window === "undefined") return null;
  return `${window.location.origin}/launch/steam/${appId}`;
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

  const handoffUrl = getSteamLaunchHandoffUrl(target) ?? undefined;

  if (isFramed && handoffUrl) {
    try {
      const opened = window.open(handoffUrl, "_blank", "noopener,noreferrer");
      if (opened) return { ok: true, method: "steam-handoff", url: target, handoffUrl } satisfies ExternalProtocolResult;
    } catch {
      // fall through to anchor fallback
    }

    try {
      const link = document.createElement("a");
      link.href = handoffUrl;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      link.style.display = "none";
      document.body.appendChild(link);
      link.click();
      link.remove();
      return { ok: true, method: "steam-handoff", url: target, handoffUrl } satisfies ExternalProtocolResult;
    } catch {
      return { ok: false, url: target, handoffUrl } satisfies ExternalProtocolResult;
    }
  }

  // Direct same-frame click works in deployed/standalone web. Sandboxed previews use the in-app HTTPS handoff above.
  try {
    const link = document.createElement("a");
    link.href = target;
    link.target = "_self";
    link.rel = "noopener noreferrer";
    link.style.display = "none";
    document.body.appendChild(link);
    link.click();
    link.remove();
    return { ok: true, method: "direct-anchor", url: target, handoffUrl } satisfies ExternalProtocolResult;
  } catch {
    return { ok: false, url: target, handoffUrl } satisfies ExternalProtocolResult;
  }
};