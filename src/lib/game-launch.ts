import type { Game } from "@/lib/game-types";

export const steamLaunchTarget = (appId: number | string) => `steam://run/${appId}`;

export const getGameLaunchTarget = (game: Game) => {
  if (game.steamAppId) return steamLaunchTarget(game.steamAppId);
  return game.path?.trim() || "";
};

export const isExternalProtocol = (target: string) => /^[a-z][a-z0-9+.-]*:\/\//i.test(target);

export const openExternalProtocol = (target: string) => {
  if (!isExternalProtocol(target)) return false;

  const isFramed = (() => {
    try {
      return window.top !== window.self;
    } catch {
      return true;
    }
  })();

  // Strategy 1: anchor click in same frame (works in deployed/standalone web)
  try {
    const link = document.createElement("a");
    link.href = target;
    link.target = isFramed ? "_blank" : "_self";
    link.rel = "noopener noreferrer";
    link.style.display = "none";
    document.body.appendChild(link);
    link.click();
    link.remove();
  } catch {
    // ignore
  }

  // Strategy 2: window.open in a new tab/window (bypasses sandboxed top-nav)
  try {
    const opened = window.open(target, "_blank", "noopener,noreferrer");
    if (opened) return true;
  } catch {
    // ignore
  }

  // Strategy 3: direct same-frame navigation as last resort
  try {
    window.location.href = target;
  } catch {
    // ignore
  }

  return true;
};