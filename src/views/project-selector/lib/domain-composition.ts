import type { KnowledgeGraphEdge, KnowledgeGraphNode } from "@/entities/knowledge-graph";
import { computeDomainCensusRows } from "@/entities/knowledge-graph";

export interface DomainCompositionRow {
  domainId: string;
  title: string;
  capabilityCount: number;
  elementCount: number;
  total: number;
}

/**
 * Per-domain capability/element composition — the `/projects` card's domain rows (meter track plus
 * adjacent counts). The single source of truth for domain size is `computeDomainCensusRows` (the shared
 * BFS); this module is a thin adapter keeping only the surface contract (row shape and omitting zero rows).
 */
export function buildDomainCompositionRows(
  nodes: readonly KnowledgeGraphNode[],
  edges: readonly KnowledgeGraphEdge[],
): DomainCompositionRow[] {
  return computeDomainCensusRows(nodes, edges, ["domain"])
    .filter((row) => row.total > 0)
    .map((row) => ({
      domainId: row.id,
      title: row.title,
      capabilityCount: row.capabilityCount,
      elementCount: row.elementCount,
      total: row.total,
    }));
}
