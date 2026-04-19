// Type declaration for Electron bridge exposed via preload.cjs
export {};

export type EpicScanGame = {
  appName: string;
  displayName: string;
  installLocation: string;
  launchExecutable: string;
  catalogNamespace: string;
  catalogItemId: string;
  installSize: number;
  image: string;
};

export type EpicLaunchPayload = {
  appName: string;
  catalogNamespace: string;
  catalogItemId: string;
};

declare global {
  interface Window {
    rubix?: {
      isElectron: true;
      launchGame: (target: string) => Promise<{ ok: boolean; error?: string; method?: string }>;
      pickExecutable: () => Promise<string | null>;
      epic: {
        scanInstalled: () => Promise<{
          ok: boolean;
          scannedDir: string | null;
          games: EpicScanGame[];
          error?: string;
        }>;
        launch: (payload: EpicLaunchPayload) => Promise<{ ok: boolean; error?: string }>;
      };
    };
  }
}
