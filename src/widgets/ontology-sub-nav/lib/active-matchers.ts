/**
 * OntologySubNav 의 sub-item 별 active 상태 판단 — pathname 정규화 후
 * exactMatches 우선, 없으면 prefixMatches 의 startsWith.
 *
 * 정규화: 끝의 `/` 제거. `/ontology/` 와 `/ontology` 를 같은 surface 로
 * 본다 (Next.js trailing-slash 변형 호환).
 */
export function isOntologySubItemActive(
  pathname: string,
  exactMatches: ReadonlyArray<string>,
  prefixMatches: ReadonlyArray<string>,
): boolean {
  const normalized = pathname.replace(/\/$/, '');
  if (exactMatches.includes(normalized)) return true;
  return prefixMatches.some((p) => normalized.startsWith(p));
}

/**
 * 현재 pathname 이 ontology surface 인지 — OperationsNav 가 SubNav 행
 * 노출 여부 결정에 사용.
 *
 * - '' (정규화된 /) — RootEntry → OntologyViewPage (vault 선택 시)
 * - '/ontology' / '/ontology/edit' / '/ontology/insights'
 */
export function shouldShowOntologySubNav(pathname: string): boolean {
  const normalized = pathname.replace(/\/$/, '');
  return normalized === '' || normalized.startsWith('/ontology');
}
