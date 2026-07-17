import { describe, expect, it } from "vitest";

import { computeOverviewCameraTarget, fitWorldTarget } from "./topology-camera-math";

/**
 * Regression (QA first-light pass, blocker 2 — "real-data density
 * breakdown"): with the dogfood vault's 107 nodes, the initial camera landed
 * at exactly the tight bounding-box fit scale (verified manually: ~0.918 for
 * a ~950×985 world bbox). `model/altitude.ts`'s `farHigh`/`farLow` are
 * defined as fractions (0.92/0.62) of that SAME fit scale, so starting the
 * camera exactly at the fit scale puts `cameraScale` just barely above
 * `farHigh` for every dataset, every time — `farT` is *structurally* always
 * ~0 ("circuit"/near-field, capability+element labels all visible) right on
 * load, never the simplified "constellation" state the design's own
 * overview-first charter (`.claude/rules/design.md`) wants as the default.
 * `computeOverviewCameraTarget` starts the camera pulled back to (at most)
 * the existing `altitudeFarLowRatio` fraction of the tight fit — landing
 * `farT` near 1 by construction, using a token this module already reads
 * rather than inventing a new tuning constant.
 */
describe("computeOverviewCameraTarget", () => {
  const bounds = { minX: -100, minY: -100, maxX: 100, maxY: 100 };
  const tokens = { cameraScaleMax: 2.6, cameraScaleMin: 0.24, altitudeFarLowRatio: 0.62 };

  it("scales the tight fit down by altitudeFarLowRatio, keeping the same center", () => {
    const fit = fitWorldTarget(bounds, 1000, 1000, tokens.cameraScaleMax, tokens.cameraScaleMin);
    const overview = computeOverviewCameraTarget(bounds, 1000, 1000, tokens);

    expect(overview.tx).toBeCloseTo(fit.tx, 6);
    expect(overview.ty).toBeCloseTo(fit.ty, 6);
    expect(overview.tscale).toBeCloseTo(fit.tscale * tokens.altitudeFarLowRatio, 6);
  });

  it("never returns a scale below cameraScaleMin even if the ratio would push it under", () => {
    const overview = computeOverviewCameraTarget(bounds, 1000, 1000, {
      ...tokens,
      cameraScaleMin: 3, // absurdly high floor, forces the clamp branch
    });

    expect(overview.tscale).toBeGreaterThanOrEqual(3);
  });

  it("puts the resulting scale at/below the altitude far-low boundary — farT reads as (near) pure constellation on load", () => {
    const fit = fitWorldTarget(bounds, 1000, 1000, tokens.cameraScaleMax, tokens.cameraScaleMin);
    const overview = computeOverviewCameraTarget(bounds, 1000, 1000, tokens);
    const farLow = fit.tscale * tokens.altitudeFarLowRatio;

    expect(overview.tscale).toBeLessThanOrEqual(farLow + 1e-9);
  });
});
