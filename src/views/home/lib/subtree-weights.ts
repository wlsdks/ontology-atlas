import { isContainmentRelation } from "@/entities/knowledge-graph";
import type { KnowledgeGraphEdge, KnowledgeGraphNode } from "@/entities/knowledge-graph";

/** Via `contains` forward and `belongs_to` reversed. */
function childrenByParent(edges: readonly KnowledgeGraphEdge[]): Map<string, string[]> {
  const children = new Map<string, string[]>();
  for (const edge of edges) {
    if (!isContainmentRelation(edge.type)) continue;
    const [parent, child] = edge.type === "belongs_to" ? [edge.to, edge.from] : [edge.from, edge.to];
    if (parent === child) continue;
    const list = children.get(parent);
    if (list) list.push(child);
    else children.set(parent, [child]);
  }
  return children;
}

function collectElementDescendants(
  slug: string,
  children: ReadonlyMap<string, readonly string[]>,
  kindBySlug: ReadonlyMap<string, string>,
  seen: Set<string>,
): string[] {
  const elements: string[] = [];
  for (const child of children.get(slug) ?? []) {
    if (seen.has(child)) continue;
    seen.add(child);
    if (kindBySlug.get(child) === "element") elements.push(child);
    elements.push(...collectElementDescendants(child, children, kindBySlug, seen));
  }
  return elements;
}

/**
 * The distinct elements each node contains, directly or transitively, which sizes its mark so the
 * overview shows where the system's weight sits. One DFS per node with its own visited set, each
 * level re-copying its child's elements: O(V × (V + E) + V² × h) for containment depth h, cubic on a
 * deep chain. Not memoised.
 */
export function computeSubtreeWeights(
  nodes: readonly KnowledgeGraphNode[],
  edges: readonly KnowledgeGraphEdge[],
): Map<string, number> {
  const children = childrenByParent(edges);
  const kindBySlug = new Map(nodes.map((node) => [node.id, node.kind]));
  const weightBySlug = new Map<string, number>();
  for (const node of nodes) {
    weightBySlug.set(node.id, collectElementDescendants(node.id, children, kindBySlug, new Set([node.id])).length);
  }
  return weightBySlug;
}
