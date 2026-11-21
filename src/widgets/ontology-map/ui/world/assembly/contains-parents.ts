import type { OntologyMapEdge, OntologyMapNode } from "../../OntologyMap";

/**
 * Each contained node's drawn parent id. A node is drawn under the last containment parent that keeps it in the domain the spine put it in.
 * `buildOntologyTree` keeps the first parent; keeping the last preserves the fans, but across a
 * domain boundary the map yields to the spine so the census count matches what a chip opens.
 */
export function resolveContainsParents(
  nodes: readonly Pick<OntologyMapNode, "id" | "kind">[],
  edges: readonly Pick<OntologyMapEdge, "kind" | "source" | "target">[]): Map<string, string> {
  const firstContainsParentById = new Map<string, string>();
  const lastContainsParentById = new Map<string, string>();
  for (const edge of edges) {
    if (edge.kind !== "contains") continue;
    if (edge.target === edge.source) continue;
    if (!firstContainsParentById.has(edge.target)) firstContainsParentById.set(edge.target, edge.source);
    lastContainsParentById.set(edge.target, edge.source);
  }
  const kindById = new Map(nodes.map((n) => [n.id, n.kind] as const));
  /** The domain the first-parent chain puts a node in, or null above/outside every domain. */
  const spineDomainOf = (id: string): string | null => {
    const seen = new Set<string>();
    let current: string | undefined = id;
    while (current !== undefined && !seen.has(current)) {
      if (kindById.get(current) === "domain") return current;
      seen.add(current);
      current = firstContainsParentById.get(current);
    }
    return null;
  };
  const containsParentById = new Map<string, string>();
  for (const [childId, firstParent] of firstContainsParentById) {
    const lastParent = lastContainsParentById.get(childId) ?? firstParent;
    containsParentById.set(
      childId,
      spineDomainOf(lastParent) === spineDomainOf(childId) ? lastParent : firstParent);
  }
  return containsParentById;
}
