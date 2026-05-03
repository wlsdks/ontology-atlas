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
