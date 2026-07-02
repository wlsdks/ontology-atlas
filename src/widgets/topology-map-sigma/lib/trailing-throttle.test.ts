import { describe, expect, it } from 'vitest';

import { createTrailingThrottle } from './trailing-throttle';

/**
 * 카메라 'updated' 스트림(줌/팬 중 매 프레임 발화)에 물리는 trailing
 * throttle 계약:
 *  - leading: 유휴 상태에서 첫 invoke 는 즉시 실행 (HUD 지연 0).
 *  - coalesce: interval 안의 연속 invoke 는 마지막 한 번으로 합쳐진다.
 *  - trailing: interval 이 끝나면 마지막으로 밀린 호출이 반드시 실행된다
 *    (제스처 종료 시 최종 상태 유실 금지 — evidence marker 계약 유지).
 *  - dispose: 예약된 trailing 호출을 취소한다 (unmount 안전).
 */
function createHarness() {
  let now = 0;
  const scheduled: Array<{ cb: () => void; at: number; cancelled: boolean }> = [];
  return {
    now: () => now,
    schedule: (cb: () => void, delayMs: number) => {
      const entry = { cb, at: now + delayMs, cancelled: false };
      scheduled.push(entry);
      return entry;
    },
    cancel: (handle: unknown) => {
      (handle as { cancelled: boolean }).cancelled = true;
    },
    advance(ms: number) {
      now += ms;
      for (const entry of [...scheduled]) {
        if (!entry.cancelled && entry.at <= now) {
          scheduled.splice(scheduled.indexOf(entry), 1);
          entry.cb();
        }
      }
    },
    pendingCount() {
      return scheduled.filter((entry) => !entry.cancelled).length;
    },
  };
}

describe('createTrailingThrottle', () => {
  it('runs the first invoke immediately (leading edge)', () => {
    const harness = createHarness();
    let calls = 0;
    const throttle = createTrailingThrottle(() => { calls += 1; }, {
      intervalMs: 120,
      now: harness.now,
      schedule: harness.schedule,
      cancel: harness.cancel,
    });
    throttle.invoke();
    expect(calls).toBe(1);
  });

  it('coalesces burst invokes into one trailing call', () => {
    const harness = createHarness();
    let calls = 0;
    const throttle = createTrailingThrottle(() => { calls += 1; }, {
      intervalMs: 120,
      now: harness.now,
      schedule: harness.schedule,
      cancel: harness.cancel,
    });
    throttle.invoke(); // leading
    for (let i = 0; i < 10; i += 1) {
      harness.advance(8);
      throttle.invoke();
    }
    expect(calls).toBe(1);
    harness.advance(120);
    expect(calls).toBe(2); // trailing 한 번만
    expect(harness.pendingCount()).toBe(0);
  });

  it('runs again immediately once the interval has fully passed', () => {
    const harness = createHarness();
    let calls = 0;
    const throttle = createTrailingThrottle(() => { calls += 1; }, {
      intervalMs: 120,
      now: harness.now,
      schedule: harness.schedule,
      cancel: harness.cancel,
    });
    throttle.invoke();
    harness.advance(200);
    throttle.invoke();
    expect(calls).toBe(2);
  });

  it('dispose cancels a pending trailing call', () => {
    const harness = createHarness();
    let calls = 0;
    const throttle = createTrailingThrottle(() => { calls += 1; }, {
      intervalMs: 120,
      now: harness.now,
      schedule: harness.schedule,
      cancel: harness.cancel,
    });
    throttle.invoke();
    harness.advance(8);
    throttle.invoke(); // trailing 예약
    throttle.dispose();
    harness.advance(500);
    expect(calls).toBe(1);
  });

  it('flush runs a pending trailing call synchronously', () => {
    const harness = createHarness();
    let calls = 0;
    const throttle = createTrailingThrottle(() => { calls += 1; }, {
      intervalMs: 120,
      now: harness.now,
      schedule: harness.schedule,
      cancel: harness.cancel,
    });
    throttle.invoke();
    harness.advance(8);
    throttle.invoke();
    throttle.flush();
    expect(calls).toBe(2);
    harness.advance(500);
    expect(calls).toBe(2); // 중복 실행 없음
  });
});
