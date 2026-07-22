import { describe, expect, it } from "vitest";

import {
  edgeFireflyProgress,
  fireflyCount,
  fireflyPosition,
  fireflySeed,
  FIREFLY_SPEED_WORLD_PER_SEC,
  FIREFLY_TWO_PARTICLE_LENGTH_WORLD,
} from "./edge-fireflies";
import type { Point } from "./traces";

/**
 * S10 결함 4 — 반딧불(엣지 흐름 입자)의 순수 위치/위상 계약. 실제 픽셀 드로우는
 * :3107 실화면에서 메인 세션이 검증하고, 여기선 결정론·등속·방향·범위만 핀.
 */
describe("fireflySeed", () => {
  it("결정론 — 같은 엣지는 항상 같은 시드", () => {
    expect(fireflySeed("a", "b")).toBe(fireflySeed("a", "b"));
  });

  it("[0,1) 범위", () => {
    for (const [s, t] of [["a", "b"], ["capability:x", "element:y"], ["z", "z"]]) {
      const seed = fireflySeed(s, t);
      expect(seed).toBeGreaterThanOrEqual(0);
      expect(seed).toBeLessThan(1);
    }
  });

  it("방향성 — source↔target 순서가 다르면 다른 시드(대체로)", () => {
    expect(fireflySeed("a", "b")).not.toBe(fireflySeed("b", "a"));
  });
});

describe("fireflyCount", () => {
  it("짧은 엣지는 1개, 긴 엣지는 2개(엣지당 1~2개)", () => {
    expect(fireflyCount(FIREFLY_TWO_PARTICLE_LENGTH_WORLD - 1)).toBe(1);
    expect(fireflyCount(FIREFLY_TWO_PARTICLE_LENGTH_WORLD)).toBe(2);
    expect(fireflyCount(1000)).toBe(2);
  });
});

describe("edgeFireflyProgress", () => {
  it("모든 진행도는 [0,1) 범위", () => {
    for (const now of [0, 123, 5000, 999999]) {
      for (const t of edgeFireflyProgress(now, 300, 2, 0.4)) {
        expect(t).toBeGreaterThanOrEqual(0);
        expect(t).toBeLessThan(1);
      }
    }
  });

  it("입자 수만큼 진행도를 낸다", () => {
    expect(edgeFireflyProgress(0, 300, 1, 0)).toHaveLength(1);
    expect(edgeFireflyProgress(0, 300, 2, 0)).toHaveLength(2);
    expect(edgeFireflyProgress(0, 300, 0, 0)).toHaveLength(0);
  });

  it("등속 월드 속도 — 한 주기(길이/속도)가 지나면 위상이 한 바퀴 돈다", () => {
    const length = 160;
    const periodMs = (length / FIREFLY_SPEED_WORLD_PER_SEC) * 1000;
    const at0 = edgeFireflyProgress(0, length, 1, 0.3)[0];
    const atPeriod = edgeFireflyProgress(periodMs, length, 1, 0.3)[0];
    expect(atPeriod).toBeCloseTo(at0, 6);
  });

  it("시간이 흐르면 source→target 방향으로 진행(단조 증가, 랩 전까지)", () => {
    const length = 800; // 긴 엣지라 짧은 dt 안에서 랩 안 함
    const t0 = edgeFireflyProgress(0, length, 1, 0)[0];
    const t1 = edgeFireflyProgress(100, length, 1, 0)[0];
    expect(t1).toBeGreaterThan(t0);
  });

  it("한 엣지 안 두 입자는 위상이 벌어져 있다(겹치지 않음)", () => {
    const [p0, p1] = edgeFireflyProgress(0, 300, 2, 0);
    expect(Math.abs(p0 - p1)).toBeCloseTo(0.5, 6);
  });

  it("길이 0/음수 방어 — 던지지 않고 유한값", () => {
    for (const t of edgeFireflyProgress(500, 0, 2, 0.2)) {
      expect(Number.isFinite(t)).toBe(true);
    }
    for (const t of edgeFireflyProgress(500, -10, 1, 0.2)) {
      expect(Number.isFinite(t)).toBe(true);
    }
  });
});

describe("fireflyPosition", () => {
  const a: Point = { x: 0, y: 0 };
  const control: Point = { x: 50, y: 100 };
  const b: Point = { x: 100, y: 0 };

  it("t=0 은 출발(source), t=1 은 도착(target)", () => {
    expect(fireflyPosition(a, control, b, 0)).toEqual(a);
    expect(fireflyPosition(a, control, b, 1)).toEqual(b);
  });

  it("t=0.5 는 곡선 중앙 근처(양 끝 사이)", () => {
    const mid = fireflyPosition(a, control, b, 0.5);
    expect(mid.x).toBeGreaterThan(a.x);
    expect(mid.x).toBeLessThan(b.x);
    expect(mid.y).not.toBe(0); // bow 로 휘어 y!=0
  });
});
