import { flattenTree, type OntologyTreeNode } from "@/entities/knowledge-graph";

/**
 * INDEX tree domain rows show a "Capability N · Element M" subcount + a proportional
 * capacity meter (docs/prototypes/hub-b3-immersive.html). Both derive from
 * the SAME `buildOntologyTree` result the rest of the app already trusts
 * (`@/entities/knowledge-graph/lib/ontology-tree`) — no bespoke recount, so these numbers can
 * never drift from the tree the row itself renders.
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

/** Clamped 0..1 ratio for the capacity meter's fill width. `maxCount <= 0`
 * (empty vault / single domain with no siblings to compare against) reads as
 * an empty meter rather than dividing by zero. */
export function computeCapacityRatio(count: number, maxCount: number): number {
  if (maxCount <= 0) return 0;
  return Math.min(1, Math.max(0, count / maxCount));
}

/** The meter's denominator — the largest domain's descendant count among
 * siblings, so the widest domain reads as a "full" bar and the rest scale
 * relative to it (matches the prototype's `MAXN` constant, computed instead
 * of hardcoded). */
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
