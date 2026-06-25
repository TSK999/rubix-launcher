import { describe, it, expect } from "vitest";
import {
  resolveDependencies,
  satisfies,
  getLayerDeps,
  type Dependency,
} from "@/lib/mods/dependencies";

describe("satisfies", () => {
  it("matches exact, range, caret, and wildcard", () => {
    expect(satisfies("1.2.3", "1.2.3")).toBe(true);
    expect(satisfies("1.2.3", ">=1.2.0")).toBe(true);
    expect(satisfies("1.2.3", "<1.0.0")).toBe(false);
    expect(satisfies("1.5.0", "^1.2.0")).toBe(true);
    expect(satisfies("2.0.0", "^1.2.0")).toBe(false);
    expect(satisfies("1.20.1", "1.20.*")).toBe(true);
    expect(satisfies(undefined, ">=1")).toBe(false);
    expect(satisfies("1.0.0", undefined)).toBe(true);
  });
});

describe("resolveDependencies", () => {
  it("flags missing required loader for BepInEx system", () => {
    const r = resolveDependencies({
      modSystem: "BEPINEX_RUNTIME",
      installed: [],
    });
    expect(r.ok).toBe(false);
    expect(r.issues.some((i) => i.code === "MISSING_REQUIRED" && i.depId === "bepinex-core")).toBe(
      true,
    );
  });

  it("passes when loader is installed and version satisfies", () => {
    const r = resolveDependencies({
      modSystem: "BEPINEX_RUNTIME",
      installed: [{ id: "bepinex-core", version: "5.4.22" }, { id: "harmony", version: "2.3.0" }],
    });
    expect(r.ok).toBe(true);
  });

  it("flags version mismatch", () => {
    const modDeps: Dependency[] = [
      {
        id: "bepinex-core",
        name: "BepInEx Runtime Core",
        type: "MOD_LOADER",
        required: true,
        versionConstraint: ">=5.4.21",
        installSource: "download",
        appliesTo: ["BEPINEX_RUNTIME"],
      },
    ];
    const r = resolveDependencies({
      modSystem: "BEPINEX_RUNTIME",
      modDeps,
      installed: [{ id: "bepinex-core", version: "5.0.0" }],
    });
    expect(r.ok).toBe(false);
    expect(r.issues.some((i) => i.code === "VERSION_MISMATCH")).toBe(true);
  });

  it("detects circular dependencies", () => {
    const modDeps: Dependency[] = [
      {
        id: "a", name: "A", type: "FRAMEWORK", required: true,
        installSource: "download", appliesTo: ["FOLDER_INJECTION"], dependsOn: ["b"],
      },
      {
        id: "b", name: "B", type: "FRAMEWORK", required: true,
        installSource: "download", appliesTo: ["FOLDER_INJECTION"], dependsOn: ["a"],
      },
    ];
    const r = resolveDependencies({
      modSystem: "FOLDER_INJECTION",
      modDeps,
      installed: [],
    });
    expect(r.issues.some((i) => i.code === "CIRCULAR")).toBe(true);
    expect(r.ok).toBe(false);
  });

  it("filters Minecraft loader deps by chosen loader", () => {
    const fabricOnly = getLayerDeps("PROFILE_BASED_RUNTIME", "FABRIC").map((d) => d.id);
    expect(fabricOnly).toContain("fabric-loader");
    expect(fabricOnly).not.toContain("forge-loader");
    expect(fabricOnly).not.toContain("neoforge-loader");
  });

  it("produces topological install order with dependents after parents", () => {
    const r = resolveDependencies({
      modSystem: "SMAPI_RUNTIME",
      installed: [],
    });
    const ids = r.installOrder.map((d) => d.id);
    expect(ids.indexOf("smapi")).toBeLessThan(ids.indexOf("content-patcher"));
    expect(ids.indexOf("smapi")).toBeLessThan(ids.indexOf("gmcm"));
  });
});
