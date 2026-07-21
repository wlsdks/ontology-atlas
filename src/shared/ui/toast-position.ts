/**
 * 토스트 하단 오프셋 계약.
 *
 * 문제(빌더 감사 #5): sonner 토스트는 bottom-right 고정이라 기본 오프셋
 * (16px)에서는 빌더 하단 "쓰기 확인" 바의 우측 "vault 에 쓰기" 버튼을 덮는다.
 * 1440×900 처럼 세로가 짧은 뷰포트에서 특히 겹친다.
 *
 * 해법: 하단 바가 예약한 높이만큼 토스트를 위로 띄운다. ToastProvider 는
 * `--app-toast-bottom-offset` CSS 변수(기본 16px)를 읽고, 빌더 페이지가
 * 마운트되어 있는 동안 이 함수가 계산한 값을 그 변수에 심는다. 다른 페이지는
 * 기본값 그대로라 회귀가 없다.
 */

/** 화면 가장자리에서 토스트까지의 기본 여백(px). */
export const TOAST_EDGE_GAP_PX = 16;

/**
 * 빌더 하단 쓰기 바가 예약하는 높이(px).
 * 바 = 버튼 h-8(32) + py-2.5(20) + border(2) ≈ 54px, 여기에 바 위 mt-2(8)와
 * 토스트가 바를 확실히 비켜서도록 하는 여유를 더한 값. 1440×900 에서도
 * 토스트 하단(88px)이 바 상단(≈62px)보다 위라 버튼을 가리지 않는다.
 */
export const BUILDER_WRITE_BAR_RESERVE_PX = 72;

/**
 * 예약 높이 위로 토스트를 띄우기 위한 하단 오프셋(px)을 계산한다.
 * reservedBottomPx 가 0(예약 없음)이면 기본 여백만 반환.
 */
export function resolveToastBottomOffset(reservedBottomPx = 0): number {
  return TOAST_EDGE_GAP_PX + Math.max(0, reservedBottomPx);
}
