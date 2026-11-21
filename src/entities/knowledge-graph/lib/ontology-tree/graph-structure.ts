import type { KnowledgeGraphEdge, KnowledgeGraphNode } from "../../model";

/** Outgoing plus incoming, self-loops once; orphan edges ignored; every node present, degree 0 included. */
export function computeDegreeCentrality(
  nodes: readonly KnowledgeGraphNode[],
  edges: readonly KnowledgeGraphEdge[],
): Map<string, number> {
  const degrees = new Map<string, number>();
  for (const n of nodes) degrees.set(n.id, 0);
  for (const edge of edges) {
    const fromExists = degrees.has(edge.from);
    const toExists = degrees.has(edge.to);
    if (edge.from === edge.to) {
      if (fromExists) degrees.set(edge.from, (degrees.get(edge.from) ?? 0) + 1);
      continue;
    }
    if (fromExists) degrees.set(edge.from, (degrees.get(edge.from) ?? 0) + 1);
    if (toExists) degrees.set(edge.to, (degrees.get(edge.to) ?? 0) + 1);
  }
  return degrees;
}

/** `childId → parentId` over containment edges, first parent winning. */
export function buildContainmentParents(
  edges: readonly KnowledgeGraphEdge[],
  nodeById: ReadonlyMap<string, KnowledgeGraphNode>,
): Map<string, string> {
  const parentOf = new Map<string, string>();
  for (const edge of edges) {
    let parentId: string | undefined;
    let childId: string | undefined;
    if (edge.type === "contains") {
      parentId = edge.from;
      childId = edge.to;
    } else if (edge.type === "belongs_to") {
      parentId = edge.to;
      childId = edge.from;
    }
    if (!parentId || !childId) continue;
    if (!nodeById.has(parentId) || !nodeById.has(childId) || parentId === childId) continue;
    if (parentOf.has(childId)) continue;
    parentOf.set(childId, parentId);
  }
  return parentOf;
}

/** Nearest domain ancestor (a domain is its own); null without one or on a broken chain. */
export function nearestDomainId(
  node: KnowledgeGraphNode,
  parentOf: ReadonlyMap<string, string>,
  nodeById: ReadonlyMap<string, KnowledgeGraphNode>,
): string | null {
  if (node.kind === "domain") return node.id;
  const visited = new Set<string>([node.id]);
  let current = parentOf.get(node.id);
  while (current) {
    if (visited.has(current)) return null;
    visited.add(current);
    const parent = nodeById.get(current);
    if (!parent) return null;
    if (parent.kind === "domain") return parent.id;
    current = parentOf.get(current);
  }
  return null;
}

/** Newest `lastApprovedAt` first, then title; in vault mode the field is a sentinel, so nodes tie. */
export function selectRecentNodes(
  nodes: readonly KnowledgeGraphNode[],
  limit = 8,
): KnowledgeGraphNode[] {
  return [...nodes]
    .sort((a, b) => {
      const ta = a.lastApprovedAt.getTime();
      const tb = b.lastApprovedAt.getTime();
      if (tb !== ta) return tb - ta;
      return a.title.localeCompare(b.title);
    })
    .slice(0, limit);
}
