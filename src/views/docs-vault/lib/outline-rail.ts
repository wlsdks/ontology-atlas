/**
 * 목차 레일 표시 임계 — pure 판정 함수.
 *
 * 짧은 문서(heading 적음)에서 상시 레일이 노이즈가 되지 않도록, 표시 조건을
 * heading 개수 임계로 게이트. 뷰포트 게이트(`lg` 이상)는 CSS
 * (`hidden lg:flex`) 가 담당 — 이 함수는 heading 개수만 판정한다.
 *
 * 근거: `.qa-scratch/docs-reading-round/po-pass.md` §4 상태 계약 —
 * "depth 2–3 heading ≥ 임계(제안: 4개)".
 */
export const OUTLINE_RAIL_MIN_HEADINGS = 4;

export function shouldShowOutlineRail(headingCount: number): boolean {
  return headingCount >= OUTLINE_RAIL_MIN_HEADINGS;
}
