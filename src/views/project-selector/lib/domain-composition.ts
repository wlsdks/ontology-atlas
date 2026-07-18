import type { KnowledgeGraphEdge, KnowledgeGraphNode } from "@/entities/knowledge-graph";
import { isContainmentRelation } from "@/shared/lib/ontology-tree";

export interface DomainCompositionRow {
  domainId: string;
  title: string;
  capabilityCount: number;
  elementCount: number;
  total: number;
}

/**
 * Per-domain capability/element composition — the /projects card's domain
 * rows (meter track + adjacent counts). Walks `contains`/`belongs_to` edges
 * (normalized to parent→child, same convention as
 * `derivationToInsight`'s project-stamping BFS) from each `domain` node and
 * buckets descendants by kind. Domains with zero descendants are omitted —
 * an empty meter row communicates nothing.
 */
export function buildDomainCompositionRows(
  nodes: readonly KnowledgeGraphNode[],
  edges: readonly KnowledgeGraphEdge[],
): DomainCompositionRow[] {
  const nodeById = new Map(nodes.map((n) => [n.id, n]));
  const childrenOf = new Map<string, string[]>();

  for (const edge of edges) {
    if (!isContainmentRelation(edge.type)) continue;
    const [parent, child] = edge.type === "contains" ? [edge.from, edge.to] : [edge.to, edge.from];
    if (!nodeById.has(parent) || !nodeById.has(child)) continue;
    const arr = childrenOf.get(parent);
    if (arr) arr.push(child);
    else childrenOf.set(parent, [child]);
  }

  const rows: DomainCompositionRow[] = [];

  for (const domain of nodes) {
    if (domain.kind !== "domain") continue;

    let capabilityCount = 0;
    let elementCount = 0;
    const visited = new Set<string>([domain.id]);
    const queue: string[] = [domain.id];
    let head = 0;
    while (head < queue.length) {
      const current = queue[head++];
      const children = childrenOf.get(current);
      if (!children) continue;
      for (const child of children) {
        if (visited.has(child)) continue;
        visited.add(child);
        queue.push(child);
        const childNode = nodeById.get(child);
        if (childNode?.kind === "capability") capabilityCount += 1;
        else if (childNode?.kind === "element") elementCount += 1;
      }
    }

    const total = capabilityCount + elementCount;
    if (total === 0) continue;
    rows.push({ domainId: domain.id, title: domain.title, capabilityCount, elementCount, total });
  }

  return rows.sort((a, b) => b.total - a.total);
}
