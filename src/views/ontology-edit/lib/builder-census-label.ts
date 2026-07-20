/**
 * P5d (N11) — 헤더 census("저장된 개념 N개")와 캔버스가 실제로 그리는 노드
 * 수가 어긋나던 원인은 `buildFocusedBuilderManifest` 가 캔버스를 focus
 * 노드 + 직접 이웃만으로 좁히기 때문(대형 vault 성능/가독성을 위한 의도된
 * 축소, `OntologyEditCanvas.tsx`). 헤더는 그 축소를 모른 채 항상 vault
 * 전체 총계만 보여줘 "128개 저장" 인데 캔버스엔 12개만 보이는 게 버그처럼
 * 읽혔다(페르소나 N11).
 *
 * B-1 (2026-07-21 UX 라운드) — 같은 라벨이 이번엔 반대로 거짓말을 했다:
 * "도메인 추가" 로 미저장(임시) 노드를 캔버스에 올려도 "캔버스 8개 표시"
 * 가 8 로 고정돼, 한 헤더 안에서 "임시 개념 1" 배지와 숫자가 모순됐다.
 * 해결: `shownCount` 는 caller 가 임시 노드까지 더한 "실제 캔버스 렌더 수"
 * 로 넘기고, 이 함수는 그 값이 정본 저장 총계와 다를 때만 병기를 켠다.
 *
 * 이 순수 함수는 "총계 라벨 그대로 둘지, 캔버스 실제 표시 수를 병기할지"만
 * 판정한다 — focus 로직 자체(Canvas 의 성능 축소)는 건드리지 않는다.
 * shownCount !== totalCount 일 때만 병기 — 우연히 같으면(포커스 없이 전체
 * 표시 + 임시 0) 불필요한 "128개 중 128개 표시" 잡음을 피한다.
 */
export function shouldShowFocusedCensus({
  shownCount,
  totalCount,
}: {
  shownCount: number;
  totalCount: number;
}): boolean {
  return shownCount !== totalCount;
}
