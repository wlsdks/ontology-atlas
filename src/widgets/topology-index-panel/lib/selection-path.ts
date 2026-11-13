import type { OntologyTreeNode } from "@/entities/knowledge-graph";

/**
 * The rows above `nodeId` in the INDEX tree, root first; `[]` for a root, `null` when the row is
 * absent. Walks the INDEX's own tree, which keeps the first of several parents
 * (`buildOntologyTree`), not the map's containment edges. O(rows).
 */
export function treeAncestorIds(roots: readonly OntologyTreeNode[], nodeId: string): string[] | null {
  const trail: string[] = [];
  const visit = (entry: OntologyTreeNode): boolean => {
    if (entry.node.id === nodeId) return true;
    trail.push(entry.node.id);
    for (const child of entry.children) if (visit(child)) return true;
    trail.pop();
    return false;
  };
  for (const root of roots) if (visit(root)) return trail;
  return null;
}

/**
 * The closed row that hides `nodeId`: the first ancestor, root first, the person has not opened.
 * Every row above it is open, so it is the nearest visible one. `null` when `nodeId` is itself
 * visible or absent from the tree. O(rows).
 */
export function closedAncestorHolding(
  roots: readonly OntologyTreeNode[],
  nodeId: string,
  isOpen: (rowId: string) => boolean,
): string | null {
  const ancestors = treeAncestorIds(roots, nodeId);
  return ancestors?.find((id) => !isOpen(id)) ?? null;
}
