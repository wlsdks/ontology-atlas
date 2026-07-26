import type { KnowledgeGraphEdge, KnowledgeGraphNode } from "@/entities/knowledge-graph";
import { computeDomainCouplingMatrix } from "@/shared/lib/ontology-tree";

/** 도메인 쌍 사이 실제 edge 하나 — 클릭-투-확인 예시 목록에 사용. */
export interface DomainCouplingExampleRow {
  id: string;
  fromId: string;
  fromTitle: string;
  toId: string;
  toTitle: string;
  type: string;
}

/** 도메인 A → 도메인 B 교차 연결 한 줄 — 카운트 내림차순 상위 N. */
export interface DomainCouplingPairRow {
  fromId: string;
  fromTitle: string;
  toId: string;
  toTitle: string;
  count: number;
  relationCounts: Array<{ type: string; count: number }>;
  examples: DomainCouplingExampleRow[];
}

/** 도메인 하나의 self(같은 도메인 안) vs cross(다른 도메인으로) 비중 — 경계 압력 신호. */
export interface DomainCouplingBoundaryRow {
  id: string;
  title: string;
  selfEdges: number;
  crossEdges: number;
  /** crossEdges / (crossEdges + selfEdges). edge 가 전혀 없으면 0. */
  crossRatio: number;
}

/** 히트그리드 한 축의 도메인. `index` 는 `cells` 의 행/열 번호. */
export interface DomainCouplingGridDomain {
  id: string;
  title: string;
}

/**
 * 도메인×도메인 히트그리드. `cells[from][to]` 는 그 방향의 연결 수이고,
 * 대각선(`from === to`)은 같은 도메인 안쪽 연결 수다.
 *
 * 리스트가 아니라 격자인 이유: 22개 쌍을 세로로 세우면 "어느 둘이 엮였나"를
 * 읽는 데 스크롤이 필요하고, 안 엮인 조합은 아예 보이지 않아 경계가 어디서
 * 끊겼는지 알 수 없다. 격자는 빈 칸도 사실로 보여준다.
 */
export interface DomainCouplingGrid {
  domains: DomainCouplingGridDomain[];
  cells: number[][];
  /** 대각선을 뺀 최대 셀 값 — 교차 채도 사다리의 기준. 0이면 교차가 없다. */
  maxCross: number;
  /**
   * 대각선(같은 도메인 안 연결)의 최대값 — **대각선만의** 무채색 사다리 기준.
   *
   * 교차와 같은 자를 쓰지 않는 이유: 두 값은 다른 것을 센다(안쪽 응집 vs 경계
   * 통과). 실측(2026-07-26 도그푸드)에서 안쪽 최대는 14, 교차 최대는 5였다 —
   * 한 자로 재면 대각선 전체가 최고 채도로 포화해 정작 이 카드의 질문인 교차
   * 신호가 사라진다. 그래서 척도를 둘로 두고, 대각선은 무채색 + 파선 테두리로
   * "다른 척도" 임을 색이 아닌 채널로 말한다.
   */
  maxSelf: number;
  /** 격자에 올린 도메인 수를 넘긴 전체 도메인 수 — 절단 문구용. */
  totalDomainCount: number;
  /** 격자 밖 도메인이 걸린 교차 관계 수. 0보다 크면 "격자 밖" 을 밝힌다. */
  hiddenCrossEdgeCount: number;
}

export interface DomainCouplingSummary {
  domainCount: number;
  crossDomainEdgeCount: number;
  /** 교차 도메인 쌍 전부 — 격자 칸을 눌렀을 때 펼칠 상세의 조회표. */
  pairs: DomainCouplingPairRow[];
  /** 서로 다른 도메인 쌍의 수. */
  totalPairCount: number;
  grid: DomainCouplingGrid;
  boundaries: DomainCouplingBoundaryRow[];
  /**
   * 연결이 하나라도 있는 도메인 수 — `boundaries` 가 상한에서 잘렸는지 판정한다.
   * 카드가 조용히 줄이지 않고 「상위 N / 전체 M」을 말할 수 있어야 한다.
   */
  boundaryTotalCount: number;
  /**
   * 콜드스타트(rank #10 계약) — 도메인이 2개 미만이거나 교차 도메인 edge 가
   * 0건이면 결합을 계산할 근거 자체가 없다. 카드가 빈/오해 소지 있는 표
   * 대신 명시적 empty-state 를 그려야 하는 신호.
   */
  isColdStart: boolean;
}

/**
 * `computeDomainCouplingMatrix` (shared/lib, 이미 MCP `domain_matrix` 와 같은
 * 계산) 를 이 탭이 그대로 그릴 수 있는 view row 로 재구성. 알고리즘은 건드리지
 * 않고 — 노드 제목 조회 + self/cross 비율 산술만 이 레이어에서 더한다
 * ("raw matrix → presentational row" 패턴).
 */
/**
 * 격자에 올릴 도메인 상한. 6×6 이면 14인치 풀스크린 카드 폭 안에서 셀 안
 * 숫자가 읽히는 마지막 크기다 — 더 넣으면 숫자가 아니라 색만 남고, 색만
 * 남으면 "몇 건인지"를 다시 물어야 한다.
 *
 * 절단 규칙: `computeDomainCouplingMatrix` 가 이미 교차 연결이 많은 순으로
 * 정렬해 둔 `domains` 의 앞에서 자른다 — 경계가 가장 시끄러운 도메인이
 * 남는다. 잘려나간 도메인이 걸린 교차 관계 수는 `hiddenCrossEdgeCount` 로
 * 따로 세어 화면이 조용히 줄이지 않게 한다.
 */
