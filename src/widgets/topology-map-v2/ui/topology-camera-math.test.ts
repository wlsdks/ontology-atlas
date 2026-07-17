import { describe, expect, it } from "vitest";

import {
  computeOverviewCameraTarget,
  computeOverviewFitScale,
  fitWorldTarget,
  worldToScreen,
} from "./topology-camera-math";

/**
 * DECOUPLING (topology-map-v2 axis split): the overview entry scale is the
 * tight bounding-box fit × `--topology-v2-overview-entry-ratio` (0.95), kept
 * ABOVE the altitude far-high ratio (0.92). Because `farHigh = fit.tscale *
 * 0.92` and the entry scale is `fit.tscale * 0.95 > farHigh`, `farT` reads as
 * (near) pure CIRCUIT (`farT ≈ 0`) on load by construction, for every dataset —
 * the machined default the redesign wants. Tier visibility (project/domain/hub
 * only at entry) is enforced separately by the zoom-ratio gate, not by farT.
 */
describe("computeOverviewCameraTarget", () => {
  const bounds = { minX: -100, minY: -100, maxX: 100, maxY: 100 };
  const tokens = { cameraScaleMax: 2.6, cameraScaleMin: 0.24, overviewEntryRatio: 0.95 };
  const FAR_HIGH_RATIO = 0.92; // --topology-v2-altitude-far-high-ratio

  it("scales the tight fit by overviewEntryRatio, keeping the same center", () => {
    const fit = fitWorldTarget(bounds, 1000, 1000, tokens.cameraScaleMax, tokens.cameraScaleMin);
    const overview = computeOverviewCameraTarget(bounds, 1000, 1000, tokens);

    expect(overview.tx).toBeCloseTo(fit.tx, 6);
    expect(overview.ty).toBeCloseTo(fit.ty, 6);
    expect(overview.tscale).toBeCloseTo(fit.tscale * tokens.overviewEntryRatio, 6);
  });

  it("puts the entry scale at/above the altitude far-high boundary — farT reads as circuit on load", () => {
    const fit = fitWorldTarget(bounds, 1000, 1000, tokens.cameraScaleMax, tokens.cameraScaleMin);
    const overview = computeOverviewCameraTarget(bounds, 1000, 1000, tokens);
    const farHigh = fit.tscale * FAR_HIGH_RATIO;

    expect(overview.tscale).toBeGreaterThanOrEqual(farHigh - 1e-9);
  });

  it("never returns a scale below cameraScaleMin even if the ratio would push it under", () => {
    // Large bounds → the raw fit is tiny and clamps up to the min floor (3);
    // the entry ratio (0.95) would then push it under 3, so the min-clamp must win.
    const huge = { minX: -1000, minY: -1000, maxX: 1000, maxY: 1000 };
    const overview = computeOverviewCameraTarget(huge, 1000, 1000, {
      ...tokens,
      cameraScaleMin: 3,
      cameraScaleMax: 5,
    });

    expect(overview.tscale).toBeGreaterThanOrEqual(3);
  });

  it("never returns a scale above cameraScaleMax", () => {
    // Tiny bounds → the raw fit would blow past the max; the entry scale must
    // still be clamped so it can't exceed cameraScaleMax.
    const tiny = { minX: -1, minY: -1, maxX: 1, maxY: 1 };
    const overview = computeOverviewCameraTarget(tiny, 1000, 1000, tokens);
    expect(overview.tscale).toBeLessThanOrEqual(tokens.cameraScaleMax + 1e-9);
  });
});

/**
 * Panel-aware fit (Design Guardian 카메라 반려) — the graph center must land in
 * the VISIBLE area (viewport minus the left ReaderLens panel + right rail), not
 * behind the panel.
 */
describe("computeOverviewCameraTarget — panel-aware safe insets", () => {
  const bounds = { minX: -100, minY: -100, maxX: 100, maxY: 100 };
  const W = 1000;
  const H = 800;
  const base = { cameraScaleMax: 2.6, cameraScaleMin: 0.24, overviewEntryRatio: 0.95 };

  it("renders the graph center at the visible-area midpoint, not the raw screen center", () => {
    const insetTokens = { ...base, safeInsetLeft: 344, safeInsetRight: 120, safeInsetTop: 96, safeInsetBottom: 96 };
    const target = computeOverviewCameraTarget(bounds, W, H, insetTokens);
    const camera = {
      x: { value: target.tx, velocity: 0 },
      y: { value: target.ty, velocity: 0 },
      scale: { value: target.tscale, velocity: 0 },
    };
    const centerScreen = worldToScreen(camera, W, H, 0, 0); // graph bounds center is (0,0)
    // Visible-area midpoint = (left + (W - right)) / 2, (top + (H - bottom)) / 2.
    expect(centerScreen.x).toBeCloseTo((344 + (W - 120)) / 2, 4);
    expect(centerScreen.y).toBeCloseTo((96 + (H - 96)) / 2, 4);
  });

  it("with a wider left panel than right, shifts the camera left so content clears the panel", () => {
    const insetTokens = { ...base, safeInsetLeft: 344, safeInsetRight: 120 };
    const withInsets = computeOverviewCameraTarget(bounds, W, H, insetTokens);
    const noInsets = computeOverviewCameraTarget(bounds, W, H, base);
    expect(withInsets.tx).toBeLessThan(noInsets.tx);
  });

  it("scales against the visible area, so a big left+right inset zooms the graph out", () => {
    // Large bounds so neither fit clamps to cameraScaleMax — the shrink is real.
    const big = { minX: -400, minY: -400, maxX: 400, maxY: 400 };
    const insetScale = computeOverviewFitScale(big, W, H, { ...base, safeInsetLeft: 344, safeInsetRight: 120 });
    const fullScale = computeOverviewFitScale(big, W, H, base);
    expect(insetScale).toBeLessThan(fullScale);
  });
});
