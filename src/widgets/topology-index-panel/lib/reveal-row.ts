import type { OntologyTreeNode } from "@/entities/knowledge-graph";

/**
 * The rows above `nodeId` in the tree the INDEX draws, root first — the rows that must be open
 * for that row to be on screen. `[]` for a root row, `null` when the tree has no such row (a
 * filtered-out kind, or a tree that has not been built yet).
 *
 * It walks the INDEX's own tree rather than the map's containment edges: the tree reads
 * `contains` and `belongs_to` both and keeps the first of several parents
 * (`buildOntologyTree`), so only the tree knows which branch a row actually sits in.
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
