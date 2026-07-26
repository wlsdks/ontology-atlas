import type { KnowledgeGraphEdge, KnowledgeGraphNode } from "@/entities/knowledge-graph";
import {
  IMPACT_EXCLUDED_RELATION_TYPES,
  buildOntologyReachability,
  computeOntologyDependents,
} from "@/shared/lib/ontology-tree";

export interface ImpactRankingRow {
  id: string;
  title: string;
  kind: string;
  /** 바로 이어진 것 — 이 개념을 직접 가리키는 개념 수(1홉). */
  direct: number;
  /** 바로 + 건너서 닿는 것 전부 — 이 개념을 바꾸면 다시 확인해야 하는 개념 수. */
  total: number;
}

export interface ImpactRanking {
  rows: ImpactRankingRow[];
  /** 파급이 1개 이상인 개념 수 — 「상위 N / 전체 M」 절단 문구의 M. */
  rankedCount: number;
}

/**
 * "이걸 바꾸면 어디까지 깨지나" 랭킹 — 각 개념을 (직접·간접) 가리키는 개념
 * 수의 내림차순.
 *
 * 계산을 새로 짜지 않고 `computeOntologyDependents` / `buildOntologyReachability`
 * 를 그대로 부른다. 그 함수들이 MCP `query_ontology({operation:"blast_radius",
 * direction:"incoming"})` 와 같은 의미론(역방향 전이 도달, soft association
 * 제외)의 단일 진실원이라, 화면이 말하는 수와 에이전트가 답하는 수가 갈라질
 * 수 없다 — 갈라지면 `tests/contract/impact-ranking.contract.test.ts` 가 잡는다.
 *
 * `related_to` / `describes` 를 빼는 이유는 `IMPACT_EXCLUDED_RELATION_TYPES` 의
 * 주석에 있다: 연관 웹이 거의 모든 개념을 이어 랭킹이 변별력을 잃는다.
 */
export function buildImpactRanking(
  nodes: readonly KnowledgeGraphNode[],
  edges: readonly KnowledgeGraphEdge[],
  limit: number,
): ImpactRanking {
  const scored: ImpactRankingRow[] = [];
  for (const node of nodes) {
    const total = computeOntologyDependents(node.id, nodes, edges);
    if (total === 0) continue;
    // 같은 필터·같은 방향에서 깊이만 1로 잘라 "바로 이어진 것"을 얻는다 —
    // 인접 목록을 따로 세면 두 수가 서로 다른 규칙을 쓰게 된다.
    const direct = buildOntologyReachability(node.id, nodes, edges, {
      direction: "incoming",
      depth: 1,
      limit: 1,
      excludeTypes: IMPACT_EXCLUDED_RELATION_TYPES,
    }).summary.reachableNodes;
    scored.push({
      id: node.id,
      title: node.display ?? node.title,
      kind: node.kind,
      direct,
      total,
    });
  }

  scored.sort(
    (a, b) => b.total - a.total || b.direct - a.direct || a.title.localeCompare(b.title),
  );

  return {
    rows: scored.slice(0, Math.max(0, limit)),
    rankedCount: scored.length,
  };
}
