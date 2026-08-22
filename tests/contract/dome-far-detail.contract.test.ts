import { describe, expect, it } from "vitest";
import {
  DOME_DETAIL_FADE_END,
  DOME_DETAIL_FADE_START,
  domeDetailFactor,
  domeHaloPx,
} from "@/widgets/topology-map-v2/model/dome-view";

/**
 * Far-side detail elision — the "no pop" contract (2026-08-19, owner decision).
 *
 * ## What is locked
 *
 * On the far hemisphere the 3D dome folds away its secondary strokes (depth halo,
 * volumetric shading, metallic sheen, outline, domain pin ticks) through
 * `domeDetailFactor(u)`. All three things this elision must uphold depend on the
 * **shape** of that function:
 *
 * 1. **No change on the near side** — the factor must be exactly 1 on the
 *    observer's hemisphere (u ≤ 0.5) so not one near-side pixel differs.
 * 2. **No pop** — rotating the dome moves nodes continuously along the depth axis.
 *    A threshold (a step) in the factor makes a stroke vanish abruptly at that
 *    instant. This is locked with a Lipschitz bound: smoothstep's maximum slope is
 *    1.5/(END-START), and a single stretch steeper than that (i.e. a hard cut)
 *    raises a red light.
 * 3. **The skip gate only below the visibility limit** — the draw skips a stroke
 *    entirely when the halo width falls below 0.05px. For that gate not to become a
 *    threshold, the product `domeHaloPx(u) × domeDetailFactor(u)` must itself be
 *    continuous in depth.
 *
 * ## Gate probe (red confirmed, 2026-08-19)
 *
 * Replacing `domeDetailFactor` with a hard cut (`u > 0.65 ? 0 : 1`):
 * - Lipschitz check: maximum change per step 1.0 (bound 0.008) → ❌
 * - Product continuity: maximum change per step 0.827px (bound 0.02px) → ❌
 * - The near-side and midpoint checks stay green (depending on where the cut sits) —
 *   which is why the Lipschitz check is this contract's heart.
 * Measured on the healthy implementation: Lipschitz max 0.00750 per step (under the
 * 0.008025 bound) and product max 0.00864px per step (under the 0.02px bound) — the
 * thresholds sit between healthy and defective with margins of healthy×1.07
 * (Lipschitz) and healthy×2.3 (product), or defect÷125 and defect÷41.
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
