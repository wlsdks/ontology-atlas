import type { KnowledgeGraphEdge, KnowledgeGraphNode } from "@/entities/knowledge-graph";
import { computeDomainCensusRows } from "@/entities/knowledge-graph";

/** One domain's capacity — capability/element counts reachable through containment (single-source BFS). */
export interface DomainCapacityRow {
  id: string;
  title: string;
  capabilityCount: number;
  elementCount: number;
  total: number;
}

/**
 * The source of truth for the "domain capacity" card on the insights overview tab. It uses
 * `computeDomainCensusRows` (the shared graph BFS). The earlier `buildOntologyTree` subtree walk
 * assigned each node exactly one parent and so lost multi-parent nodes — the cause of the INDEX 96
 * vs /projects 106 divergence.
 *
 * The result is sorted by total descending, with ties broken by title ascending for determinism.
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
