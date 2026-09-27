import { flattenTree, type OntologyTreeNode } from "@/entities/knowledge-graph";

/**
 * Domain row subcounts and capacity meter (docs/prototypes/hub-b3-immersive.html), derived from the
 * same `buildOntologyTree` result the row renders so the numbers cannot drift.
 */
export interface DomainSubcounts {
  /** Total descendant nodes (capabilities + elements, recursively) — the
   * engraved right-aligned total shown next to the domain title. */
  descendantCount: number;
  capabilityCount: number;
  elementCount: number;
}

export function computeDomainSubcounts(domain: OntologyTreeNode): DomainSubcounts {
  const descendants = flattenTree(domain.children);
  let capabilityCount = 0;
  let elementCount = 0;
  for (const entry of descendants) {
    if (entry.node.kind === "capability") capabilityCount += 1;
    else if (entry.node.kind === "element") elementCount += 1;
  }
  return { descendantCount: descendants.length, capabilityCount, elementCount };
}

/** Clamped 0..1 meter ratio; `maxCount <= 0` reads as empty rather than dividing by zero. */
export function computeCapacityRatio(count: number, maxCount: number): number {
  if (maxCount <= 0) return 0;
  return Math.min(1, Math.max(0, count / maxCount));
}

/** The meter denominator: the largest sibling domain's descendant count. */
export function computeMaxDomainDescendantCount(
  domains: readonly OntologyTreeNode[],
): number {
  let max = 0;
  for (const domain of domains) {
    const count = flattenTree(domain.children).length;
    if (count > max) max = count;
  }
  return max;
}
