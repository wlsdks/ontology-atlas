/**
 * **화면 오른쪽에 선 것이 먹은 폭** — 떠 있는 것들이 그만큼 앞에서 멈춘다.
 *
 * ## 왜 필요한가 (2026-08-16 검수)
 *
 * 지도 오른쪽에 대화 패널이 서면, 화면 가장자리를 기준으로 자리를 잡는 표면은
 * 전부 그 패널 **위에** 앉는다. 알림이 작성 칸을 덮은 것이 그 하나였고, 재
 * 보니 같은 모양이 여럿이었다:
 *
 * - 마우스를 올렸을 때 뜨는 카드가 `window.innerWidth` 를 오른쪽 벽으로 삼는다
 * - 오른쪽 클릭 메뉴가 같은 벽을 쓴다
 *
 * 그런데 그 표면들이 설명하려는 것은 **지도**다. 지도의 오른쪽 끝은 화면의
 * 오른쪽 끝이 아니라 **패널이 시작하는 자리**다. 벽을 잘못 잡으면 지도 이야기를
 * 패널 위에 적게 된다.
 *
 * ## 왜 CSS 변수에서 읽나
 *
 * 폭은 사용자가 끌어서 정하고(320~968px) 리액트 상태로 산다. 그 상태를 이
 * 표면들에 prop 으로 내려보내려면 지도 렌더러를 통째로 지나야 하는데, 그건
 * 값 하나 때문에 넓은 배선을 새로 까는 일이다. 대신 그 값을 **문서에 한 번**
 * 적어 두고(호출자는 `HomePage`), 필요한 곳에서 읽는다 — 이미 알림이 쓰는
 * 방식과 같다.
 */

/** 지금 오른쪽에 선 도크의 폭을 담은 변수 이름. 없으면 0. */
export const RIGHT_DOCK_WIDTH_VAR = '--app-right-dock-width';

/** 도크가 먹은 폭(px). 서버·미지원 환경에서는 0. */
export function rightDockWidth(): number {
  if (typeof window === 'undefined' || typeof document === 'undefined') return 0;
  const raw = window
    .getComputedStyle(document.documentElement)
    .getPropertyValue(RIGHT_DOCK_WIDTH_VAR);
  const value = Number.parseFloat(raw);
  return Number.isFinite(value) && value > 0 ? value : 0;
}

/**
 * 떠 있는 표면이 넘으면 안 되는 **오른쪽 벽**.
 *
 * 화면 폭에서 도크를 뺀 값이다. 도크가 화면보다 넓다고 보고되는 이상한 상태
 * (측정 실패)에서도 0 아래로 내려가지 않는다 — 그때는 벽이 없는 것이 낫다.
 */
export function floatingRightBound(viewportWidth: number, dockWidth: number): number {
  if (!Number.isFinite(viewportWidth) || viewportWidth <= 0) return 0;
  if (!Number.isFinite(dockWidth) || dockWidth <= 0) return viewportWidth;
  return Math.max(0, viewportWidth - dockWidth);
}

/** 지금 이 화면의 오른쪽 벽 — 위 둘을 합친 편의 함수. */
export function currentFloatingRightBound(): number {
  if (typeof window === 'undefined') return 1920;
  return floatingRightBound(window.innerWidth, rightDockWidth());
}
