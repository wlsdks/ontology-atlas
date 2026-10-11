import { describe, expect, it } from "vitest";


import {
  FOOTPRINT_MIN_SIZE,
  FOOTPRINT_NODE_RATIO,
  FOOTPRINT_SCALE_RANGE,
  footprintAnchor,
  footprintPairRadius,
  footprintScaleFor,
  footprintSizeFor,
  formatStepNumbers,
} from "./footprint-glyph";

/**
 * A print **never grows larger than the node it marks** (2026-08-02, owner:
   * "Tighten how the footprint size adapts when the window gets small" — tighten how the footprint
   * size adapts when the window gets small).
 *
 * This gate locks the **ratio**, not the pixels. The previous implementation had no cap, so
 * a print scaling with the square root of camera zoom outran a node shrinking linearly.
 * Measured: at zoom 0.3, a 6.4px print beside a 2.1px node radius (**3.1×**); at 0.2,
 * **4.6×**. If the cap ever disappears quietly, that screen comes back.
 */
describe("footprintSizeFor — 자국은 노드보다 커지지 않는다", () => {
  it("큰 노드에서는 기본 크기를 그대로 쓴다 — 문제 없던 자리는 안 건드린다", () => {
    // Domain radius 17px gives a cap of 18.9, above the base 13 — nothing is clamped.
    expect(footprintSizeFor(13, 17)).toBe(13);
  });

  it("작은 노드에서는 노드 반경에 맞춰 잘린다", () => {
    const size = footprintSizeFor(13, 7);
    expect(footprintPairRadius(size)).toBeCloseTo(FOOTPRINT_NODE_RATIO * 7, 5);
  });

  it("깊은 줌아웃에서도 하한 아래로는 안 내려간다 — 소멸하면 「걸었다」를 못 말한다", () => {
    expect(footprintSizeFor(13, 0.4)).toBe(FOOTPRINT_MIN_SIZE);
  });

  it("노드 대비 배수가 전 구간에서 2.5배를 넘지 않는다", () => {
    for (const cameraScale of [1, 0.8, 0.6, 0.4, 0.3, 0.2]) {
      const k = footprintScaleFor(cameraScale);
      const nodeRadius = 7 * cameraScale;
      const ratio = footprintPairRadius(footprintSizeFor(13 * k, nodeRadius)) / nodeRadius;
      expect(ratio).toBeLessThanOrEqual(2.5);
    }
  });

  it("노드 반경이 없거나 이상하면 기본 크기로 물러난다", () => {
    expect(footprintSizeFor(13, 0)).toBe(13);
    expect(footprintSizeFor(13, Number.NaN)).toBe(13);
  });
});



describe("formatStepNumbers", () => {
  it("셋 이하는 그대로 잇는다", () => {
    expect(formatStepNumbers([1])).toBe("1");
    expect(formatStepNumbers([1, 3, 5])).toBe("1·3·5");
  });

  /**
   * Abbreviating without the total erases "I keep coming back here" — the very fact this
   * notation carries, which makes it loss rather than abbreviation.
   */
  it("넷 이상은 줄이되 총 횟수를 함께 남긴다", () => {
    expect(formatStepNumbers([1, 3, 5, 9])).toBe("1·…·9 (총 4회)");
  });

  it("빈 목록은 빈 문자열", () => {
    expect(formatStepNumbers([])).toBe("");
  });
});

/**
 * The defect where prints bit into the node disc (measured in the installed app — owner:
 * "I want to avoid overlaps", nothing should overlap). The cause was that `gap` measured
 * to the print's **centre**; overlap is an edge condition, not a centre condition.
 */
describe("footprintAnchor — 노드와 겹치지 않는다", () => {
  it.each([
    [13, 8, 13],
    [26, 8, 13],
    [17, 0, 26],
    [40, 0, 9],
  ])("노드 반지름 %d · 여백 %d · 자국 %d", (nodeRadius, gap, size) => {
    const at = footprintAnchor(0, 0, nodeRadius, gap, size);
    const centerDistance = Math.hypot(at.x, at.y);
    const clearance = centerDistance - nodeRadius - footprintPairRadius(size);
    expect(clearance, `노드를 파고들었다 (여유 ${clearance.toFixed(2)}px)`).toBeGreaterThanOrEqual(gap - 1e-6);
  });

  it("라벨을 피해 우상단 사분면에 앉는다", () => {
    const at = footprintAnchor(100, 100, 13, 8, 13);
    expect(at.x).toBeGreaterThan(100);
    expect(at.y).toBeLessThan(100);
  });
});

/**
 * Overlap is worst when zoomed out: nodes and relation lines crowd the screen, and prints at
 * a fixed pixel size bury the graph. Shrinking them is the mitigation the owner allowed.
 */
describe("footprintScaleFor", () => {
  it("배율 1 에서는 원래 크기다", () => {
    expect(footprintScaleFor(1)).toBeCloseTo(1, 6);
  });

  it("축소할수록 자국도 작아진다 — 단조 증가", () => {
    const samples = [0.05, 0.2, 0.5, 1, 2].map(footprintScaleFor);
    for (let i = 1; i < samples.length; i += 1) {
      expect(samples[i]).toBeGreaterThanOrEqual(samples[i - 1]);
    }
  });

  it("하한에서 멈춘다 — 한 점이 되면 '여기 걸었다'를 못 말한다", () => {
    expect(footprintScaleFor(0.0001)).toBe(FOOTPRINT_SCALE_RANGE.min);
    expect(footprintScaleFor(9999)).toBe(FOOTPRINT_SCALE_RANGE.max);
  });

  it("망가진 배율에도 자국을 없애지 않는다", () => {
    for (const bad of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(footprintScaleFor(bad)).toBeGreaterThan(0);
    }
  });
});

