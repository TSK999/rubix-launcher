// Strategy interface — every install strategy implements this.
// Renderer code only ever talks to `installMod`/`uninstallMod` from ./index.ts,
// never reaches into a strategy directly.

import type { GameDefinition, InstalledManifest, ModPackage } from "../types";

export interface StrategyResult<T = void> {
  ok: boolean;
  error?: string;
  data?: T;
}

export interface ModStrategy {
  readonly id: string;

  /** First-time setup (install loader if needed). Idempotent. */
  setup(game: GameDefinition): Promise<StrategyResult>;

  /** Cheap check: is loader present and the right version? */
  verifyLoader(game: GameDefinition): Promise<StrategyResult<{ version?: string }>>;

  /** Download + place files. Returns the manifest entry. */
  install(game: GameDefinition, pkg: ModPackage): Promise<StrategyResult<InstalledManifest>>;

  /** Remove a previously installed mod by id. */
  uninstall(game: GameDefinition, modId: string): Promise<StrategyResult>;

  /** Validate everything on disk still matches the manifest. */
  validate(game: GameDefinition): Promise<StrategyResult>;
}

export function notImplemented(id: string): ModStrategy {
  const err = async (): Promise<StrategyResult<any>> => ({
    ok: false,
    error: `${id}: not implemented yet`,
  });
  return {
    id,
    setup: err,
    verifyLoader: err,
    install: err,
    uninstall: err,
    validate: err,
  };
}
