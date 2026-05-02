import type { KnowledgeGraphEdge, KnowledgeGraphNode } from "@/entities/knowledge-graph";

/**
 * 노드의 kind 별 카운트 — UI 차트 / chip 에 사용. document / project 도 모두
 * 포함 (호출자가 필요시 필터). Map 의 입력 순서는 입력 nodes 순서.
 */
export function computeKindDistribution(
  nodes: readonly KnowledgeGraphNode[],
): Map<string, number> {
  const map = new Map<string, number>();
  for (const n of nodes) {
    map.set(n.kind, (map.get(n.kind) ?? 0) + 1);
  }
  return map;
}

/**
 * 노드별 degree — outgoing + incoming edge 의 합. self-loop 는 1 만 카운트.
 *
 * 입력 edges 가 미존재 노드 를 가리키더라도 노드 인덱스에 없으면 무시 (orphan
 * edge). 결과 Map 은 모든 입력 nodes 가 키로 들어감 (degree 0 도 포함) —
 * UI 가 zero-degree 도 표시할지 결정.
 */
export function computeDegreeCentrality(
  nodes: readonly KnowledgeGraphNode[],
  edges: readonly KnowledgeGraphEdge[],
): Map<string, number> {
  const degrees = new Map<string, number>();
  for (const n of nodes) degrees.set(n.id, 0);
  for (const edge of edges) {
    const fromExists = degrees.has(edge.from);
    const toExists = degrees.has(edge.to);
    if (edge.from === edge.to) {
      if (fromExists) degrees.set(edge.from, (degrees.get(edge.from) ?? 0) + 1);
      continue;
    }
    if (fromExists) degrees.set(edge.from, (degrees.get(edge.from) ?? 0) + 1);
    if (toExists) degrees.set(edge.to, (degrees.get(edge.to) ?? 0) + 1);
  }
  return degrees;
}

export interface OntologyDegreeRow {
  node: KnowledgeGraphNode;
  degree: number;
}

/**
 * degree 가 높은 순 top N 노드 — "이 ontology 의 허브" 식별. document / project
 * 는 기본 제외 (메타·구조 노드라 사용자 관심 단위가 아님). 호출자가 includeKinds
 * 로 override 가능.
 */
export function selectTopByDegree(
  nodes: readonly KnowledgeGraphNode[],
  edges: readonly KnowledgeGraphEdge[],
  limit = 8,
  options?: { includeKinds?: ReadonlyArray<string>; excludeKinds?: ReadonlyArray<string> },
): OntologyDegreeRow[] {
  const exclude = new Set(options?.excludeKinds ?? ["document", "project"]);
  const include = options?.includeKinds ? new Set(options.includeKinds) : null;
  const degrees = computeDegreeCentrality(nodes, edges);

  const rows: OntologyDegreeRow[] = [];
  for (const node of nodes) {
    if (include && !include.has(node.kind)) continue;
    if (exclude.has(node.kind)) continue;
    const degree = degrees.get(node.id) ?? 0;
    if (degree === 0) continue;
    rows.push({ node, degree });
  }
  rows.sort((a, b) => {
    if (b.degree !== a.degree) return b.degree - a.degree;
    return a.node.title.localeCompare(b.node.title);
  });
  return rows.slice(0, limit);
}

/**
 * 가장 최근 갱신된 N 노드 — `lastApprovedAt` 내림차순. 활동 feed 에 사용.
 * 같은 시각이면 title asc. document / project 도 포함 (활동의 한 면).
 *
 * 필드 이름은 v1 cloud LLM 워커 시점의 명명이지만, mission v2 에서는 단순
 * "마지막 쓰기 / 갱신 시각" — vault 모드는 sentinel 값이라 vault 노드끼리는 동률.
 */
export function selectRecentNodes(
  nodes: readonly KnowledgeGraphNode[],
  limit = 8,
): KnowledgeGraphNode[] {
  return [...nodes]
    .sort((a, b) => {
      const ta = a.lastApprovedAt.getTime();
      const tb = b.lastApprovedAt.getTime();
      if (tb !== ta) return tb - ta;
      return a.title.localeCompare(b.title);
    })
    .slice(0, limit);
}

export interface ActivityTimelineDay {
  /** ISO date `YYYY-MM-DD` (local) — sortable + display 둘 다. */
  date: string;
  count: number;
}

/**
 * 일별 노드 갱신 카운트 — 지난 N 일 (default 30, including 오늘) 활동 타임라인.
 *
 * 빈 날도 count=0 으로 포함 — UI bar chart 가 gap 없이 그릴 수 있게.
 * 정렬: date asc (오래된 → 최신, 좌→우 시각화).
 *
 * `now` 인자로 테스트 시간 고정 가능. vault 모드는 \`lastApprovedAt\` 이
 * sentinel 값이라 모든 vault 노드가 sentinel 날짜 한 칸에 모임.
 */
export function buildActivityTimeline(
  nodes: readonly KnowledgeGraphNode[],
  options?: { days?: number; now?: Date },
): ActivityTimelineDay[] {
  const days = options?.days ?? 30;
  const now = options?.now ?? new Date();
  // 오늘 자정 기준 (local) — 그 이전 N-1 일까지.
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startMs = today.getTime() - (days - 1) * 24 * 60 * 60 * 1000;

  // dateKey → count, 모든 N 일을 0 으로 prefill.
  const counts = new Map<string, number>();
  for (let i = 0; i < days; i += 1) {
    const d = new Date(startMs + i * 24 * 60 * 60 * 1000);
    counts.set(toLocalDateKey(d), 0);
  }

  for (const node of nodes) {
    const key = toLocalDateKey(node.lastApprovedAt);
    if (counts.has(key)) {
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
  }

  return Array.from(counts.entries()).map(([date, count]) => ({ date, count }));
}

function toLocalDateKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
