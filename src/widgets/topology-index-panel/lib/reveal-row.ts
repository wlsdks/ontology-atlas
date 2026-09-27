import type { OntologyTreeNode } from "@/entities/knowledge-graph";

/**
 * The rows above `nodeId` in the INDEX tree, root first; `[]` for a root, `null` when the row is
 * absent. Walks the INDEX's own tree, which keeps the first of several parents
 * (`buildOntologyTree`), not the map's containment edges.
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
