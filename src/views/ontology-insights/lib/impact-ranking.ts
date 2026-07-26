import type { KnowledgeGraphEdge, KnowledgeGraphNode } from "@/entities/knowledge-graph";
import { isEvidenceOnlyConcept } from "@/entities/knowledge-graph";
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
  /** 근거로만 적힌 이름(자기 문서 없음)인가 — 계층 판정. */
  evidenceOnly: boolean;
  /**
   * 볼트에 적힌 참조 원문 (`src/…/foo.test.ts`). 근거 계층 행에서만 쓴다 —
   * 서로 다른 파일이 같은 사람 이름으로 줄어드는 경우(`cli/src/integration.test.mjs`
   * 와 `mcp/src/integration.test.mjs` 가 둘 다 「Integration Test」)를 가른다.
   */
  ref?: string;
}

export interface ImpactRanking {
  /**
   * **개념 계층** — 자기 `.md` 를 가진 개념만. 결정 화면의 1급 시민이고,
   * 「바꾸면 멀리 퍼지는」이라는 위험도 질문이 성립하는 유일한 계층이다.
   */
  rows: ImpactRankingRow[];
  /** 개념 계층에서 파급이 1개 이상인 수 — 「상위 N / 전체 M」 절단 문구의 M. */
  rankedCount: number;
  /**
   * **근거 계층** — 다른 문서가 `elements:` 등에 이름만 적어 둔 파생 개념.
   * 지우지 않고 아래로 내린다: 개발자에게는 촘촘한 추적이 값이고, 「문서
   * 만들기」 승격 경로도 여기서만 보인다.
   */
  evidenceRows: ImpactRankingRow[];
  /** 근거 계층에서 참조가 1개 이상인 수. */
  evidenceRankedCount: number;
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
 *
 * ## 계층은 계산 뒤에서 갈린다 (2026-07-26)
 *
 * 파급 수는 **전체 그래프**에서 잰다. 파생 개념을 그래프에서 빼고 재면 같은
 * 개념의 수가 화면과 에이전트에서 달라지고, 그 순간 이 카드는 의사결정
 * 자료가 아니라 소음이 된다. 그래서 수는 손대지 않고 **줄만 두 계층으로
 * 나눈다** — 실측 결과 개념 계층 상위 12행의 수는 계층 분리 전후로 동일했다.
 *
 * 같은 수에 두 계층이 필요한 이유가 이 카드의 핵심 결함이었다. 근거 계층의
 * 15는 "바꾸면 위험"이 아니라 "15개 개념이 이 파일을 근거로 적었다"는 뜻이고,
 * 그게 테스트 파일이면 오히려 *지켜준다*는 신호다. 계산이 맞고 말이 틀린
 * 경우라서 계산이 아니라 계층별 문구를 고쳤다(카드의 캡션 참조).
 */
export function buildImpactRanking(
  nodes: readonly KnowledgeGraphNode[],
  edges: readonly KnowledgeGraphEdge[],
  limit: number,
  /**
   * 근거 계층에 펼쳐 보일 행 수.
   *
   * 4인 이유는 실측이다(1512×950, 도그푸드 289개념): 6행이면 펼친 「연결」 탭이
   * 1,151px(ko)·1,200px(en)로 스크롤 계약(1,120px)을 넘겼다. 4행이면 두 칸
   * 격자에서 두 줄이라 들어온다. 규모는 토글 라벨과 절단 문구가 그대로 말하고
   * 전체 목록은 지도·CLI 가 답하므로, 여기서 필요한 것은 "무엇이 강등됐는지"의
   * 표본이다 — 강등된 계층이 원래 계층(12행)보다 길면 그건 강등이 아니다.
   */
  evidenceLimit = 4,
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
      evidenceOnly: isEvidenceOnlyConcept(node),
      ref: node.ref,
    });
  }

  scored.sort(
    (a, b) => b.total - a.total || b.direct - a.direct || a.title.localeCompare(b.title),
  );

  const concepts = scored.filter((row) => !row.evidenceOnly);
  const evidence = scored.filter((row) => row.evidenceOnly);

  return {
    rows: concepts.slice(0, Math.max(0, limit)),
    rankedCount: concepts.length,
    evidenceRows: evidence.slice(0, Math.max(0, evidenceLimit)),
    evidenceRankedCount: evidence.length,
  };
}
