// Type declaration for Electron bridge exposed via preload.cjs (incl. Epic + EA)
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

export type XboxScanGame = {
  packageFamilyName: string;
  appUserModelId: string;
  displayName: string;
  installLocation: string;
  publisher: string;
  installSize: number;
  logo: string;
};

export type XboxLaunchPayload = {
  appUserModelId?: string;
  packageFamilyName?: string;
};

export type RiotScanGame = {
  productId: string;
  patchline: string;
  displayName: string;
  installLocation: string;
  clientPath: string;
  installSize: number;
};

export type RiotLaunchPayload = {
  productId: string;
  patchline?: string;
  clientPath?: string;
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
      xbox: {
        scanInstalled: () => Promise<{
          ok: boolean;
          scannedDir: string | null;
          games: XboxScanGame[];
          error?: string;
        }>;
        launch: (payload: XboxLaunchPayload) => Promise<{ ok: boolean; error?: string }>;
      };
      riot: {
        scanInstalled: () => Promise<{
          ok: boolean;
          scannedDir: string | null;
          games: RiotScanGame[];
          error?: string;
        }>;
        launch: (payload: RiotLaunchPayload) => Promise<{ ok: boolean; error?: string }>;
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
