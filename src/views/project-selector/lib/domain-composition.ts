import type { KnowledgeGraphEdge, KnowledgeGraphNode } from "@/entities/knowledge-graph";
import { computeDomainCensusRows } from "@/shared/lib/ontology-tree";

export interface DomainCompositionRow {
  domainId: string;
  title: string;
  capabilityCount: number;
  elementCount: number;
  total: number;
}

/**
 * Per-domain capability/element composition — the /projects card's domain
 * rows (meter track + adjacent counts). Guardian I-1 이후 도메인 크기의
 * 단일 진실원은 `computeDomainCensusRows` (shared BFS) — 이 모듈은 표면
 * 계약(row shape + zero-row 생략)만 유지하는 얇은 어댑터다.
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
