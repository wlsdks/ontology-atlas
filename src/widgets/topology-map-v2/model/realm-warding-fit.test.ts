import { describe, expect, it } from "vitest";

import { initWardingFit, stepWardingFit, WARDING_REFIT_MS } from "./realm-warding-fit";

describe("realm-warding-fit — 결계 반경 재적합 이징 (S9 결함 2)", () => {
  it("초기 상태는 주어진 반경에 정착(트윈 없음)", () => {
    const s = initWardingFit(100);
    expect(s.value).toBe(100);
    // 목표가 그대로면 값 홀드 — 지속 애니메이션 없음.
    const next = stepWardingFit(s, 100, 1000, false);
    expect(next.value).toBe(100);
    expect(next).toBe(s); // 참조까지 그대로(재할당 없음)
  });

  it("가시 집합 변화(목표 반경 변화) → 240ms 이징으로 수렴", () => {
    let s = initWardingFit(100);
    // t=0 에서 목표 300 으로 점프 → 현재값 100 에서 트윈 시작.
    s = stepWardingFit(s, 300, 0, false);
    expect(s.value).toBe(100); // 시작 프레임은 아직 출발점
    // 중간(120ms) — 100 과 300 사이.
    const mid = stepWardingFit(s, 300, WARDING_REFIT_MS / 2, false);
    expect(mid.value).toBeGreaterThan(100);
    expect(mid.value).toBeLessThan(300);
    // 끝(240ms+) — 목표에 스냅 + 정착.
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
    // 정착 유지 — 값 그대로.
    expect(next.value).toBe(100);
  });

  it("이징 중 목표가 다시 바뀌면 현재 렌더값에서 새 트윈 시작", () => {
    let s = initWardingFit(100);
    s = stepWardingFit(s, 300, 0, false);
    const mid = stepWardingFit(s, 300, WARDING_REFIT_MS / 2, false);
    const midValue = mid.value;
    // 목표를 500 으로 바꾸면 midValue 에서 출발.
    const restart = stepWardingFit(mid, 500, WARDING_REFIT_MS / 2, false);
    expect(restart.from).toBeCloseTo(midValue, 6);
    expect(restart.to).toBe(500);
  });
});
