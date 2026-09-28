/**
 * The density gate slice (fable's design) — a thin adapter that combines the world's
 * static cluster metadata (`childrenByParent` / `clusterMetaByParent` in
 * `topology-world.ts`) with the parent's *live* coordinates and calls the pure
 * `computeDensityGate`.
 *
 * Every decision (who collapses, which chips appear) lives in the pure model
 * (`density-gate.ts`); this file only injects coordinates.
 */

import {
  chipAnchor,
  computeDensityGate,
  type ClusterChip,
  type DensityGateParentGeometry,
  type DensityGateResult,
} from "../model/density-gate";
import type { TopologyWorld } from "./topology-world";

export function computeTopologyClusterState(
  world: Pick<TopologyWorld, "nodeById" | "childrenByParent" | "clusterMetaByParent">,
  expandedParents: ReadonlySet<string>,
  /** The focused node's cross-parent neighbours, drawn inside folded parents (`DensityGateInput.heldOpen`). */
  heldOpen?: ReadonlySet<string>,
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
    heldOpen,
  });
}

/**
 * The same chips at their parents' live positions: a drag or the living graph moves a parent every
 * frame, while which ids fold and which chips exist change only with the graph, the expanded set
 * and the focus.
 */
export function placeClusterChips(
  world: Pick<TopologyWorld, "nodeById" | "clusterMetaByParent">,
  chips: readonly ClusterChip[],
): ClusterChip[] {
  return chips.map((chip) => {
    const parent = world.nodeById.get(chip.parentId);
    const meta = world.clusterMetaByParent.get(chip.parentId);
    if (!parent || !meta) return chip;
    return { ...chip, anchor: chipAnchor({ x: parent.x, y: parent.y, angle: meta.angle, ring: meta.ring }, chip.expanded) };
  });
}
