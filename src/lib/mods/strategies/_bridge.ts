// Shared Electron mods-bridge accessor for all renderer strategies.
// Every non-Minecraft strategy uses the same underlying download+extract pipe
// (`window.rubix.mods.install`) and layers per-game config on top.

export type ModsBridge = {
  setFolder: (
    gameKey: string,
    path: string,
  ) => Promise<{ ok: boolean; gameDataDir?: string; error?: string }>;
  getFolder: (
    gameKey: string,
  ) => Promise<{ ok: boolean; gameDataDir: string | null }>;
  listInstalled: (
    gameKey: string,
  ) => Promise<{ ok: boolean; installed?: Record<string, unknown> }>;
  validatePath: (payload: {
    path: string;
    signatureFiles: string[];
  }) => Promise<{ ok: boolean; matched?: string | null; reason?: string }>;
  install: (payload: {
    gameKey: string;
    modId: string;
    modName: string;
    version: string;
    versionId: number;
    downloadUrl: string;
    stripHint?: string;
    installSubdir?: string;
  }) => Promise<{ ok: boolean; files?: number; error?: string }>;
  uninstall: (
    gameKey: string,
    modId: string,
  ) => Promise<{ ok: boolean; removed?: number; error?: string }>;
};

export function modsBridge(): ModsBridge | null {
  if (typeof window === "undefined" || !window.rubix?.mods) return null;
  return window.rubix.mods as unknown as ModsBridge;
}

export function versionIdOf(version: string): number {
  return Number.parseInt(version.replace(/\D/g, ""), 10) || Date.now();
}
