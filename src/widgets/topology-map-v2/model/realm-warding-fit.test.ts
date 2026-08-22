import { describe, expect, it } from "vitest";

import { initWardingFit, stepWardingFit, WARDING_REFIT_MS } from "./realm-warding-fit";

describe("realm-warding-fit — 결계 반경 재적합 이징 (S9 결함 2)", () => {
  it("초기 상태는 주어진 반경에 정착(트윈 없음)", () => {
    const s = initWardingFit(100);
    expect(s.value).toBe(100);
    // Unchanged target → hold the value; no continuous animation.
    const next = stepWardingFit(s, 100, 1000, false);
    expect(next.value).toBe(100);
    expect(next).toBe(s); // same reference too — nothing reallocated
  });

  it("가시 집합 변화(목표 반경 변화) → 240ms 이징으로 수렴", () => {
    let s = initWardingFit(100);
    // Target jumps to 300 at t=0 → the tween starts from the current 100.
    s = stepWardingFit(s, 300, 0, false);
    expect(s.value).toBe(100); // the first frame is still the start point
    // Midway (120 ms) — between 100 and 300.
    const mid = stepWardingFit(s, 300, WARDING_REFIT_MS / 2, false);
    expect(mid.value).toBeGreaterThan(100);
    expect(mid.value).toBeLessThan(300);
    // End (240 ms+) — snap to target and settle.
    const end = stepWardingFit(mid, 300, WARDING_REFIT_MS + 1, false);
    expect(end.value).toBeCloseTo(300, 6);
    expect(end.startMs).toBeLessThan(0);
  });

  it("reduced-motion 은 목표로 즉시 스냅(여정 없음)", () => {
    const s = initWardingFit(100);
    const snapped = stepWardingFit(s, 300, 0, true);
    expect(snapped.value).toBe(300);
    expect(snapped.startMs).toBeLessThan(0);
  });

  it("데드밴드 이하 미세 변화는 트윈을 재시작하지 않는다", () => {
    const s = initWardingFit(100);
    const next = stepWardingFit(s, 100.2, 500, false);
    // Stays settled — value unchanged.
    expect(next.value).toBe(100);
  });

  it("이징 중 목표가 다시 바뀌면 현재 렌더값에서 새 트윈 시작", () => {
    let s = initWardingFit(100);
    s = stepWardingFit(s, 300, 0, false);
    const mid = stepWardingFit(s, 300, WARDING_REFIT_MS / 2, false);
    const midValue = mid.value;
    // Changing the target to 500 restarts from midValue.
    const restart = stepWardingFit(mid, 500, WARDING_REFIT_MS / 2, false);
    expect(restart.from).toBeCloseTo(midValue, 6);
    expect(restart.to).toBe(500);
  });
});
