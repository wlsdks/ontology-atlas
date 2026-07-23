import type { KnowledgeGraphNode } from "@/entities/knowledge-graph";
import type { OntologyTreeNode } from "./types";

/**
 * ontology 노드가 검색어에 매치되는지 — title 또는 id(kind:slug) 의 소문자
 * 포함. `query` 는 이미 trim + 소문자화된 값을 기대. 트리 필터/카운트(트리
 * 노드)와 orphan 필터(raw 노드)가 같은 매치 기준을 공유하도록 단일화.
 */
export function knowledgeNodeMatchesQuery(
  node: KnowledgeGraphNode,
  trimmedLowerQuery: string,
): boolean {
  if (trimmedLowerQuery === "") return false;
  return (
    node.title.toLowerCase().includes(trimmedLowerQuery)
    || node.id.toLowerCase().includes(trimmedLowerQuery)
  );
}

/**
 * query 에 실제로 매치되는 트리 노드 수 (조상만 살아남은 구조 노드는 제외).
 * 검색 결과 카운트 표시용 — filterTreeByQuery 와 같은 매치 기준.
 * 빈 query 면 0.
 */
export function countMatchingTreeNodes(
  roots: readonly OntologyTreeNode[],
  query: string,
): number {
  const trimmed = query.trim().toLowerCase();
  if (trimmed === "") return 0;
  let count = 0;
  const walk = (node: OntologyTreeNode): void => {
    if (knowledgeNodeMatchesQuery(node.node, trimmed)) count += 1;
    for (const child of node.children) walk(child);
  };
  for (const root of roots) walk(root);
  return count;
}

/**
 * 트리에서 query 매치하는 노드만 남기되 **부모 chain 보존**.
 *
 * 매치 기준: node.title 또는 node.id (kind:slug 형태) 의 lower-case includes
 * query.lower-case (한·영 혼합 OK). 개발자는 frontmatter / 코드에서 slug 를
 * 일상적으로 보기 때문에 'mcp-server' 같은 slug 검색이 빈 결과로 떨어지면
 * 안 된다.
 *
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
    const titleMatch = knowledgeNodeMatchesQuery(node.node, trimmed);
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

/**
 * 슬라이스 C (개발/비개발 모드 토글) — 지정한 `kind` 의 노드와 그 서브트리를
 * 통째로 제외한다. 비개발(일반) 모드의 INDEX 트리가 element 행을 기본
 * 숨기는 데 쓴다 — **데이터 무변경**: 이 함수는 원본 `roots`/그래프를
 * 건드리지 않고 표시용 파생 트리만 가지치기한다. 카운트/census 는 이 함수의
 * 출력이 아니라 전체 그래프에서 별도로 계산돼야 한다(호출자 책임 — 표시
 * 필터가 진실 숫자를 왜곡하면 안 된다).
 *
 * `filterTreeByQuery`/`filterTreeByNodeIds` 와 달리 조상 chain 을 "보존"하지
 * 않는다 — 제외 kind 자체가 조상이면(흔치 않지만) 그 서브트리 전체가
 * 사라진다. 순수 함수(입력 불변), 결정론적.
 */
export function filterTreeExcludeKind(
  roots: readonly OntologyTreeNode[],
  kind: string,
): OntologyTreeNode[] {
  function visit(node: OntologyTreeNode): OntologyTreeNode | null {
    if (node.node.kind === kind) return null;
    const filteredChildren = node.children
      .map(visit)
      .filter((c): c is OntologyTreeNode => c !== null);
    return { ...node, children: filteredChildren };
  }

  return roots
    .map(visit)
    .filter((n): n is OntologyTreeNode => n !== null);
}

/**
 * 트리에서 주어진 id 집합(`ids`)에 속한 노드만 남기되 **부모 chain 보존** —
 * "변경점만 보기"(B2) 의 트리 스코핑.
 *
 * `filterTreeByQuery` 와 알고리즘은 같지만 두 가지가 다르다:
 *   1. 매치 기준이 문자열 포함이 아니라 `ids.has(node.id)` (added|changed 노드).
 *   2. 매치 노드의 자손을 *전부* 살리지 않고 **매치된 자손만** 살린다 —
 *      변경 안 한 형제·자식을 노이즈로 끌고 오지 않게. 결과는 변경 노드 +
 *      그 조상 경로만 남은 최소 트리.
 *
 * 빈 `ids` 는 빈 배열 반환 (보여줄 변경점 없음 → 호출자가 hint 노출).
 */
export function filterTreeByNodeIds(
  roots: readonly OntologyTreeNode[],
  ids: ReadonlySet<string>,
): OntologyTreeNode[] {
  if (ids.size === 0) return [];

  function visit(node: OntologyTreeNode): OntologyTreeNode | null {
    const match = ids.has(node.node.id);
    const filteredChildren = node.children
      .map(visit)
      .filter((c): c is OntologyTreeNode => c !== null);

    // 변경 노드이거나(=match) 변경된 자손을 가진 조상이면 살린다. 두 경우
    // 모두 자손은 filtered (변경된 것만) — match 노드라도 변경 안 한 자식은 숨김.
    if (match || filteredChildren.length > 0) {
      return { ...node, children: filteredChildren };
    }
    return null;
  }

  return roots
    .map(visit)
    .filter((n): n is OntologyTreeNode => n !== null);
}