export const DOMAIN_GRID_LIMIT = 6;

export function buildDomainCouplingSummary(
  nodes: readonly KnowledgeGraphNode[],
  edges: readonly KnowledgeGraphEdge[],
  boundaryLimit = 6,
  gridLimit = DOMAIN_GRID_LIMIT,
): DomainCouplingSummary {
  // 격자는 상위 N 쌍이 아니라 **모든** 쌍이 필요하다(빈 칸도 사실이다).
  // `pairs` 도 이제 세로 목록이 아니라 칸→상세 조회표라 자르지 않는다.
  const matrix = computeDomainCouplingMatrix(nodes, edges, Number.MAX_SAFE_INTEGER);
  const nodeById = new Map(nodes.map((n) => [n.id, n]));
  const titleOf = (node: KnowledgeGraphNode) => node.display ?? node.title;

  const gridDomains = matrix.domains.slice(0, Math.max(0, gridLimit));
  const gridIndexById = new Map(gridDomains.map((row, index) => [row.domain.id, index] as const));
  const cells: number[][] = gridDomains.map(() => gridDomains.map(() => 0));
  let maxSelf = 0;
  for (const [index, row] of gridDomains.entries()) {
    cells[index][index] = row.selfEdges;
    maxSelf = Math.max(maxSelf, row.selfEdges);
  }
  let maxCross = 0;
  let hiddenCrossEdgeCount = 0;
  for (const conn of matrix.connections) {
    const from = gridIndexById.get(conn.from.id);
    const to = gridIndexById.get(conn.to.id);
    if (from === undefined || to === undefined) {
      hiddenCrossEdgeCount += conn.count;
      continue;
    }
    cells[from][to] += conn.count;
    maxCross = Math.max(maxCross, cells[from][to]);
  }

  const pairs: DomainCouplingPairRow[] = matrix.connections.map((conn) => ({
    fromId: conn.from.id,
    fromTitle: titleOf(conn.from),
    toId: conn.to.id,
    toTitle: titleOf(conn.to),
    count: conn.count,
    relationCounts: conn.relationCounts,
    examples: conn.examples.map((edge) => buildExampleRow(edge, nodeById)),
  }));

  const connectedDomains = matrix.domains.filter(
    (row) => row.outgoing + row.incoming + row.selfEdges > 0,
  );
  // 두 단계를 일부러 나눈다.
  //
  // **고르기는 교차 물량 순**(`matrix.domains` 가 이미 그 순서다) — 비중으로
  // 골라 버리면 교차 1건·안쪽 0건인 작은 도메인이 100% 로 상한을 다 차지하고
  // 실제로 경계가 새는 큰 도메인이 목록에서 밀려난다.
  //
  // **보이기는 교차 비중 순** — 이 카드의 캡션이 읽으라고 하는 신호가 비중이고,
  // 막대도 비중을 그린다. 총량 순으로 세워 두면 캡션이 가리키는 순위와 화면
  // 순위가 어긋난다(2026-07-26 실측: 비중 100% 인 도메인이 다섯 번째 막대였다).
  // 동률은 총량 큰 쪽 먼저 — 같은 비중이면 물량이 큰 쪽이 먼저 볼 일이다.
  const boundaries: DomainCouplingBoundaryRow[] = connectedDomains
    .slice(0, boundaryLimit)
    .map((row) => {
      const crossEdges = row.outgoing + row.incoming;
      const total = crossEdges + row.selfEdges;
      return {
        id: row.domain.id,
        title: titleOf(row.domain),
        selfEdges: row.selfEdges,
        crossEdges,
        crossRatio: total > 0 ? crossEdges / total : 0,
      };
    })
    .sort(
      (a, b) =>
        b.crossRatio - a.crossRatio ||
        b.crossEdges + b.selfEdges - (a.crossEdges + a.selfEdges) ||
        a.title.localeCompare(b.title),
    );

  return {
    domainCount: matrix.domainCount,
    crossDomainEdgeCount: matrix.crossDomainEdgeCount,
    pairs,
    totalPairCount: matrix.totalConnectionCount,
    grid: {
      domains: gridDomains.map((row) => ({ id: row.domain.id, title: titleOf(row.domain) })),
      cells,
      maxCross,
      maxSelf,
      totalDomainCount: matrix.domainCount,
      hiddenCrossEdgeCount,
    },
    boundaries,
    boundaryTotalCount: connectedDomains.length,
    isColdStart: matrix.domainCount < 2 || matrix.crossDomainEdgeCount === 0,
  };
}

function buildExampleRow(
  edge: KnowledgeGraphEdge,
  nodeById: ReadonlyMap<string, KnowledgeGraphNode>,
): DomainCouplingExampleRow {
  const from = nodeById.get(edge.from);
  const to = nodeById.get(edge.to);
  return {
    id: edge.id,
    fromId: edge.from,
    fromTitle: (from?.display ?? from?.title) ?? edge.from,
    toId: edge.to,
    toTitle: (to?.display ?? to?.title) ?? edge.to,
    type: edge.type,
  };
}
