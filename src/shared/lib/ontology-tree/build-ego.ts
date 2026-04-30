import type { KnowledgeGraphEdge, KnowledgeGraphNode } from "@/entities/knowledge-graph";
import type { OntologyEgoNeighbor, OntologyEgoSubgraph } from "./types";

export interface BuildOntologyEgoOptions {
  /**
   * center 로부터의 탐색 깊이. 1 = 직접 연결만 (기본, 기존 동작 호환), 2 = 한
   * 다리 건넌 이웃까지. 2-hop 시 노드 수가 폭증할 수 있어 호출자가 명시 토글.
   */
  hops?: 1 | 2;
}

/**
 * center 노드 ego subgraph — 1-hop (기본) 또는 2-hop.
 *
 * - self-loop (`from === to === centerId`) 는 제외 — center 자기 자신을 이웃으로 두지 않는다.
 * - 양방향 (같은 노드가 outgoing edge + incoming edge 둘 다) 은 두 entry 로 표시.
 *   사용자가 두 관계를 다른 것으로 보고 싶을 가능성이 높기 때문.
 * - 이웃 노드가 `nodes` 에 없는 경우 (데이터 누락 / stub 정리 직전 등) `node = null`,
 *   `neighborId` 는 보존해 UI 가 "ID only" 상태로 표시 가능.
 *
 * 2-hop 정책:
 * - 1-hop 에 이미 등장한 노드는 2-hop 에 다시 추가되지 않음 (시각 중복 회피).
 *   "더 가까운 hop 우선".
 * - center 자신을 가리키는 2-hop edge 는 제외 (cycle 방지).
 * - 1-hop 의 `node === null` (미존재) 인 stub placeholder 는 2-hop 탐색의
 *   pivot 으로 쓰지 않음 — 어차피 실 노드가 없어 from/to 매칭이 의미 없음.
 *
 * 정렬: hop=1 (outgoing → incoming) → hop=2. 같은 그룹 안은 입력 edges 순서.
 */
export function buildOntologyEgoSubgraph(
  centerId: string,
  nodes: readonly KnowledgeGraphNode[],
  edges: readonly KnowledgeGraphEdge[],
  options?: BuildOntologyEgoOptions,
): OntologyEgoSubgraph {
  const hops = options?.hops ?? 1;

  const nodeIndex = new Map<string, KnowledgeGraphNode>();
  for (const n of nodes) {
    nodeIndex.set(n.id, n);
  }

  const hop1Outgoing: OntologyEgoNeighbor[] = [];
  const hop1Incoming: OntologyEgoNeighbor[] = [];
  const hop1NodeIds = new Set<string>();

  for (const edge of edges) {
    const isOutgoing = edge.from === centerId;
    const isIncoming = edge.to === centerId;
    if (!isOutgoing && !isIncoming) continue;
    // self-loop 제외 — outgoing/incoming 모두 true 인 동시에 양 끝 같은 노드.
    if (isOutgoing && isIncoming) continue;

    const neighborId = isOutgoing ? edge.to : edge.from;
    const node = nodeIndex.get(neighborId) ?? null;
    const direction: OntologyEgoNeighbor["direction"] = isOutgoing
      ? "outgoing"
      : "incoming";

    (isOutgoing ? hop1Outgoing : hop1Incoming).push({
      node,
      neighborId,
      edge,
      direction,
      hop: 1,
    });
    hop1NodeIds.add(neighborId);
  }

  const neighbors: OntologyEgoNeighbor[] = [...hop1Outgoing, ...hop1Incoming];

  if (hops === 2) {
    // 2-hop: 각 1-hop 이웃에서 다시 BFS. center 와 hop1 에 이미 있는 노드는 제외.
    const seen2Hop = new Set<string>();
    for (const hop1 of [...hop1Outgoing, ...hop1Incoming]) {
      // null 노드 (미존재) 는 2-hop pivot 으로 쓰지 않음.
      if (!hop1.node) continue;
      const pivotId = hop1.neighborId;
      for (const edge of edges) {
        const isOutFromPivot = edge.from === pivotId;
        const isInToPivot = edge.to === pivotId;
        if (!isOutFromPivot && !isInToPivot) continue;
        // self-loop 제외.
        if (isOutFromPivot && isInToPivot) continue;
        const farId = isOutFromPivot ? edge.to : edge.from;
        // center 자신을 가리키는 edge 는 cycle, 제외.
        if (farId === centerId) continue;
        // 1-hop 에 이미 있는 노드는 더 가까운 hop 우선 — 2-hop 에 추가 안 함.
        if (hop1NodeIds.has(farId)) continue;
        // 2-hop 안에서 같은 (pivot, far, edge) 조합 중복 방지.
        const dedupKey = `${pivotId}:${edge.id}:${farId}`;
        if (seen2Hop.has(dedupKey)) continue;
        seen2Hop.add(dedupKey);

        const farNode = nodeIndex.get(farId) ?? null;
        const direction: OntologyEgoNeighbor["direction"] = isOutFromPivot
          ? "outgoing"
          : "incoming";
        neighbors.push({
          node: farNode,
          neighborId: farId,
          edge,
          direction,
          hop: 2,
          viaNeighborId: pivotId,
        });
      }
    }
  }

  return {
    centerId,
    neighbors,
  };
}
