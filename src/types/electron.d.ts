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

export type EaScanGame = {
  appId: string;
  contentId: string;
  displayName: string;
  installLocation: string;
  installSize: number;
};

export type EaLaunchPayload = {
  appId: string;
  contentId?: string;
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
      ea: {
        scanInstalled: () => Promise<{
          ok: boolean;
          scannedDir: string | null;
          games: EaScanGame[];
          error?: string;
        }>;
        launch: (payload: EaLaunchPayload) => Promise<{ ok: boolean; error?: string }>;
      };
      updater: {
        check: () => Promise<{ ok: boolean; version?: string; error?: string }>;
        install: () => Promise<{ ok: boolean }>;
        getVersion: () => Promise<{ version: string }>;
        getPendingReleaseNotes: () => Promise<{
          version: string;
          releaseName: string;
          releaseNotes: string;
          releaseDate: string;
        } | null>;
        clearPendingReleaseNotes: () => Promise<{ ok: boolean }>;
        onStatus: (cb: (data: UpdaterStatus) => void) => () => void;
      };
    };
  }
}
