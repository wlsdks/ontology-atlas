import type { KnowledgeGraphEdge, KnowledgeGraphNode } from "@/entities/knowledge-graph";

/** 한 (from, to) 쌍의 depends_on 관계 — 같은 쌍에 중복 edge 가 있으면 합산. */
export interface DependsOnPairRow {
  fromId: string;
  fromTitle: string;
  toId: string;
  toTitle: string;
  count: number;
}

/**
 * 탭2 "가장 많이 기대는 곳" — 실제 `depends_on` 엣지를 (from,to) 쌍으로 묶어
 * count 내림차순 상위 N 개만 반환. 존재하지 않는 노드를 가리키는 edge 는
 * 제외(방어적) — vault frontmatter 오류로 인한 dangling edge 는 실제로
 * 나타날 수 있음.
 */
export function buildDependsOnRows(
  nodes: readonly KnowledgeGraphNode[],
  edges: readonly KnowledgeGraphEdge[],
  limit = 5,
): DependsOnPairRow[] {
  const nodeById = new Map(nodes.map((n) => [n.id, n]));
  const byPair = new Map<string, DependsOnPairRow>();

  for (const edge of edges) {
    if (edge.type !== "depends_on") continue;
    const from = nodeById.get(edge.from);
    const to = nodeById.get(edge.to);
    if (!from || !to) continue;
    const key = `${from.id}->${to.id}`;
    const existing = byPair.get(key);
    if (existing) {
      existing.count += 1;
    } else {
      byPair.set(key, {
        fromId: from.id,
        fromTitle: from.title,
        toId: to.id,
        toTitle: to.title,
        count: 1,
      });
    }
  }

  return Array.from(byPair.values())
    .sort((a, b) => b.count - a.count || a.fromTitle.localeCompare(b.fromTitle))
    .slice(0, limit);
}
