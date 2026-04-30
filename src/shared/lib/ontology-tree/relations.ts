import type { KnowledgeGraphEdge, KnowledgeGraphNode } from "@/entities/knowledge-graph";

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

export interface StrongEdgeRow {
  edge: KnowledgeGraphEdge;
  /** evidenceCount fallback evidenceIds.length. */
  evidence: number;
  /** 호출자가 nodes 매핑 후 채울 수 있는 양 끝 node title. resolveNodeTitle 헬퍼. */
  fromTitle: string | null;
  toTitle: string | null;
  /**
   * UX-15: from/to 노드의 projectIds 가 disjoint 하면 cross-project 관계.
   * 운영 D-cont-1 시드된 reactor-admin → reactor 같은 의존을 같은 type
   * 안에서 부각시키는 시각 분기 hook. 한 쪽이라도 projectIds 가 비면
   * false (정보 부족 → 안전 폴백).
   */
  isCrossProject: boolean;
}

/**
 * 가장 강한 관계 top N — `evidenceCount` (없으면 `evidenceIds.length`) 내림차순.
 *
 * "이 ontology 에서 가장 자주 등장하는 의미 관계" 식별. 같은 evidence 면
 * type 알파벳 순 (안정 정렬).
 *
 * `nodes` 받아 양 끝 title 동시 resolve — UI 가 별도 lookup 안 하도록.
 */
export function selectStrongEdges(
  edges: readonly KnowledgeGraphEdge[],
  nodes: readonly KnowledgeGraphNode[],
  limit = 10,
): StrongEdgeRow[] {
  const titleById = new Map<string, string>();
  const projectIdsById = new Map<string, ReadonlyArray<string>>();
  for (const n of nodes) {
    titleById.set(n.id, n.title);
    projectIdsById.set(n.id, n.projectIds ?? []);
  }

  const rows: StrongEdgeRow[] = edges.map((edge) => ({
    edge,
    evidence: edge.evidenceCount ?? edge.evidenceIds.length,
    fromTitle: titleById.get(edge.from) ?? null,
    toTitle: titleById.get(edge.to) ?? null,
    isCrossProject: computeIsCrossProject(
      projectIdsById.get(edge.from),
      projectIdsById.get(edge.to),
    ),
  }));
  rows.sort((a, b) => {
    if (b.evidence !== a.evidence) return b.evidence - a.evidence;
    return a.edge.type.localeCompare(b.edge.type);
  });
  return rows.slice(0, limit);
}

/**
 * 두 노드의 projectIds 가 교집합 0 이면 cross-project. 한 쪽이라도 빈
 * 배열이면 false (정보 부족 시 안전 폴백 — 같은 프로젝트로 가정).
 */
export function isCrossProjectEdgeProjects(
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

// selectStrongEdges 내부 호출자 보존 (export 명 변경 후에도 동작).
const computeIsCrossProject = isCrossProjectEdgeProjects;

/**
 * UX-17: 전체 edges 중 cross-project (양 끝 노드의 projectIds 가 disjoint)
 * 개수. 인사이트 카드의 카운트 입력. selectStrongEdges 가 strong N 만
 * 처리하는 것과 달리 모든 edge 평가.
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
