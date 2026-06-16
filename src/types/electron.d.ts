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

export type ClipsFfmpegStatus = {
  state: "idle" | "starting" | "recording" | "error";
  encoder: { name: string; label: string; kind: string } | null;
  error: string;
  args?: string[];
  segments: number;
  sessionDir: string | null;
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
      screenshots: {
        capture: () => Promise<
          | { ok: true; dataUrl: string; width: number; height: number }
          | { ok: false; error: string }
        >;
        onCaptured: (
          cb: (data: { dataUrl: string; width: number; height: number }) => void,
        ) => () => void;
      };
      clips: {
        setTarget: (target: { title?: string; path?: string } | null) => Promise<{ ok: boolean }>;
        getSource: () => Promise<
          | { ok: true; sourceId: string; displayId: string; name?: string }
          | { ok: false; error: string }
        >;
        listDisplays: () => Promise<{
          ok: boolean;
          displays: Array<{
            id: string;
            label: string;
            width: number;
            height: number;
            isPrimary: boolean;
            isCursor: boolean;
          }>;
          error?: string;
        }>;
        listAudioDevices: () => Promise<{
          ok: boolean;
          devices: Array<{ id: string; label: string }>;
          error?: string;
        }>;
        setPreferredDisplay: (displayId: string | null) => Promise<{ ok: boolean }>;
        onSaveTrigger: (
          cb: (data: { triggeredAt: number }) => void,
        ) => () => void;
        ffmpeg: {
          probe: () => Promise<{
            ok: boolean;
            ffmpeg: { ok: boolean; path: string; version?: string; error?: string };
            encoders: {
              selected: { name: string; label: string; kind: string; vendor: string } | null;
              tested: Array<{ name: string; label: string; kind: string; ok: boolean; reason?: string }>;
              error?: string;
            };
          }>;
          start: (opts: Record<string, unknown>) => Promise<{
            ok: boolean;
            encoder?: { name: string; label: string; kind: string } | null;
            error?: string;
            alreadyRunning?: boolean;
          }>;
          stop: () => Promise<{ ok: boolean; error?: string }>;
          status: () => Promise<ClipsFfmpegStatus>;
          save: (opts: { seconds?: number }) => Promise<
            | { ok: true; buffer: ArrayBuffer; mimeType: string; durationSeconds: number; path: string }
            | { ok: false; error: string }
          >;
          discard: (path: string) => Promise<{ ok: boolean }>;
          onStatus: (cb: (s: ClipsFfmpegStatus) => void) => () => void;
        };
      };
      hotkeys: {
        set: (map: Record<string, string>) => Promise<{
          ok: boolean;
          active: Record<string, string>;
          results: Record<string, { ok: boolean; accelerator?: string; error?: string }>;
        }>;
        get: () => Promise<{ ok: boolean; active: Record<string, string> }>;
        onFired: (cb: (data: { action: string; at: number }) => void) => () => void;
      };
      mods: {
        pickFolder: (
          gameKey: string,
          title?: string,
          mode?: "ksp" | "root",
        ) => Promise<{ ok: boolean; gameDataDir?: string; canceled?: boolean; error?: string }>;
        getFolder: (
          gameKey: string,
        ) => Promise<{ ok: boolean; gameDataDir: string | null }>;
        listInstalled: (
          gameKey: string,
        ) => Promise<{
          ok: boolean;
          installed: Record<
            string,
            {
              modId: string;
              modName: string;
              version: string;
              versionId: number;
              installSubdir?: string;
              installedAt: string;
              files: string[];
            }
          >;
        }>;
        install: (payload: {
          gameKey: string;
          modId: string;
          modName: string;
          version: string;
          versionId: number;
          downloadUrl: string;
          stripHint?: "GameData" | "";
          installSubdir?: string;
        }) => Promise<{ ok: boolean; files?: number; error?: string }>;
        uninstall: (
          gameKey: string,
          modId: string,
        ) => Promise<{ ok: boolean; removed?: number; error?: string }>;
        openFolder: (gameKey: string) => Promise<{ ok: boolean; error?: string }>;
      };
    };
  }
}
