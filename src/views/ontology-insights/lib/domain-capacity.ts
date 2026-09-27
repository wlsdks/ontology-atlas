import type { KnowledgeGraphEdge, KnowledgeGraphNode } from "@/entities/knowledge-graph";
import { computeDomainCensusRows } from "@/entities/knowledge-graph";

/** One domain's capability and element counts reachable through containment. */
export interface DomainCapacityRow {
  id: string;
  title: string;
  capabilityCount: number;
  elementCount: number;
  total: number;
}

/**
 * Rows for the domain capacity card via `computeDomainCensusRows` (shared graph BFS), which counts multi-parent
 * nodes under every domain that holds them; a single-parent tree walk dropped them. Sorted by total descending,
 * then title.
 */
export function computeDomainCapacityRows(
  nodes: readonly KnowledgeGraphNode[],
  edges: readonly KnowledgeGraphEdge[],
): DomainCapacityRow[] {
  return computeDomainCensusRows(nodes, edges, ["domain"]).map((row) => ({
    id: row.id,
    title: row.title,
    capabilityCount: row.capabilityCount,
    elementCount: row.elementCount,
    total: row.total,
  }));
}
