import type { KnowledgeGraphEdge, KnowledgeGraphNode } from "@/entities/knowledge-graph";

/**
 * 정본 census — "개념 N개 · 관계 M개" 를 말하는 모든 표면의 단일 출처.
 *
 * P0c (2026-07-21): 같은 vault 를 두고 지도 294 · 인사이트 293 · 프로젝트
 * 288 · 빌더 102 로 표면마다 숫자가 달랐다 (페르소나 실측 N2). 원인 분해:
 * - 지도: `renderProjects.length + insight.nodes.length` — insight.nodes 에
 *   kind:project 가 이미 들어 있어 **이중 가산 버그** (+1).
 * - 인사이트: `insight.nodes.length` — 정직 (파생 전체 = 소스 노드 + 참조
 *   스텁).
 * - 프로젝트: meaningful kinds 필터 (project/document/vault-readme 제외).
 * - 빌더: 파일 기반 (kind: 를 가진 vault 문서 수 — 스텁 제외).
 *
 * 규칙: "개념" 이라는 단어를 쓰는 census 는 전부 이 함수를 쓴다. 다른
 * 스코프를 세는 표면(빌더의 저장된-문서 수 등)은 "개념" 이 아닌 정직한
 * 라벨을 붙인다 — 그래프 제품에서 표면 간 숫자 불일치는 신뢰를 직접
 * 깎는다는 것이 이 함수가 존재하는 이유다.
 */
export interface CanonicalCensus {
  conceptCount: number;
  relationCount: number;
}

export function computeCanonicalCensus(
  nodes: readonly KnowledgeGraphNode[],
  edges: readonly KnowledgeGraphEdge[],
): CanonicalCensus {
  return { conceptCount: nodes.length, relationCount: edges.length };
}
