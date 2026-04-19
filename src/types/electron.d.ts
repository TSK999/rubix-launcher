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

export type UpdaterStatus =
  | { status: "checking"; payload?: undefined }
  | { status: "available"; payload: { version: string } }
  | { status: "not-available"; payload: { version?: string } }
  | { status: "downloading"; payload: { percent: number; bytesPerSecond: number; transferred: number; total: number } }
  | { status: "downloaded"; payload: { version: string; releaseName: string; releaseNotes: string; releaseDate: string } }
  | { status: "error"; payload: { message: string } };

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
      updater: {
        check: () => Promise<{ ok: boolean; version?: string; error?: string }>;
        install: () => Promise<{ ok: boolean }>;
        getVersion: () => Promise<{ version: string }>;
        onStatus: (cb: (data: UpdaterStatus) => void) => () => void;
      };
    };
  }
}
