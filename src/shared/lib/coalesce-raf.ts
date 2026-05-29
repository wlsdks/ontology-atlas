/**
 * 한 프레임 안에 여러 번 들어오는 트리거를 requestAnimationFrame 1회로 합친다.
 *
 * 고빈도 이벤트(예: Sigma 카메라 'updated' — pan/zoom/animate 중 프레임당 여러
 * 번 발화)를 그대로 React state 변경/리렌더에 연결하면 한 프레임에 같은 작업을
 * 여러 번 한다. trigger() 를 여러 번 불러도 다음 paint 전까지 콜백은 최대 1회만
 * 실행돼, 리렌더를 디스플레이 주사율(프레임당 1회)로 제한한다.
 *
 * cancel() 은 예약된 프레임을 취소 — effect cleanup 에서 호출해 unmount 후
 * 콜백이 도는 것을 막는다.
 */
export function coalesceRaf(fn: () => void): {
  trigger: () => void;
  cancel: () => void;
} {
  let rafId: number | null = null;
  return {
    trigger() {
      if (rafId !== null) return; // 이미 이번 프레임에 예약됨 — 합침
      rafId = requestAnimationFrame(() => {
        rafId = null;
        fn();
      });
    },
    cancel() {
      if (rafId !== null) {
        cancelAnimationFrame(rafId);
        rafId = null;
      }
    },
  };
}
