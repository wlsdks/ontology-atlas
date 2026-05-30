/**
 * 토폴로지 surface 의 deep-link 빌더 — `?p=<slug>` 가 HomePage 의
 * `useHomeRouteState` 훅이 읽는 query key 와 짝.
 *
 * 주의: HomePage 는 `/topology/` 에만 마운트된다 (R3 dual-surface 결정으로
 * `/` 는 OntologyViewPage 로 분리됨). 따라서 helper 도 `/topology/` 로 직접
 * 보낸다. 이전에 `/?p=` 를 반환하던 버전은 R3 마이그레이션 이후 누락된
 * 회귀로, "토폴로지에서 보기" CTA 가 ontology view 로 빠지는 문제가 있었다.
 */
export function getTopologyProjectHref(slug: string): string {
  return `/topology/?p=${encodeURIComponent(slug)}`;
}

/**
 * ontology 노드(domain·capability·element 등 project 외) 를 토폴로지에서 *focus*
 * 로 여는 deep-link. `mode=focus` 가 HomePage 의 route state 훅이 읽어 그 노드를
 * 선택·확대하고 drawer 를 연다. 토폴로지가 전체 ontology 그래프를 렌더하므로
 * (R3 이후) project 외 노드도 1:1 그래프 노드를 가진다 — `?p=<nodeId>` 가 곧
 * vault slug. drawer 의 관계-행 navigation 과 같은 URL 계약.
 */
export function getTopologyFocusHref(nodeId: string): string {
  return `/topology/?mode=focus&p=${encodeURIComponent(nodeId)}`;
}
