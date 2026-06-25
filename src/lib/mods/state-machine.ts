// Deterministic install state machine. Pure reducer + typed side effects.
// The runner (separate module) executes side effects; this file is unit-testable.

import type { GameDefinition, InstallErrorCode, ModPackage } from "./types";

export type FsmState =
  | "START"
  | "DETECT_GAME"
  | "VALIDATE_INSTALL_PATH"
  | "IDENTIFY_MOD_SYSTEM"
  | "SETUP_WIZARD"
  | "VERIFY_LOADER"
  | "INSTALL_MOD"
  | "VALIDATE_INSTALLATION"
  | "REGISTER_MANIFEST"
  | "END"
  | "FAILED";

export type FsmEvent =
  | { type: "BEGIN" }
  | { type: "GAME_DETECTED" }
  | { type: "PATH_VALID" }
  | { type: "MOD_SYSTEM_IDENTIFIED"; ready: boolean }
  | { type: "SETUP_COMPLETE" }
  | { type: "LOADER_VERIFIED" }
  | { type: "MOD_INSTALLED" }
  | { type: "VALIDATED" }
  | { type: "MANIFEST_WRITTEN" }
  | { type: "FAIL"; code: InstallErrorCode; message: string };

export interface FsmContext {
  game: GameDefinition;
  pkg: ModPackage;
  error?: { code: InstallErrorCode; message: string };
}

export type SideEffect =
  | { kind: "detectGame" }
  | { kind: "validatePath" }
  | { kind: "identifyModSystem" }
  | { kind: "runSetupWizard" }
  | { kind: "verifyLoader" }
  | { kind: "installMod" }
  | { kind: "validateInstallation" }
  | { kind: "registerManifest" }
  | { kind: "none" };

export interface Transition {
  next: FsmState;
  effect: SideEffect;
  context: FsmContext;
}

export function reduce(state: FsmState, event: FsmEvent, ctx: FsmContext): Transition {
  if (event.type === "FAIL") {
    return {
      next: "FAILED",
      effect: { kind: "none" },
      context: { ...ctx, error: { code: event.code, message: event.message } },
    };
  }

  switch (state) {
    case "START":
      if (event.type === "BEGIN")
        return { next: "DETECT_GAME", effect: { kind: "detectGame" }, context: ctx };
      break;
    case "DETECT_GAME":
      if (event.type === "GAME_DETECTED")
        return { next: "VALIDATE_INSTALL_PATH", effect: { kind: "validatePath" }, context: ctx };
      break;
    case "VALIDATE_INSTALL_PATH":
      if (event.type === "PATH_VALID")
        return {
          next: "IDENTIFY_MOD_SYSTEM",
          effect: { kind: "identifyModSystem" },
          context: ctx,
        };
      break;
    case "IDENTIFY_MOD_SYSTEM":
      if (event.type === "MOD_SYSTEM_IDENTIFIED") {
        return event.ready
          ? { next: "VERIFY_LOADER", effect: { kind: "verifyLoader" }, context: ctx }
          : { next: "SETUP_WIZARD", effect: { kind: "runSetupWizard" }, context: ctx };
      }
      break;
    case "SETUP_WIZARD":
      if (event.type === "SETUP_COMPLETE")
        return { next: "VERIFY_LOADER", effect: { kind: "verifyLoader" }, context: ctx };
      break;
    case "VERIFY_LOADER":
      if (event.type === "LOADER_VERIFIED")
        return { next: "INSTALL_MOD", effect: { kind: "installMod" }, context: ctx };
      break;
    case "INSTALL_MOD":
      if (event.type === "MOD_INSTALLED")
        return {
          next: "VALIDATE_INSTALLATION",
          effect: { kind: "validateInstallation" },
          context: ctx,
        };
      break;
    case "VALIDATE_INSTALLATION":
      if (event.type === "VALIDATED")
        return {
          next: "REGISTER_MANIFEST",
          effect: { kind: "registerManifest" },
          context: ctx,
        };
      break;
    case "REGISTER_MANIFEST":
      if (event.type === "MANIFEST_WRITTEN")
        return { next: "END", effect: { kind: "none" }, context: ctx };
      break;
  }

  return {
    next: "FAILED",
    effect: { kind: "none" },
    context: {
      ...ctx,
      error: { code: "UNKNOWN", message: `Invalid transition: ${state} <- ${event.type}` },
    },
  };
}

/** Guardrails (Section 7). Returns null if OK, or an error code+message. */
export function preInstallGuardrails(
  game: GameDefinition,
  pkg: ModPackage,
): { code: InstallErrorCode; message: string } | null {
  if (game.setupState !== "READY")
    return { code: "SETUP_REQUIRED", message: "Complete Setup Wizard before installing mods." };
  if (!game.installPath)
    return { code: "PATH_MISSING", message: "Game install path is not set." };
  if (pkg.requires?.loader && pkg.requires.loader !== "NONE" && game.loader !== pkg.requires.loader)
    return {
      code: "LOADER_MISSING",
      message: `Mod requires loader ${pkg.requires.loader}, game has ${game.loader ?? "NONE"}.`,
    };
  return null;
}
