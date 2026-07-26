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

/**
 * 지도 우하단 상시 계기 스택(관계선 범례 + 계기 판독)을 비켜서기 위한 오프셋.
 *
 * 진입 검수 E-7: `자동 정렬` 토스트가 그 스택을 **완전히** 덮었다 — 범례
 * 「큰 줄기 보기」·「줌인하면 요소가 나타납니다」가 사라지고 판독 좌변이
 * 잘렸다. 둘 다 bottom-right 고정인데 토스트는 기본 16px 오프셋이었다.
 * Tufte: 장식이 데이터를 가리면 안 된다 — 여기선 알림이 상시 계기를 가렸다.
 *
 * 예약 높이를 상수로 박지 않고 **스택의 실제 rect 를 받는다**: 범례는 로케일·
 * 어휘 레지스터·줌 티어에 따라 줄 내용이 바뀌고 ≥1920 에서는 코너 인셋
 * 토큰까지 커진다. 상수는 그중 하나만 맞고 나머지에서 틀린다.
 *
 * @param viewportHeight `window.innerHeight`
 * @param stackTop 스택의 `getBoundingClientRect().top`
 */
export function resolveToastBottomOffsetForStack(
  viewportHeight: number,
  stackTop: number,
): number {
  return resolveToastBottomOffset(Math.round(viewportHeight - stackTop));
}
