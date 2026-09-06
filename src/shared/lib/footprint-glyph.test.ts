import { describe, expect, it } from "vitest";

import { DEFAULT_FOOTPRINT, FOOTPRINT_EDGE_SCALE } from "./appearance-preferences";
import {
  FOOTPRINT_MIN_SIZE,
  FOOTPRINT_NODE_RATIO,
  FOOTPRINT_SCALE_RANGE,
  edgeFootprintPlacements,
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

/**
 * The properties of prints beside a line are verifiable **from coordinates alone** — no
 * canvas needed, and more accurate than judging the picture by eye. In the installed app the
 * prints were running straight through the line (the offset was smaller than the print's
 * half-width), a defect human review had already missed once.
 */
describe("edgeFootprintPlacements", () => {
  /** Half-width of one foot — the ball ellipse's x radius plus half the stroke. */
  const halfWidth = (size: number, stroke: number) => size * FOOTPRINT_EDGE_SCALE * 0.26 + stroke / 2;

  it("자국이 선을 관통하지 않는다 — 중심 거리가 아니라 가장자리로 잰다", () => {
    const pref = { ...DEFAULT_FOOTPRINT, gap: 0, size: 26 };
    // The line is horizontal, so the normal distance is |y - the line's y|.
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

  /** A print touching a node is misread as node decoration, so both ends stay empty. */
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

/**
 * The prints used to be laid along the straight chord while the relation is drawn as a
 * quadratic Bézier, so on a bowed edge the middle prints sat on the inside of the bow —
 * on top of the very line the offset exists to clear (owner, 2026-09-06, screenshot of a
 * walked Orders → Customers pair). The gate is distance **to the curve**, sampled densely,
 * because that is the thing on screen; the chord is not.
 */
describe("edgeFootprintPlacements — on a bowed edge the prints follow the curve", () => {
  /**
   * A real map geometry, not an exaggerated one: a 200px edge with the containment bow
   * (`computeBowControlPoint`, capped at 92 world units and blended 0.46 → 42px off the
   * chord). Laid along the chord, the first and last of the five prints measure **-3.0px**
   * clearance — the glyph body straddling the drawn line. That is the defect.
   */
  const A = { x: 200, y: 520 };
  const B = { x: 392, y: 464 };
  /** Chord midpoint pushed 42px along the chord normal. */
  const CONTROL = { x: 307.76, y: 532.32 };

  const curveAt = (t: number) => {
    const u = 1 - t;
    return {
      x: u * u * A.x + 2 * u * t * CONTROL.x + t * t * B.x,
      y: u * u * A.y + 2 * u * t * CONTROL.y + t * t * B.y,
    };
  };
  /** Shortest distance from a point to the drawn curve, by dense sampling. */
  const distanceToCurve = (x: number, y: number) => {
    let best = Infinity;
    for (let i = 0; i <= 2000; i += 1) {
      const p = curveAt(i / 2000);
      best = Math.min(best, Math.hypot(p.x - x, p.y - y));
    }
    return best;
  };
  const halfWidth = (size: number, stroke: number) => size * FOOTPRINT_EDGE_SCALE * 0.26 + stroke / 2;

  it("no print comes closer to the curve than the offset it was placed at", () => {
    for (const placement of ["right", "both"] as const) {
      const pref = { ...DEFAULT_FOOTPRINT, placement };
      const offset = pref.gap + halfWidth(pref.size, pref.strokeWidth);
      for (const spot of edgeFootprintPlacements(A.x, A.y, B.x, B.y, pref, 1, CONTROL)) {
        const clearance = distanceToCurve(spot.x, spot.y);
        expect(
          clearance,
          `자국이 곡선을 파고들었다 (${placement}, 여유 ${clearance.toFixed(2)}px / 목표 ${offset.toFixed(2)}px)`,
        ).toBeGreaterThanOrEqual(offset - 0.05);
      }
    }
  });

  it("the glyph body itself never crosses the curve, even with no gap", () => {
    const pref = { ...DEFAULT_FOOTPRINT, gap: 0, size: 26 };
    for (const spot of edgeFootprintPlacements(A.x, A.y, B.x, B.y, pref, 1, CONTROL)) {
      const clearance = distanceToCurve(spot.x, spot.y) - halfWidth(pref.size, pref.strokeWidth);
      expect(clearance, `자국이 곡선 위에 얹혔다 (여유 ${clearance.toFixed(2)}px)`).toBeGreaterThanOrEqual(-0.05);
    }
  });

  it("one row stands on the convex side, both alternate across the curve", () => {
    /**
     * Which side of the curve a print stands on, judged at its **nearest** point on the
     * curve. A single global line cannot answer this: a bowed curve leaves the midpoint
     * tangent on both sides near the ends, so measuring against one line calls a print
     * that never left the outer side "inside".
     */
    const sideOf = (spot: { x: number; y: number }) => {
      let bestT = 0;
      let best = Infinity;
      for (let i = 0; i <= 2000; i += 1) {
        const t = i / 2000;
        const p = curveAt(t);
        const d = Math.hypot(p.x - spot.x, p.y - spot.y);
        if (d < best) {
          best = d;
          bestT = t;
        }
      }
      const foot = curveAt(bestT);
      const ahead = curveAt(Math.min(1, bestT + 1e-4));
      const angle = Math.atan2(ahead.y - foot.y, ahead.x - foot.x);
      const nx = Math.cos(angle + Math.PI / 2);
      const ny = Math.sin(angle + Math.PI / 2);
      // Positive = the side the control point bulges towards, i.e. the convex, outer side.
      const towardControl =
        nx * (CONTROL.x - (A.x + B.x) / 2) + ny * (CONTROL.y - (A.y + B.y) / 2) >= 0 ? 1 : -1;
      return Math.sign((nx * (spot.x - foot.x) + ny * (spot.y - foot.y)) * towardControl);
    };

    const right = edgeFootprintPlacements(A.x, A.y, B.x, B.y, { ...DEFAULT_FOOTPRINT, placement: "right" }, 1, CONTROL);
    expect(new Set(right.map(sideOf))).toEqual(new Set([1]));

    const both = edgeFootprintPlacements(A.x, A.y, B.x, B.y, { ...DEFAULT_FOOTPRINT, placement: "both" }, 1, CONTROL);
    expect(new Set(both.map(sideOf)).size).toBe(2);
  });

  it("the print angle follows the local tangent, not one chord angle", () => {
    const spots = edgeFootprintPlacements(A.x, A.y, B.x, B.y, DEFAULT_FOOTPRINT, 1, CONTROL);
    const angles = spots.map((s) => s.angle);
    expect(Math.max(...angles) - Math.min(...angles)).toBeGreaterThan(0.1);
  });

  it("a control point on the chord reproduces the straight placements exactly", () => {
    const straight = edgeFootprintPlacements(0, 0, 900, 0, DEFAULT_FOOTPRINT);
    const withControl = edgeFootprintPlacements(0, 0, 900, 0, DEFAULT_FOOTPRINT, 1, { x: 450, y: 0 });
    expect(withControl).toEqual(straight);
    // Off-centre but still collinear: the same straight line, so the same picture.
    const offCentre = edgeFootprintPlacements(0, 0, 900, 0, DEFAULT_FOOTPRINT, 1, { x: 300, y: 0 });
    expect(offCentre).toEqual(straight);
  });

  it("keeps both ends of the curve clear by real arc length", () => {
    const pref = DEFAULT_FOOTPRINT;
    const pad = pref.size * 1.6;
    for (const spot of edgeFootprintPlacements(A.x, A.y, B.x, B.y, pref, 1, CONTROL)) {
      expect(Math.hypot(spot.x - A.x, spot.y - A.y)).toBeGreaterThan(pad);
      expect(Math.hypot(spot.x - B.x, spot.y - B.y)).toBeGreaterThan(pad);
    }
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

/** The size factor must apply to spacing, size and end padding of edge prints **together**. */
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
