// Dependency resolution engine.
//   1. Parse mod dependency list
//   2. Build dependency graph
//   3. Check installed system + loader deps
//   4. Resolve missing deps
//   5. Produce topologically-sorted install order
//   6. Surface version mismatches / circular cycles as issues
//
// Pure functions only — no I/O. The caller decides how to install.

import type { LoaderType, ModSystemType } from "../types";
import { getLayerDeps } from "./registry";
import type {
  Dependency,
  DependencyIssue,
  InstalledDependency,
  ResolutionResult,
} from "./types";

/** Very small semver-ish check. Supports exact, ">=x", "^x", "x.y.*". */
export function satisfies(version: string | undefined, constraint?: string): boolean {
  if (!constraint) return true;
  if (!version) return false;
  const v = version.trim();
  const c = constraint.trim();
  if (c === v) return true;
  if (c.startsWith(">=")) return cmp(v, c.slice(2).trim()) >= 0;
  if (c.startsWith(">")) return cmp(v, c.slice(1).trim()) > 0;
  if (c.startsWith("<=")) return cmp(v, c.slice(2).trim()) <= 0;
  if (c.startsWith("<")) return cmp(v, c.slice(1).trim()) < 0;
  if (c.startsWith("^")) {
    const base = c.slice(1).trim().split(".");
    const got = v.split(".");
    return base[0] === got[0] && cmp(v, c.slice(1).trim()) >= 0;
  }
  if (c.endsWith(".*")) {
    return v.startsWith(c.slice(0, -2));
  }
  return false;
}

function cmp(a: string, b: string): number {
  const pa = a.split(".").map((x) => parseInt(x, 10) || 0);
  const pb = b.split(".").map((x) => parseInt(x, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d !== 0) return d > 0 ? 1 : -1;
  }
  return 0;
}

export interface ResolveInput {
  modSystem: ModSystemType;
  loader?: LoaderType;
  /** Extra deps declared by the mod package itself. */
  modDeps?: Dependency[];
  /** What's already installed on disk for this game. */
  installed: InstalledDependency[];
}

export function resolveDependencies(input: ResolveInput): ResolutionResult {
  const { modSystem, loader, modDeps = [], installed } = input;
  const issues: DependencyIssue[] = [];

  // 1. Collect every relevant dep (layer + mod-declared) into a single map.
  const layer = getLayerDeps(modSystem, loader);
  const all = new Map<string, Dependency>();
  for (const d of layer) all.set(d.id, d);
  for (const d of modDeps) all.set(d.id, d);

  const installedMap = new Map(installed.map((i) => [i.id, i.version]));

  // 2. Detect cycles + topo sort.
  const sorted: Dependency[] = [];
  const visited = new Map<string, "pending" | "done">();

  const visit = (id: string, stack: string[]) => {
    const status = visited.get(id);
    if (status === "done") return;
    if (status === "pending") {
      issues.push({
        code: "CIRCULAR",
        depId: id,
        message: `Circular dependency: ${[...stack, id].join(" → ")}`,
      });
      return;
    }
    const node = all.get(id);
    if (!node) {
      // Reference to an unknown dep — only an issue if something requires it.
      issues.push({
        code: "UNKNOWN_DEPENDENCY",
        depId: id,
        message: `Unknown dependency referenced: ${id}`,
      });
      return;
    }
    visited.set(id, "pending");
    for (const child of node.dependsOn ?? []) visit(child, [...stack, id]);
    visited.set(id, "done");
    sorted.push(node);
  };
  for (const id of all.keys()) visit(id, []);

  // 3. Required + version checks against installed state.
  const missing: Dependency[] = [];
  for (const d of sorted) {
    const have = installedMap.get(d.id);
    if (have === undefined) {
      if (d.required) {
        issues.push({
          code: "MISSING_REQUIRED",
          depId: d.id,
          message: `Required dependency missing: ${d.name}`,
          required: d.versionConstraint,
        });
        missing.push(d);
      } else {
        // Optional but absent — still queue install if mod explicitly depends on it.
        missing.push(d);
      }
      continue;
    }
    if (!satisfies(have, d.versionConstraint)) {
      issues.push({
        code: "VERSION_MISMATCH",
        depId: d.id,
        message: `${d.name} version ${have} does not satisfy ${d.versionConstraint}`,
        required: d.versionConstraint,
        found: have,
      });
    }
  }

  const blocking = issues.some(
    (i) => i.code === "MISSING_REQUIRED" || i.code === "CIRCULAR" || i.code === "VERSION_MISMATCH",
  );

  return {
    ok: !blocking,
    installOrder: missing,
    issues,
    tree: sorted,
  };
}
