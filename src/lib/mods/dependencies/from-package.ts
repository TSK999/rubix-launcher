// Helpers bridging ModPackage.dependencies (lightweight per-mod refs)
// to the resolver's Dependency graph nodes.

import type { ModPackage } from "../types";
import type { Dependency } from "./types";

/** Convert a ModPackage's declared deps into resolver Dependency nodes. */
export function packageDepsToGraph(pkg: ModPackage): Dependency[] {
  return (pkg.dependencies ?? []).map((d) => ({
    id: d.modId,
    name: d.modId,
    type: "FRAMEWORK",
    required: !d.optional,
    versionConstraint: d.version,
    installSource: "download",
    appliesTo: [pkg.gameId],
  }));
}
