/**
 * P5d (N11) — 헤더 census("저장된 개념 N개")와 캔버스가 실제로 그리는 노드
 * 수가 어긋나던 원인은 `buildFocusedBuilderManifest` 가 캔버스를 focus
 * 노드 + 직접 이웃만으로 좁히기 때문(대형 vault 성능/가독성을 위한 의도된
 * 축소, `OntologyEditCanvas.tsx`). 헤더는 그 축소를 모른 채 항상 vault
 * 전체 총계만 보여줘 "128개 저장" 인데 캔버스엔 12개만 보이는 게 버그처럼
 * 읽혔다(페르소나 N11).
 *
 * 이 순수 함수는 "총계 라벨 그대로 둘지, 축소분을 병기할지"만 판정한다 —
 * focus 로직 자체(Canvas 의 성능 축소)는 건드리지 않는다. shown < total
 * 일 때만 병기 — 포커스가 없거나(isFocused=false, 전체 표시) 우연히 shown
 * === total 이면 불필요한 "128개 중 128개 표시" 잡음을 피한다.
 */
export function shouldShowFocusedCensus({
  isFocused,
  shownCount,
  totalCount,
}: {
  isFocused: boolean;
  shownCount: number;
  totalCount: number;
}): boolean {
  return isFocused && shownCount < totalCount;
}
