// RUBIX Mod Manager — core type system.
// See spec: docs not in repo; this file is the source of truth for types.

export type ModSystemType =
  | "FOLDER_INJECTION"
  | "BEPINEX_RUNTIME"
  | "MELONLOADER_RUNTIME"
  | "PROFILE_BASED_RUNTIME"
  | "SMAPI_RUNTIME"
  | "TMODLOADER_RUNTIME"
  | "ADDON_FOLDER_SYSTEM"
  | "MODIO_NATIVE_SYNC"
  | "HYBRID_SPECIAL";

export type LoaderType =
  | "BEPINEX"
  | "MELONLOADER"
  | "SMAPI"
  | "TMODLOADER"
  | "FORGE"
  | "FABRIC"
  | "NEOFORGE"
  | "NONE";

export type SetupState =
  | "UNCONFIGURED"
  | "DETECTING_GAME"
  | "DETECTING_LOADER"
  | "INSTALLING_LOADER"
  | "VERIFYING_LOADER"
  | "READY"
  | "FAILED";

export type InstallStrategy =
  | "DIRECT_COPY"
  | "BEPINEX_MAP"
  | "MELONLOADER_DLL"
  | "PROFILE_ISOLATED"
  | "SMAPI_DEPLOY"
  | "TMODLOADER_DEPLOY"
  | "ADDON_COPY"
  | "MODIO_SUBSCRIBE";

export type ModSource =
  | "thunderstore"
  | "curseforge"
  | "modrinth"
  | "modio"
  | "spacedock"
  | "nexus"
  | "manual";

export interface GameDefinition {
  id: string;
  name: string;
  platform: "steam" | "epic" | "manual" | "ea" | "xbox" | "riot";
  installPath?: string;

  modSystemType: ModSystemType;
  loader?: LoaderType;
  modSources: ModSource[];

  /** Default sub-path under installPath where mods land for FOLDER/ADDON systems. */
  modFolder?: string;

  configured: boolean;
  setupState: SetupState;
  lastValidated?: number;
}

export interface Dependency {
  modId: string;
  version?: string;
  optional?: boolean;
}

export interface ModFile {
  /** Path inside the downloaded archive. */
  archivePath: string;
  /** Destination relative to game/profile root. Resolved by strategy. */
  targetHint?: "plugins" | "config" | "patchers" | "mods" | "addons" | "root";
}

export interface ModPackage {
  id: string;
  name: string;
  version: string;
  source: ModSource;
  gameId: string;
  /** Local archive path or remote URL. */
  archive: string;
  files?: ModFile[];
  dependencies?: Dependency[];
  installStrategy: InstallStrategy;
  /** Loader/runtime constraints used by guardrails. */
  requires?: {
    loader?: LoaderType;
    loaderVersion?: string;
    gameVersion?: string;
  };
}

export interface InstalledManifest {
  gameId: string;
  modId: string;
  version: string;
  strategy: InstallStrategy;
  files: string[]; // absolute or game-relative paths written
  loaderVersion?: string;
  profileId?: string;
  installedAt: number;
}

export type InstallErrorCode =
  | "SETUP_REQUIRED"
  | "PATH_MISSING"
  | "LOADER_MISSING"
  | "LOADER_VERSION_MISMATCH"
  | "GAME_VERSION_MISMATCH"
  | "DEPENDENCY_UNRESOLVED"
  | "PROFILE_MISSING"
  | "UNSUPPORTED_STRATEGY"
  | "IO_ERROR"
  | "UNKNOWN";

export class ModInstallError extends Error {
  code: InstallErrorCode;
  constructor(code: InstallErrorCode, message: string) {
    super(message);
    this.code = code;
    this.name = "ModInstallError";
  }
}
