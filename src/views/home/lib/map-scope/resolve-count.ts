import { extractRealmSubtree, type OntologyMapEdge, type OntologyMapNode } from "@/widgets/ontology-map";

/** O(N + E), using every containment edge as the renderer does, including shared children. */
export function resolveMapScopeCount(
  nodes: readonly Pick<OntologyMapNode, "id">[],
  edges: readonly Pick<OntologyMapEdge, "source" | "target" | "kind">[],
  rootId: string | null,
): number | null {
  if (rootId === null) return nodes.length;
  const known = new Set(nodes.map(node => node.id));
  if (!known.has(rootId)) return null;
  const children = new Map<string, string[]>();
  for (const edge of edges) {
    if (edge.kind !== "contains" || !known.has(edge.source) || !known.has(edge.target)) continue;
    const list = children.get(edge.source);
    if (list) list.push(edge.target);
    else children.set(edge.source, [edge.target]);
  }
  return extractRealmSubtree(rootId, children).memberIds.size;
}
