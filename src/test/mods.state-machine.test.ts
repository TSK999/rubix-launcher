import { describe, expect, it } from "vitest";
import {
  reduce,
  preInstallGuardrails,
  type FsmContext,
} from "@/lib/mods/state-machine";
import type { GameDefinition, ModPackage } from "@/lib/mods/types";

const game: GameDefinition = {
  id: "g1",
  name: "Kerbal Space Program",
  platform: "steam",
  installPath: "/games/ksp",
  modSystemType: "FOLDER_INJECTION",
  loader: "NONE",
  modSources: ["spacedock"],
  configured: true,
  setupState: "READY",
};

const pkg: ModPackage = {
  id: "m1",
  name: "Test",
  version: "1.0.0",
  source: "manual",
  gameId: "g1",
  archive: "/tmp/x.zip",
  installStrategy: "DIRECT_COPY",
};

const ctx: FsmContext = { game, pkg };

describe("install FSM", () => {
  it("happy path runs to END", () => {
    let s: ReturnType<typeof reduce> = { next: "START", effect: { kind: "none" }, context: ctx };
    s = reduce("START", { type: "BEGIN" }, ctx);
    expect(s.next).toBe("DETECT_GAME");
    s = reduce(s.next, { type: "GAME_DETECTED" }, ctx);
    expect(s.next).toBe("VALIDATE_INSTALL_PATH");
    s = reduce(s.next, { type: "PATH_VALID" }, ctx);
    s = reduce(s.next, { type: "MOD_SYSTEM_IDENTIFIED", ready: true }, ctx);
    expect(s.next).toBe("VERIFY_LOADER");
    s = reduce(s.next, { type: "LOADER_VERIFIED" }, ctx);
    s = reduce(s.next, { type: "MOD_INSTALLED" }, ctx);
    s = reduce(s.next, { type: "VALIDATED" }, ctx);
    s = reduce(s.next, { type: "MANIFEST_WRITTEN" }, ctx);
    expect(s.next).toBe("END");
  });

  it("unready setup detours to wizard", () => {
    const s = reduce("IDENTIFY_MOD_SYSTEM", { type: "MOD_SYSTEM_IDENTIFIED", ready: false }, ctx);
    expect(s.next).toBe("SETUP_WIZARD");
  });

  it("FAIL transitions to FAILED with error context", () => {
    const s = reduce("INSTALL_MOD", { type: "FAIL", code: "IO_ERROR", message: "boom" }, ctx);
    expect(s.next).toBe("FAILED");
    expect(s.context.error?.code).toBe("IO_ERROR");
  });
});

describe("guardrails", () => {
  it("blocks when setupState !== READY", () => {
    const err = preInstallGuardrails({ ...game, setupState: "UNCONFIGURED" }, pkg);
    expect(err?.code).toBe("SETUP_REQUIRED");
  });
  it("blocks on missing path", () => {
    const err = preInstallGuardrails({ ...game, installPath: undefined }, pkg);
    expect(err?.code).toBe("PATH_MISSING");
  });
  it("blocks on loader mismatch", () => {
    const err = preInstallGuardrails(
      { ...game, loader: "NONE" },
      { ...pkg, requires: { loader: "BEPINEX" } },
    );
    expect(err?.code).toBe("LOADER_MISSING");
  });
  it("passes when all good", () => {
    expect(preInstallGuardrails(game, pkg)).toBeNull();
  });
});
