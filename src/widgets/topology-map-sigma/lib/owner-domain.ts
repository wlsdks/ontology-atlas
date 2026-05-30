import type Graph from 'graphology';

/**
 * ontology 노드의 소유 domain 라벨 — hover tooltip / 노드 detail 에서 "이 노드가
 * 어느 비즈니스 영역(domain)에 속하나" 를 보여주기 위함(wedge: 사람이 도메인을
 * 한눈에).
 *
 * domain 은 KnowledgeGraphNode 의 필드가 아니라 edge(domain → node, 보통
 * contains)로 표현되므로, in-neighbor 중 kind 가 domain 인 첫 노드의 label 을
 * 돌려준다. project 노드는 `extractDomainLabel` 을 쓰므로 이 함수는 ontology
 * 노드용. 없으면(domain 미배정·domain 노드 자신) null.
 *
 * 순수 함수 — graphology 그래프만 읽는다. 단위 테스트로 고정.
 */
export function resolveOwnerDomainLabel<
  N extends { ontologyTopKind?: string; label?: string },
>(graph: Graph<N>, nodeId: string): string | null {
  if (!graph.hasNode(nodeId)) return null;
  // domain 노드 자신은 소유 domain 이 없다 — domain↔domain inter-edge(coupling)
  // 를 owner 로 오인하지 않도록 여기서 막는다.
  if (graph.getNodeAttribute(nodeId, 'ontologyTopKind') === 'domain') return null;
  let result: string | null = null;
  graph.forEachInNeighbor(nodeId, (_neighborId, attrs) => {
    if (result !== null) return;
    if (attrs.ontologyTopKind === 'domain' && typeof attrs.label === 'string') {
      result = attrs.label;
    }
  });
  return result;
}
