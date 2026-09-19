/**
 * The density gate slice (fable's design) — a thin adapter that combines the world's
 * static cluster metadata (`childrenByParent` / `clusterMetaByParent` in
 * `topology-world.ts`) with the parent's *live* coordinates and calls the pure
 * `computeDensityGate`.
 *
 * The anchor is recomputed from the live position every frame because a drag or the
 * living graph moves the parent and the chip has to follow (a static anchor drifts).
 * Every decision (who collapses, which chips appear) lives in the pure model
 * (`density-gate.ts`); this file only injects coordinates.
 */

import {
  computeDensityGate,
  type DensityGateParentGeometry,
  type DensityGateResult,
} from "../model/density-gate";
import type { TopologyWorld } from "./topology-world";

export function computeTopologyClusterState(
  world: Pick<TopologyWorld, "nodeById" | "childrenByParent" | "clusterMetaByParent">,
  expandedParents: ReadonlySet<string>,
): DensityGateResult {
  const parentGeometry = new Map<string, DensityGateParentGeometry>();
  for (const [parentId, meta] of world.clusterMetaByParent) {
    const parent = world.nodeById.get(parentId);
    if (!parent) continue;
    parentGeometry.set(parentId, {
      x: parent.x,
      y: parent.y,
      angle: meta.angle,
      ring: meta.ring,
    });
  }
  return computeDensityGate({
    childrenByParent: world.childrenByParent,
    expandedParents,
    parentGeometry,
    // domain children (a project's skeleton) are exempt from the gate — the Part 0 domain-tier gate exemption.
    kindOf: (id) => world.nodeById.get(id)?.kind,
  });
}
