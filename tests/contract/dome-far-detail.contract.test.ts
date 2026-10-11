import { describe, expect, it } from "vitest";
import {
  DOME_DETAIL_FADE_END,
  DOME_DETAIL_FADE_START,
  domeDetailFactor,
  domeHaloPx,
} from "@/widgets/ontology-map/model/dome-view/ink";

/**
 * Far-side strokes fold away through `domeDetailFactor(u)`: exactly 1 on the near side (u <= 0.5)
 * and continuous in depth so no stroke pops (Lipschitz bound; smoothstep slope is 1.5/(END-START)).
 * `domeHaloPx(u) * domeDetailFactor(u)` must be continuous too: the draw skips halos below 0.05px.
 */
describe("dome-far-detail — 먼 쪽 상세 생략은 깊이에 연속이다 (팝 금지)", () => {
  const H = 0.001;
  /** smoothstep's maximum slope 1.5/(END-START), with 7% headroom. */
  const MAX_STEP = (1.5 / (DOME_DETAIL_FADE_END - DOME_DETAIL_FADE_START)) * H * 1.07;

  it("앞쪽 반구(u ≤ 0.5)는 인자 1 — 관찰자 쪽 픽셀 불변의 근거", () => {
    expect(DOME_DETAIL_FADE_START).toBeGreaterThanOrEqual(0.5);
    expect(domeDetailFactor(0)).toBe(1);
    expect(domeDetailFactor(0.5)).toBe(1);
  });

  it("램프에 계단이 없다 — 립시츠 상한(smoothstep 최대 기울기)", () => {
    let maxStep = 0;
    for (let u = 0; u < 1; u += H) {
      const step = Math.abs(domeDetailFactor(u + H) - domeDetailFactor(u));
      if (step > maxStep) maxStep = step;
    }
    expect(maxStep).toBeGreaterThan(0); // The detector is not idling on an empty set
    expect(maxStep).toBeLessThanOrEqual(MAX_STEP);
  });

  it("헤일로 폭 곱(domeHaloPx × detail)도 연속이다 — 0.05px 스킵 게이트가 문턱이 되지 않는다", () => {
    let maxStep = 0;
    for (let u = 0; u < 1; u += H) {
      const a = domeHaloPx(u) * domeDetailFactor(u);
      const b = domeHaloPx(u + H) * domeDetailFactor(u + H);
      const step = Math.abs(b - a);
      if (step > maxStep) maxStep = step;
    }
    expect(maxStep).toBeGreaterThan(0);
    // 0.02px per 0.001u — under half the skip gate (0.05px), so no pair of frames can
    // make a stroke appear or vanish at a visible width.
    expect(maxStep).toBeLessThanOrEqual(0.02);
  });

  it("생략은 END(<1) 에서 완결된다 — 이미 안개가 깊은 구간", () => {
    expect(DOME_DETAIL_FADE_END).toBeLessThan(1);
    expect(DOME_DETAIL_FADE_END).toBeGreaterThan(DOME_DETAIL_FADE_START);
    expect(domeDetailFactor(DOME_DETAIL_FADE_END)).toBe(0);
  });
});
