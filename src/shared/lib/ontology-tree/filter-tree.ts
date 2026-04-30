import type { OntologyTreeNode } from "./types";

/**
 * 트리에서 query 매치하는 노드만 남기되 **부모 chain 보존**.
 *
 * 매치 기준: node.title.lower-case includes query.lower-case (한·영 혼합 OK).
 * 매치 노드의 모든 조상은 무조건 살아남고 (트리 형태 유지), 형제 (매치 안 한)
 * 는 제외. 매치 노드의 자손은 모두 살림 (사용자가 컨텍스트 보길 기대).
 *
 * 빈 query (또는 trim 후 빈 문자열) 는 input roots 그대로 반환.
 *
 * 큰 트리에서 inline 검색 — `/ontology` 트리 위젯이 ⌘K 글로벌 검색과 별개로
 * 트리 안 빠른 좁히기에 사용.
 */
export function filterTreeByQuery(
  roots: readonly OntologyTreeNode[],
  query: string,
): OntologyTreeNode[] {
  const trimmed = query.trim().toLowerCase();
  if (trimmed === "") return roots.slice();

  function visit(node: OntologyTreeNode): OntologyTreeNode | null {
    const titleMatch = node.node.title.toLowerCase().includes(trimmed);
    const filteredChildren = node.children
      .map(visit)
      .filter((c): c is OntologyTreeNode => c !== null);

    if (titleMatch) {
      // 매치 노드 — 자손은 모두 keep (filtered 가 아니라 원본 children).
      return { ...node, children: node.children };
    }
    if (filteredChildren.length > 0) {
      // 자손 매치만 있음 — 이 노드는 부모 chain 으로만 남김 (subtitle 같은 시각).
      return { ...node, children: filteredChildren };
    }
    return null;
  }

  return roots
    .map(visit)
    .filter((n): n is OntologyTreeNode => n !== null);
}
