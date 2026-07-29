import { describe, expect, it } from "vitest";

import { DEFAULT_FOOTPRINT, FOOTPRINT_EDGE_SCALE } from "./appearance-preferences";
import {
  FOOTPRINT_SCALE_RANGE,
  edgeFootprintPlacements,
  footprintAnchor,
  footprintPairRadius,
  footprintScaleFor,
  formatStepNumbers,
} from "./footprint-glyph";

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

/**
 * 자국이 노드 원판을 파고들던 결함(설치 앱 실측, 소유자: *"겹쳐지는건 없게
 * 하고싶은데"*). 원인은 `gap` 이 자국 **중심**까지의 거리였다는 것 — 겹침은
 * 중심이 아니라 가장자리 조건이다.
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
 * 줌아웃에서 겹침이 가장 심하다 — 노드·관계선이 화면에 몰리는데 자국만 고정
 * 픽셀이면 자국이 그래프를 덮는다. 소유자가 허용한 완화책이 크기 축소다.
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

/** 배율은 선 옆 자국의 간격·크기·양끝 여백에 **함께** 걸려야 한다. */
describe("배율이 선 옆 자국에도 걸린다", () => {
  it("축소하면 자국이 선에 더 가까이 붙되 여전히 겹치지 않는다", () => {
    const pref = { ...DEFAULT_FOOTPRINT, gap: 0 };
    for (const scale of [0.55, 0.8, 1]) {
      const size = pref.size * scale;
      const half = size * FOOTPRINT_EDGE_SCALE * 0.26 + pref.strokeWidth / 2;
      for (const spot of edgeFootprintPlacements(0, 0, 900, 0, pref, scale)) {
        expect(Math.abs(spot.y)).toBeGreaterThanOrEqual(half - 1e-9);
      }
    }
  });
});
