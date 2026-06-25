// RUBIX Dependency System — type model.
// Spec: dependencies are layered (system → engine → loader → framework → mod)
// and are NEVER guessed per-game; they are resolved from runtime + graph.

import type { LoaderType, ModSystemType } from "../types";

export type DependencyType =
  | "RUNTIME" // Layer A — OS / system runtime (VC++, .NET, DirectX)
  | "MOD_LOADER" // Layer C — BepInEx, MelonLoader, Forge, Fabric, SMAPI, tModLoader
  | "FRAMEWORK" // Layer D — Fabric API, Content Patcher, ModuleManager, Harmony pack
  | "API_LAYER" // Mixin, Architectury, Cloth Config, GMCM
  | "PATCHER" // Harmony, MonoMod
  | "REDISTRIBUTABLE" // bundled redistributable installers
  | "GAME_ENGINE_EXTENSION"; // Il2CppInterop, Mono bridge

export type InstallSource = "bundled" | "download" | "game-internal";

export interface Dependency {
  id: string;
  name: string;
  type: DependencyType;
  required: boolean;
  /** semver-ish constraint, e.g. ">=5.4.21", "1.20.1", "^2.0". */
  versionConstraint?: string;
  installSource: InstallSource;
  /** Game ids or ModSystemType values this dependency applies to. */
  appliesTo: Array<string | ModSystemType>;
  /** Loader scope, when the dep is loader-specific. */
  loader?: LoaderType;
  /** Other deps that must be present before this one. */
  dependsOn?: string[];
}

export interface InstalledDependency {
  id: string;
  version?: string;
}

export type DependencyErrorCode =
  | "MISSING_REQUIRED"
  | "VERSION_MISMATCH"
  | "CIRCULAR"
  | "UNKNOWN_DEPENDENCY";

export interface DependencyIssue {
  code: DependencyErrorCode;
  depId: string;
  message: string;
  required?: string;
  found?: string;
}

export interface ResolutionResult {
  ok: boolean;
  /** Topologically sorted install order (missing deps only). */
  installOrder: Dependency[];
  /** All issues found (missing + version + circular). */
  issues: DependencyIssue[];
  /** Full dependency tree, sorted, for diagnostics. */
  tree: Dependency[];
}
