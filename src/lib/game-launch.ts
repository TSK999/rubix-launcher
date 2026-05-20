import type { Game } from "@/lib/game-types";

export const steamLaunchTarget = (appId: number | string) => `steam://run/${appId}`;

export const getGameLaunchTarget = (game: Game) => {
  if (game.steamAppId) return steamLaunchTarget(game.steamAppId);
  return game.path?.trim() || "";
};

export const isExternalProtocol = (target: string) => /^[a-z][a-z0-9+.-]*:\/\//i.test(target);

export const openExternalProtocol = (target: string) => {
  if (!isExternalProtocol(target)) return false;

  const link = document.createElement("a");
  link.href = target;
  link.target = window.top === window.self ? "_self" : "_top";
  link.rel = "noopener noreferrer";
  link.style.display = "none";
  document.body.appendChild(link);
  link.click();
  link.remove();

  return true;
};