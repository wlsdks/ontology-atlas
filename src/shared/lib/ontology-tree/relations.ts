import type {
  KnowledgeGraphEdge,
  KnowledgeGraphNode,
} from "@/entities/knowledge-graph";

/**
 * edge type 별 카운트. 입력 순서 보존 — UI 가 KNOWLEDGE_EDGE_TYPES 정렬 적용 가능.
 */
export function computeEdgeTypeDistribution(
  edges: readonly KnowledgeGraphEdge[],
): Map<string, number> {
  const map = new Map<string, number>();
  for (const e of edges) {
    map.set(e.type, (map.get(e.type) ?? 0) + 1);
  }
  return map;
}

/**
 * 두 노드의 projectIds 가 교집합 0 이면 cross-project. 한 쪽이라도 빈
 * 배열이면 false (정보 부족 시 안전 폴백 — 같은 프로젝트로 가정).
 *
 * 외부 호출자 없음 — countCrossProjectEdges 의 내부 helper. 외부 노출
 * 필요해지면 export 재추가 후 index.ts barrel 도 같이 갱신.
 */
function isCrossProjectEdgeProjects(
  fromProjects: ReadonlyArray<string> | undefined,
  toProjects: ReadonlyArray<string> | undefined,
): boolean {
  if (!fromProjects || !toProjects) return false;
  if (fromProjects.length === 0 || toProjects.length === 0) return false;
  const fromSet = new Set(fromProjects);
  for (const p of toProjects) {
    if (fromSet.has(p)) return false;
  }
  return true;
}

/**
 * 전체 edges 중 cross-project (양 끝 노드의 projectIds 가 disjoint) 개수.
 * 인사이트 카드의 카운트 입력.
 */
export function countCrossProjectEdges(
  edges: readonly KnowledgeGraphEdge[],
  nodes: readonly KnowledgeGraphNode[],
): number {
  const projectIdsById = new Map<string, ReadonlyArray<string>>();
  for (const n of nodes) projectIdsById.set(n.id, n.projectIds ?? []);
  let count = 0;
  for (const e of edges) {
    if (
      isCrossProjectEdgeProjects(
        projectIdsById.get(e.from),
        projectIdsById.get(e.to),
      )
    ) {
      count += 1;
    }
  }
  return count;
}

/** 구조(containment) 관계 타입 — domain 계층(project→domain→capability→element). */
const CONTAINMENT_RELATION_TYPES = new Set(["contains", "belongs_to"]);

/**
 * edge type 이 구조(containment) edge 인가 — `contains` / `belongs_to`.
 * 의존(dependency)·연관(soft) edge 와 구별해 다뤄야 하는 곳(coupling 제외,
 * projectIds BFS, 토폴로지 edge kind, 시각그래프 필터)의 단일 source. 이전엔
 * `type === 'contains' || type === 'belongs_to'` 가 4곳에 흩어져 있어 새 구조
 * 타입 추가 시 누락 위험이 있었다.
 */
export function isContainmentRelation(type: string): boolean {
  return CONTAINMENT_RELATION_TYPES.has(type);
}

/**
 * 방향이 **없는**(대칭) 관계 타입 — "비슷한 것" 처럼 양끝이 대등하다.
 *
 * `derive-ontology-from-vault.ts` 는 프론트매터 `relates:` 를 `related_to` 로
 * 내고, MCP/스키마 쪽은 키 이름 `relates` 를 그대로 쓴다. 두 철자를 모두 담아
 * 어느 경로로 들어와도 같은 판정을 받게 한다.
 */
const SYMMETRIC_RELATION_TYPES = new Set(["related_to", "relates"]);

/**
 * 이 관계에 **방향이 있는가** — 지도가 방향 테이퍼(source 굵 → target 얇)를
 * 그려도 되는가의 단일 출처.
 *
 * 왜 필요한가: 토폴로지 어댑터가 `isContainmentRelation ? "contains" :
 * "depends"` 로 2치 분류를 하는데, 그 "depends" 에 `related_to`(대칭)까지
 * 섞여 들어와 **없는 방향을 그리고 있었다**. dogfood 실측(2026-07-31):
 * containment 밖 관계 89개 중 `related_to` 가 **62개(70%)** — 관계선의
 * 대다수가 거짓 인과를 주장한 셈이다.
 *
 * 기본값은 "방향 있음" 이다 — 모르는 타입은 종전 렌더를 유지해, 새 관계
 * 타입이 생겨도 조용히 대칭으로 강등되지 않는다.
 */
export function isDirectionalRelation(type: string): boolean {
  return !SYMMETRIC_RELATION_TYPES.has(type);
}
