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

export interface DomainCouplingSummary {
  domainCount: number;
  crossDomainEdgeCount: number;
  pairs: DomainCouplingPairRow[];
  /** `pairs` 가 limit 으로 잘리기 전 전체 pair 수 — silent cap 회피. */
  totalPairCount: number;
  boundaries: DomainCouplingBoundaryRow[];
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
export function buildDomainCouplingSummary(
  nodes: readonly KnowledgeGraphNode[],
  edges: readonly KnowledgeGraphEdge[],
  pairLimit = 8,
  boundaryLimit = 6,
): DomainCouplingSummary {
  const matrix = computeDomainCouplingMatrix(nodes, edges, pairLimit);
  const nodeById = new Map(nodes.map((n) => [n.id, n]));
  const titleOf = (node: KnowledgeGraphNode) => node.display ?? node.title;

  const pairs: DomainCouplingPairRow[] = matrix.connections.map((conn) => ({
    fromId: conn.from.id,
    fromTitle: titleOf(conn.from),
    toId: conn.to.id,
    toTitle: titleOf(conn.to),
    count: conn.count,
    relationCounts: conn.relationCounts,
    examples: conn.examples.map((edge) => buildExampleRow(edge, nodeById)),
  }));

  const boundaries: DomainCouplingBoundaryRow[] = matrix.domains
    .filter((row) => row.outgoing + row.incoming + row.selfEdges > 0)
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
    });

  return {
    domainCount: matrix.domainCount,
    crossDomainEdgeCount: matrix.crossDomainEdgeCount,
    pairs,
    totalPairCount: matrix.totalConnectionCount,
    boundaries,
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
