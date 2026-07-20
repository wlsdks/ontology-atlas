import type { KnowledgeGraphEdge, KnowledgeGraphNode } from "@/entities/knowledge-graph";
import { computeDomainCensusRows } from "@/shared/lib/ontology-tree";

/** 한 도메인의 용량 — containment 도달 가능 역량/요소 수 (단일 진실원 BFS). */
export interface DomainCapacityRow {
  id: string;
  title: string;
  capabilityCount: number;
  elementCount: number;
  total: number;
}

/**
 * insights 탭1 "도메인 용량" 카드의 진실원 — Guardian I-1 이후
 * `computeDomainCensusRows` (shared 그래프 BFS) 를 쓴다. 이전의
 * `buildOntologyTree` 서브트리 워크는 노드마다 부모를 하나만 배정해
 * 다중 부모 노드를 유실했다 (INDEX 96 vs /projects 106 분기의 원인).
 *
 * 결과는 total 내림차순 — 동률은 title 오름차순으로 결정론적.
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
