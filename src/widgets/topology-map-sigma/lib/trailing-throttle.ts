/**
 * Leading + trailing throttle — 카메라 'updated' 같은 고빈도 이벤트 스트림에
 * 물리는 비싼 후속 작업(전체 엣지 가시성 스윕 등)을 interval 당 1회로
 * 합친다. 유휴 첫 호출은 즉시(leading), 제스처 중 연속 호출은 마지막 한 번
 * (trailing)으로 — 최종 상태는 절대 유실되지 않는다 (evidence marker 계약).
 *
 * now/schedule/cancel 주입은 테스트용 — 프로덕션 기본값은
 * performance.now / setTimeout / clearTimeout.
 */

export interface TrailingThrottleOptions {
  intervalMs: number;
  now?: () => number;
  schedule?: (cb: () => void, delayMs: number) => unknown;
  cancel?: (handle: unknown) => void;
}

export interface TrailingThrottle {
  /** 스로틀 대상 호출 — leading 즉시 실행 또는 trailing 예약. */
  invoke: () => void;
  /** 예약된 trailing 호출이 있으면 지금 동기 실행 (제스처 종료 훅). */
  flush: () => void;
  /** 예약 취소 — unmount cleanup 용. */
  dispose: () => void;
}

export function createTrailingThrottle(
  fn: () => void,
  {
    intervalMs,
    now = () => performance.now(),
    schedule = (cb, delayMs) => setTimeout(cb, delayMs),
    cancel = (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
  }: TrailingThrottleOptions,
): TrailingThrottle {
  let lastRun = Number.NEGATIVE_INFINITY;
  let pending: unknown = null;

  const run = () => {
    pending = null;
    lastRun = now();
    fn();
  };

  return {
    invoke: () => {
      if (pending !== null) return; // 이미 trailing 예약됨 — coalesce
      const elapsed = now() - lastRun;
      if (elapsed >= intervalMs) {
        run();
        return;
      }
      pending = schedule(run, intervalMs - elapsed);
    },
    flush: () => {
      if (pending === null) return;
      cancel(pending);
      run();
    },
    dispose: () => {
      if (pending === null) return;
      cancel(pending);
      pending = null;
    },
  };
}
