/**
 * "영역 대장(Realm Ledger)" 파생 (S7, fable 설계).
 *
 * 영역 전개(`?realm=slug`) 중 좌측 패널이 전역 콘텐츠 대신 이 노드의 세계만
 * 보여줄 때 필요한 순수 파생 3종:
 *   1. `findRealmSubtree`   — 전체 트리에서 영역 루트 서브트리 하나를 집어낸다.
 *   2. `computeRealmCensus` — 그 서브트리의 요소/역량/도메인/깊이 통계.
 *   3. `computeRealmBoundary` — 영역 밖으로 나가는 관계(경계 엣지)와 각 밖
 *      노드로의 "이 영역으로 이동" 점프 대상(도메인급 상위 컨테이너).
 *
 * 모두 그래프(트리 노드 / 그래프 엣지 + 멤버 셋)만 입력받는 순수 함수라
 * 렌더 로직 없이 단독 테스트 가능하다. topology-map-v2 를 건드리지 않고
 * views/home 안에서 realm 데이터를 파생하기 위한 단일 진실원.
 */

import type { KnowledgeGraphEdge, KnowledgeGraphNode } from "@/entities/knowledge-graph";
import type { OntologyTreeNode } from "@/shared/lib/ontology-tree";
import { buildContainmentParents, nearestDomainId } from "@/shared/lib/ontology-tree";

export interface RealmCensus {
  /** 서브트리 안(루트 제외) element 노드 수. */
  elementCount: number;
  /** 서브트리 안(루트 제외) capability 노드 수. */
  capabilityCount: number;
  /** 서브트리 안(루트 제외) domain 노드 수. */
  domainCount: number;
  /** 루트를 뺀 전체 하위 노드 수. */
  descendantCount: number;
  /** 루트(0) 기준 가장 깊은 하위 노드까지의 상대 깊이. 자식만 있으면 1. */
  depth: number;
}

/** 결계 관계 한 줄 — 영역 안↔밖을 잇는 엣지 하나. */
export interface RealmBoundaryCrossing {
  edgeId: string;
  fromId: string;
  fromTitle: string;
  toId: string;
  toTitle: string;
  relationType: string;
  /** 이 엣지에서 영역 밖에 있는 끝점. */
  outsideId: string;
  /** "이 영역으로 이동" 대상 — 밖 노드의 도메인급 상위 컨테이너(없으면 밖 노드 자신). */
  jumpRealmId: string;
}

export interface RealmBoundary {
  total: number;
  crossings: RealmBoundaryCrossing[];
}

/**
 * 경계 판정에서 제외하는 구조 엣지. `contains`/`belongs_to` 는 트리 형태 자체를
 * 정의하므로(부모 컨테이너로의 링크) "바깥과 닿은 관계"의 신호가 아니다 —
 * 의존/사용/구현/근거 같은 lateral 관계만 남긴다.
 */
export const REALM_BOUNDARY_EXCLUDED_TYPES: ReadonlySet<string> = new Set([
  "contains",
  "belongs_to",
]);

function findInNode(node: OntologyTreeNode, id: string): OntologyTreeNode | null {
  if (node.node.id === id) return node;
  for (const child of node.children) {
    const found = findInNode(child, id);
    if (found) return found;
  }
  return null;
}

/** 전체 트리 roots 에서 `realmSlug` 노드 서브트리를 찾는다. 없으면 null. */
export function findRealmSubtree(
  roots: readonly OntologyTreeNode[],
  realmSlug: string,
): OntologyTreeNode | null {
  for (const root of roots) {
    const found = findInNode(root, realmSlug);
    if (found) return found;
  }
  return null;
}

/** 영역 서브트리의 요소/역량/도메인/깊이 census. 루트 자신은 세지 않는다. */
export function computeRealmCensus(subtree: OntologyTreeNode): RealmCensus {
  let elementCount = 0;
  let capabilityCount = 0;
  let domainCount = 0;
  let descendantCount = 0;
  let depth = 0;

  const walk = (node: OntologyTreeNode, relDepth: number): void => {
    if (relDepth > 0) {
      descendantCount += 1;
      if (relDepth > depth) depth = relDepth;
      if (node.node.kind === "element") elementCount += 1;
      else if (node.node.kind === "capability") capabilityCount += 1;
      else if (node.node.kind === "domain") domainCount += 1;
    }
    for (const child of node.children) walk(child, relDepth + 1);
  };
  walk(subtree, 0);

  return { elementCount, capabilityCount, domainCount, descendantCount, depth };
}

/** 서브트리 전체(루트 포함) 노드 id 집합 — 경계 엣지 판정의 멤버 셋. */
export function collectRealmMemberIds(subtree: OntologyTreeNode): Set<string> {
  const ids = new Set<string>();
  const walk = (node: OntologyTreeNode): void => {
    ids.add(node.node.id);
    for (const child of node.children) walk(child);
  };
  walk(subtree);
  return ids;
}

/**
 * 영역 밖으로 나가는 관계(경계 엣지)를 파생한다. 정확히 한 끝점만 멤버 셋에
 * 속한 엣지 = 경계. 구조 엣지(contains/belongs_to)와 미해결 끝점은 제외한다.
 * 결과는 결정론적으로 정렬(관계타입 → from → to → edgeId)된다.
 */
export function computeRealmBoundary(input: {
  edges: readonly KnowledgeGraphEdge[];
  memberIds: ReadonlySet<string>;
  nodeById: ReadonlyMap<string, KnowledgeGraphNode>;
}): RealmBoundary {
  const { edges, memberIds, nodeById } = input;
  const parentOf = buildContainmentParents(edges, nodeById);
  const crossings: RealmBoundaryCrossing[] = [];
  const seen = new Set<string>();

  for (const edge of edges) {
    if (REALM_BOUNDARY_EXCLUDED_TYPES.has(edge.type)) continue;
    const fromInside = memberIds.has(edge.from);
    const toInside = memberIds.has(edge.to);
    // 둘 다 안 / 둘 다 밖 → 경계가 아니다.
    if (fromInside === toInside) continue;
    const from = nodeById.get(edge.from);
    const to = nodeById.get(edge.to);
    if (!from || !to) continue;
    if (seen.has(edge.id)) continue;
    seen.add(edge.id);

    const outsideNode = fromInside ? to : from;
    const jumpRealmId = nearestDomainId(outsideNode, parentOf, nodeById) ?? outsideNode.id;

    crossings.push({
      edgeId: edge.id,
      fromId: from.id,
      fromTitle: from.display ?? from.title,
      toId: to.id,
      toTitle: to.display ?? to.title,
      relationType: edge.type,
      outsideId: outsideNode.id,
      jumpRealmId,
    });
  }

  crossings.sort(
    (a, b) =>
      a.relationType.localeCompare(b.relationType) ||
      a.fromTitle.localeCompare(b.fromTitle) ||
      a.toTitle.localeCompare(b.toTitle) ||
      a.edgeId.localeCompare(b.edgeId),
  );

  return { total: crossings.length, crossings };
}
