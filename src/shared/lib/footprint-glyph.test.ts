import { describe, expect, it } from "vitest";

import { DEFAULT_FOOTPRINT, FOOTPRINT_EDGE_SCALE } from "./appearance-preferences";
import { edgeFootprintPlacements, formatStepNumbers } from "./footprint-glyph";

/**
 * 선 옆 자국의 성질은 **좌표로만** 검증된다 — 캔버스 없이 잠글 수 있고, 그림을
 * 눈으로 보고 판정하는 것보다 정확하다. 설치 앱 실측에서 자국이 선을 관통하고
 * 있었는데(띄우는 거리가 자국 반폭보다 작았다), 그건 사람 눈으로도 한 번
 * 놓쳤던 종류의 결함이다.
 */
describe("edgeFootprintPlacements", () => {
  /** 자국 한 발의 반폭 — 앞꿈치 타원 x 반지름 + 테두리 절반. */
  const halfWidth = (size: number, stroke: number) => size * FOOTPRINT_EDGE_SCALE * 0.26 + stroke / 2;

  it("자국이 선을 관통하지 않는다 — 중심 거리가 아니라 가장자리로 잰다", () => {
    const pref = { ...DEFAULT_FOOTPRINT, gap: 0, size: 26 };
    // 수평선이라 법선 거리 = |y - 선의 y|.
    for (const spot of edgeFootprintPlacements(0, 100, 900, 100, pref)) {
      const clearance = Math.abs(spot.y - 100) - halfWidth(pref.size, pref.strokeWidth);
      expect(clearance, `자국이 선 위에 얹혔다 (여유 ${clearance.toFixed(2)}px)`).toBeGreaterThanOrEqual(0);
    }
  });

  it("띄우는 거리를 0 으로 둬도 겹치지 않는다 — 하한이 자국 크기를 따라간다", () => {
    for (const size of [9, 13, 20, 26]) {
      const pref = { ...DEFAULT_FOOTPRINT, gap: 0, size };
      const [spot] = edgeFootprintPlacements(0, 0, 600, 0, pref);
      expect(Math.abs(spot.y)).toBeGreaterThanOrEqual(halfWidth(size, pref.strokeWidth));
    }
  });

  it("한쪽 배치는 전부 같은 편에, 양쪽 배치는 번갈아 선다", () => {
    const right = edgeFootprintPlacements(0, 0, 900, 0, { ...DEFAULT_FOOTPRINT, placement: "right" });
    expect(new Set(right.map((s) => Math.sign(s.y))).size).toBe(1);

    const both = edgeFootprintPlacements(0, 0, 900, 0, { ...DEFAULT_FOOTPRINT, placement: "both" });
    expect(new Set(both.map((s) => Math.sign(s.y))).size).toBe(2);
  });

  /** 노드에 붙은 자국은 노드 장식으로 오독된다 — 양끝은 비운다. */
  it("선의 양 끝을 비운다", () => {
    const pref = DEFAULT_FOOTPRINT;
    const spots = edgeFootprintPlacements(0, 0, 900, 0, pref);
    const pad = pref.size * 1.6;
    for (const spot of spots) {
      expect(spot.x).toBeGreaterThanOrEqual(pad);
      expect(spot.x).toBeLessThanOrEqual(900 - pad);
    }
  });

  it("자국이 들어갈 자리가 없는 짧은 선에는 아무것도 찍지 않는다", () => {
    expect(edgeFootprintPlacements(0, 0, 10, 0, DEFAULT_FOOTPRINT)).toEqual([]);
  });
});

describe("formatStepNumbers", () => {
  it("셋 이하는 그대로 잇는다", () => {
    expect(formatStepNumbers([1])).toBe("1");
    expect(formatStepNumbers([1, 3, 5])).toBe("1·3·5");
  });

  /**
   * 축약하면서 총 횟수를 빼면 "여기 자주 돌아왔다"가 사라진다 — 그게 이 표기가
   * 나르려던 사실이므로, 그건 축약이 아니라 손실이다.
   */
  it("넷 이상은 줄이되 총 횟수를 함께 남긴다", () => {
    expect(formatStepNumbers([1, 3, 5, 9])).toBe("1·…·9 (총 4회)");
  });

  it("빈 목록은 빈 문자열", () => {
    expect(formatStepNumbers([])).toBe("");
  });
});
