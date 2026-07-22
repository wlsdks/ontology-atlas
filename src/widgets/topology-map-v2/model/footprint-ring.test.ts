import { describe, expect, it } from "vitest";

import {
  buildFootprintRanks,
  footprintRingStyle,
  FOOTPRINT_RING_MAX_ALPHA,
  FOOTPRINT_RING_MAX_LINE_WIDTH,
} from "./footprint-ring";

describe("footprintRingStyle — 최근성 감쇠 사다리", () => {
  it("가장 최근(rank 0)이 가장 진하고 두껍다", () => {
    const r0 = footprintRingStyle(0);
    const r1 = footprintRingStyle(1);
    const r2 = footprintRingStyle(2);
    expect(r0.alpha).toBeGreaterThan(r1.alpha);
    expect(r1.alpha).toBeGreaterThan(r2.alpha);
    expect(r0.lineWidth).toBeGreaterThanOrEqual(r1.lineWidth);
    expect(r1.lineWidth).toBeGreaterThanOrEqual(r2.lineWidth);
  });

  it("rank 3 이상은 하한으로 수렴(더 옅어지지 않음)", () => {
    const floor = footprintRingStyle(3);
    expect(footprintRingStyle(4)).toEqual(floor);
    expect(footprintRingStyle(99)).toEqual(floor);
    expect(footprintRingStyle(-1)).toEqual(floor);
  });

  it("어떤 단도 유효 알파 하한(0.12) 위 — WebGL 저알파 결함 메모 대비", () => {
    for (const rank of [0, 1, 2, 3, 10]) {
      expect(footprintRingStyle(rank).alpha).toBeGreaterThanOrEqual(0.12);
    }
  });

  it("위계 간섭 0 — 발자국 최상단이 확장 오라(0.55)·선택 링(2px)보다 약하다", () => {
    // 확장 오라 알파 0.55, 선택 링 두께 2px 를 절대 넘지 않는다.
    expect(FOOTPRINT_RING_MAX_ALPHA).toBeLessThan(0.55);
    expect(FOOTPRINT_RING_MAX_LINE_WIDTH).toBeLessThan(2);
  });
});

describe("buildFootprintRanks", () => {
  it("최근이 rank 0, 오래된 것이 큰 rank", () => {
    const ranks = buildFootprintRanks(["a", "b", "c"], null);
    expect(ranks.get("c")).toBe(0);
    expect(ranks.get("b")).toBe(1);
    expect(ranks.get("a")).toBe(2);
  });

  it("현재 포커스 노드는 발자국 링에서 제외(이중 링 방지)", () => {
    const ranks = buildFootprintRanks(["a", "b", "c"], "c");
    expect(ranks.has("c")).toBe(false);
    // 제외 후 남은 것이 rank 0 부터 다시 매겨진다.
    expect(ranks.get("b")).toBe(0);
    expect(ranks.get("a")).toBe(1);
  });

  it("빈 trail 은 빈 map", () => {
    expect(buildFootprintRanks([], null).size).toBe(0);
  });
});
