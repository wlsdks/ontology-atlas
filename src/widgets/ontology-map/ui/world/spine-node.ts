import type { WorldNode } from "./topology-world";

/**
 * A "spine" node is one shown at the overview entry (tier alpha 1 at zoom ratio 1): the project root, every domain and any hub node. It MUST mirror `nodeTierAlpha`'s
 * always-visible branch in `tier-visibility.ts`, or the fit and the visible set drift apart. The density gate can still fold a hub behind a crowded parent's chip (`computeDrawnSpineBounds` accounts for it).
 */
export function isSpineNode(node: Pick<WorldNode, "kind" | "isHub">): boolean {
  return node.isHub || node.kind === "project" || node.kind === "domain";
}
