/**
 * 나침 무대의 **폭 클램프** — 보드가 화면 밖으로 잘리지 않게 한다.
 *
 * ## 실측 (2026-07-28, 프로덕션 :4173, `capability:order-create`)
 *
 * 무대는 고정 1180px 보드를 중앙 정렬한다. 그래서 무대 콘텐츠 폭이 1180 보다
 * 좁으면 **좌우가 대칭으로 잘린다**:
 *
 * | 뷰포트 | 무대 폭 | 한쪽 넘침 |
 * |---|---|---|
 * | 1024 | 960 | **110px** |
 * | 1040 | 976 | **102px** |
 * | 1180 | 1116 | **32px** |
 * | 1264 | 1200 | 0 (여백 10px) |
 *
 * 잘린 자리에서 실제로 사라진 것: 왼쪽 소켓 라벨의 앞 글자, 오른쪽 위성의
 * 「···」 편집 버튼 전체(= 도달 불가능한 기능).
 *
 * ## 왜 강등이 아니라 축소인가
 *
 * 폭 강등(`studio-too-narrow`)의 경계를 1264 로 올리는 선택지가 있었지만
 * **설치된 앱의 `minWidth` 가 1040** 이다 — 즉 앱이 자기 최소 크기에서
 * 강등 화면을 보게 된다. 앱의 최소 크기는 앱이 일해야 하는 크기다.
 *
 * ## 대가를 정직하게
 *
 * 축소는 보드 **안**의 글자도 같이 줄인다(1024 에서 0.81배). 그 대역에서
 * 위성 라벨 12.5px 은 약 10px 로 읽힌다. 오늘의 대안은 "그 글자가 화면 밖에
 * 있는 것" 이므로 축소가 엄격히 낫지만, 공짜는 아니다. 그래서 **필요한
 * 만큼만** 줄이고(1264 이상에서는 1.0, 즉 손대지 않는다) 바닥을 둔다 —
 * 바닥 밑은 폭 강등의 몫이다.
 *
 * 저장 버튼 같은 크롬은 보드 밖(무대 grid 의 헤더·푸터 행)에 살아서 이
 * 축소의 영향을 받지 않는다.
 */

/** 보드의 고정 좌표계 폭 — `StudioCompass` 의 `BOARD.w` 와 같은 값이다. */
export const STUDIO_BOARD_WIDTH = 1180;

/**
 * 보드 좌우에 남기는 최소 여백. 0 이면 소켓 테두리가 무대 경계에 닿아
 * "잘린 것처럼" 보인다 — 1264 에서 자연히 생기는 여백(10px)과 같은 값이다.
 */
const EDGE_MARGIN = 10;

/**
 * 축소 바닥. 이보다 더 줄여야 하는 폭은 폭 강등(`studio-too-narrow`)이
 * 이미 가져간다 — 1024 가 요구하는 0.81 이 실제 하한이므로 여기에 맞춘다.
 */
const MIN_SCALE = 0.78;

/**
 * @param availableWidth 무대의 콘텐츠 폭(px). 0 이하(측정 전)면 1 을 돌려
 *   첫 프레임이 축소로 깜빡이지 않게 한다 — 측정 전에는 축소하지 않는다.
 */
export function studioBoardScale(
  availableWidth: number,
  boardWidth: number = STUDIO_BOARD_WIDTH,
): number {
  if (!Number.isFinite(availableWidth) || availableWidth <= 0) return 1;
  const fits = (availableWidth - EDGE_MARGIN * 2) / boardWidth;
  if (fits >= 1) return 1;
  return Math.max(MIN_SCALE, fits);
}
