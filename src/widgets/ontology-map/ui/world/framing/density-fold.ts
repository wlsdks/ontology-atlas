import { computeDensityGate, type DensityGateParentGeometry } from "../../../model/layout/density-gate";
import type { LayoutGraphNode } from "../../../model/layout/layout";
import type { TopologyWorld } from "../topology-world";
import type { DialBearing } from "./dial-world-framing";

const EMPTY_EXPANDED_PARENTS: ReadonlySet<string> = new Set();
const EMPTY_PARENT_GEOMETRY: ReadonlyMap<string, DensityGateParentGeometry> = new Map();

/**
 * What the density gate folds behind a chip at this expansion, read from the gate itself: the nodes never drawn however far the camera zooms. Not the frame's
 * published `clusteredIds`, which is empty until the first frame runs while the entry snap runs before it, so a fit would frame one set on arrival and another on the fit button.
 */
export function computeFoldedIds(
  world: Pick<TopologyWorld, "childrenByParent" | "nodeById"> & DialBearing,
  expandedParents: ReadonlySet<string>): ReadonlySet<string> {
  if (world.dial) return EMPTY_EXPANDED_PARENTS;
  return computeDensityGate({
    childrenByParent: world.childrenByParent,
    expandedParents,
    // Only the folded set is read; chip anchors need no geometry here.
    parentGeometry: EMPTY_PARENT_GEOMETRY,
    kindOf: (id) => world.nodeById.get(id)?.kind,
  }).clusteredIds;
}

/**
 * The de-pileup relaxation's scope: the nodes the density gate does not collapse. `computeDensityGate`'s `clusteredIds` needs no geometry (only per-parent child count and
 * the threshold), so it is computed before layout and says in advance which nodes are never drawn; chip anchors need geometry and are built after layout by
 * `computeTopologyClusterState`. `expandedParents` is treated as empty: the world is built only when the graph changes, and children revealed by an expansion carry seed coordinates.
 */
export function computeRelaxScope(layoutInput: readonly LayoutGraphNode[]): ReadonlySet<string> {
  const childrenByParent = new Map<string, string[]>();
  for (const n of layoutInput) {
    if (n.parentId === null) continue;
    const siblings = childrenByParent.get(n.parentId);
    if (siblings) siblings.push(n.id);
    else childrenByParent.set(n.parentId, [n.id]);
  }
  const kindById = new Map(layoutInput.map((n) => [n.id, n.kind as string]));
  const { clusteredIds } = computeDensityGate({
    childrenByParent,
    expandedParents: EMPTY_EXPANDED_PARENTS,
    // Chip anchors are not used here — only `clusteredIds` is needed, and that is geometry-independent.
    parentGeometry: EMPTY_PARENT_GEOMETRY,
    kindOf: (id) => kindById.get(id),
  });
  const scope = new Set<string>();
  for (const n of layoutInput) if (!clusteredIds.has(n.id)) scope.add(n.id);
  return scope;
}
