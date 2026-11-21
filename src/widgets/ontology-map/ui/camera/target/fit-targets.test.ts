import { describe, expect, it } from "vitest";

import { LABEL_OFFSET } from "../../../render/labels";
import { worldToScreen } from "../topology-camera-math";
import { computeLensFitTarget, computeOverviewCameraTarget, computeOverviewFitScale, domeFitFreeHalfSize, fitWorldTarget } from "./fit-targets";

const OVERVIEW_LABEL_BOTTOM_ALLOWANCE = Math.max(...Object.values(LABEL_OFFSET)) + 4;

describe("domeFitFreeHalfSize", () => {
  const insets = { left: 200, right: 0, top: 0, bottom: 0 };

  it("is half the free canvas times the fill, less a disc on each side", () => {
    expect(domeFitFreeHalfSize(1000, 800, insets, 10, { domeFitFill: 0.9 })).toEqual({ halfW: 350, halfH: 350 });
  });

  it("takes a fill of zero or less as the whole free canvas", () => {
    expect(domeFitFreeHalfSize(1000, 800, insets, 10, { domeFitFill: 0 })).toEqual({ halfW: 390, halfH: 390 });
  });

  it("stays at least a pixel when the discs outgrow the canvas", () => {
    expect(domeFitFreeHalfSize(30, 30, { left: 0, right: 0, top: 0, bottom: 0 }, 40, { domeFitFill: 1 })).toEqual({ halfW: 0.5, halfH: 0.5 });
  });
});

describe("computeOverviewFitScale", () => {
  const bounds = { minX: 0, minY: 0, maxX: 10, maxY: 10 };
  const tokens = { cameraScaleMax: 10, cameraScaleMin: 0.1, cameraSmallGraphScaleMax: 2 };

  it("caps a graph of five nodes or fewer at the small-graph ceiling", () => {
    expect(computeOverviewFitScale(bounds, 1000, 800, tokens, 5)).toBe(2);
  });

  it("lets a graph of six nodes, or one of unknown size, fit up to the camera maximum", () => {
    expect(computeOverviewFitScale(bounds, 1000, 800, tokens, 6)).toBe(10);
    expect(computeOverviewFitScale(bounds, 1000, 800, tokens)).toBe(10);
  });
});

/**
 * DECOUPLING (ontology-map axis split): the overview entry scale is the
 * tight bounding-box fit × `--map-overview-entry-ratio` (0.95), kept
 * ABOVE the altitude far-high ratio (0.92). Because `farHigh = fit.tscale *
 * 0.92` and the entry scale is `fit.tscale * 0.95 > farHigh`, `farT` reads as
 * (near) pure CIRCUIT (`farT ≈ 0`) on load by construction, for every dataset —
 * the machined default the redesign wants. Tier visibility (project/domain/hub
 * only at entry) is enforced separately by the zoom-ratio gate, not by farT.
 */
describe("computeOverviewCameraTarget", () => {
  it("uses one label reservation when the scene already includes its label pad", () => {
    const bounds = { minX: -100, maxX: 100, minY: -500, maxY: 500 };
    const tokens = { cameraScaleMax: 2.6, cameraScaleMin: 0.02, cameraSmallGraphScaleMax: 1.3, safeInsetTop: 112, safeInsetBottom: 72 };
    const padPx = { left: 24, right: 24, top: 24, bottom: 24 };
    const single = computeOverviewFitScale(bounds, 1448, 806, tokens, 125, { padPx, labelBottomAllowance: 0 });
    const classic = computeOverviewFitScale(bounds, 1448, 806, tokens, 125, { padPx });
    expect(single * 1000).toBeCloseTo(806 - 112 - 72 - 48);
    expect((single - classic) * 1000).toBeCloseTo(OVERVIEW_LABEL_BOTTOM_ALLOWANCE);
  });
  const bounds = { minX: -100, minY: -100, maxX: 100, maxY: 100 };
  const tokens = { cameraScaleMax: 2.6, cameraScaleMin: 0.24, cameraSmallGraphScaleMax: 1.3, overviewEntryRatio: 0.95 };
  const FAR_HIGH_RATIO = 0.92; // --map-altitude-far-high-ratio

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

  it("#11 — caps the fit at cameraSmallGraphScaleMax for a small (≤5-node) graph", () => {
    // Onboarding: a 1–3-node vault has minuscule bounds, so the plain fit
    // pins to cameraScaleMax (2.6) and a lone hexagon fills half the screen.
    // With nodeCount ≤ 5 the fit is capped at cameraSmallGraphScaleMax (1.3),
    // then the entry ratio applies — well under the plain-fit ceiling.
    const tiny = { minX: -1, minY: -1, maxX: 1, maxY: 1 };
    const clamped = computeOverviewCameraTarget(tiny, 1000, 1000, tokens, 1);
    expect(clamped.tscale).toBeLessThanOrEqual(
      tokens.cameraSmallGraphScaleMax * tokens.overviewEntryRatio + 1e-9);
    // …and it must be strictly tighter than the un-clamped (no nodeCount) fit.
    const unclamped = computeOverviewCameraTarget(tiny, 1000, 1000, tokens);
    expect(clamped.tscale).toBeLessThan(unclamped.tscale);
  });

  it("#11 — does NOT clamp a larger graph: big bounds never reach the small-graph ceiling anyway", () => {
    // A many-node vault (nodeCount > 5) keeps the full cameraScaleMax path, but
    // its bounds are large so the fit is far below either ceiling — passing the
    // count must not change the result for a normal graph.
    const wide = { minX: -400, minY: -400, maxX: 400, maxY: 400 };
    const withCount = computeOverviewCameraTarget(wide, 1000, 1000, tokens, 200);
    const without = computeOverviewCameraTarget(wide, 1000, 1000, tokens);
    expect(withCount.tscale).toBeCloseTo(without.tscale, 6);
  });
});

/**
 * Panel-aware fit (the Design Guardian's camera rejection) — the graph center must
 * land in the VISIBLE area (viewport minus the left ReaderLens panel + right rail),
 * not behind the panel.
 */
describe("computeOverviewCameraTarget — panel-aware safe insets", () => {
  const bounds = { minX: -100, minY: -100, maxX: 100, maxY: 100 };
  const W = 1000;
  const H = 800;
  const base = { cameraScaleMax: 2.6, cameraScaleMin: 0.24, cameraSmallGraphScaleMax: 1.3, overviewEntryRatio: 0.95 };

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
    // The bottom inset adds the label allowance (derived from LABEL_OFFSET) —
    // review pass B defect 1's reservation, where the bottom-most spine node's
    // label was pushed outside the label safe-rect in the 1440×900 fit.
    expect(centerScreen.x).toBeCloseTo((344 + (W - 120)) / 2, 4);
    expect(centerScreen.y).toBeCloseTo(
      (96 + (H - 96 - OVERVIEW_LABEL_BOTTOM_ALLOWANCE)) / 2,
      4);
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

describe("computeLensFitTarget — beside the panels, not on the raw viewport", () => {
  const bounds = { minX: 0, minY: 0, maxX: 1000, maxY: 1000 };
  const tokens = { cameraScaleMax: 2.6, cameraScaleMin: 0.24 };

  it("with no insets is exactly the plain fit", () => {
    expect(computeLensFitTarget(bounds, 1440, 802, tokens)).toEqual(
      fitWorldTarget(bounds, 1440, 802, tokens.cameraScaleMax, tokens.cameraScaleMin));
  });

  it("lands the bounds centre at the midpoint of the width left beside the panels", () => {
    const insets = { safeInsetLeft: 350, safeInsetRight: 120 };
    const target = computeLensFitTarget(bounds, 1440, 802, { ...tokens, ...insets });
    // Width-limited: 970 px of free width against 1000 world units, so the
    // height (802) is the binding side.
    expect(target.tscale).toBeCloseTo(802 / 1000, 6);
    const camera = { x: { value: target.tx, velocity: 0 }, y: { value: target.ty, velocity: 0 }, scale: { value: target.tscale, velocity: 0 } };
    const centre = worldToScreen(camera, 1440, 802, 500, 500);
    expect(centre.x).toBeCloseTo(350 + (1440 - 350 - 120) / 2, 6);
    expect(centre.y).toBeCloseTo(802 / 2, 6);
  });

  it("does not reserve the top and bottom lanes — the lens bounds carry their own padding", () => {
    const wide = { minX: 0, minY: 0, maxX: 3000, maxY: 1000 };
    const withBottom = computeLensFitTarget(wide, 1440, 802, { ...tokens, safeInsetTop: 148, safeInsetBottom: 96 });
    const without = computeLensFitTarget(wide, 1440, 802, tokens);
    expect(withBottom).toEqual(without);
  });
});

describe("overview fit options (Flat dial)", () => {
    const bounds = { minX: -300, minY: -150, maxX: 900, maxY: 450 };
    const tokens = { cameraScaleMax: 2.6, cameraScaleMin: 0.24, cameraSmallGraphScaleMax: 1.3, overviewEntryRatio: 0.95 };
    const centreX = (bounds.minX + bounds.maxX) / 2;
    const centreY = (bounds.minY + bounds.maxY) / 2;
    it("equals the old result with a zero pad and no floor", () => {
        const zero = { padPx: { left: 0, right: 0, top: 0, bottom: 0 } };
        expect(computeOverviewCameraTarget(bounds, 1200, 800, tokens, undefined, zero)).toEqual(computeOverviewCameraTarget(bounds, 1200, 800, tokens));
        expect(computeOverviewFitScale(bounds, 1200, 800, tokens, undefined, zero)).toBe(computeOverviewFitScale(bounds, 1200, 800, tokens));
    });
    it("shrinks the scale and shifts the centre by (left - right) / (2 scale)", () => {
        const padPx = { left: 120, right: 40, top: 30, bottom: 10 };
        const plain = computeOverviewCameraTarget(bounds, 1200, 800, tokens);
        const padded = computeOverviewCameraTarget(bounds, 1200, 800, tokens, undefined, { padPx });
        expect(padded.tscale).toBeLessThan(plain.tscale);
        expect(padded.tx).toBeCloseTo(centreX - (padPx.left - padPx.right) / (2 * padded.tscale), 9);
        expect(padded.ty).toBeCloseTo(centreY - (padPx.top - padPx.bottom) / (2 * padded.tscale), 9);
        expect(computeOverviewFitScale(bounds, 1200, 800, tokens, undefined, { padPx })).toBeCloseTo((1200 - 160) / 1200, 9);
    });
    it("lets a scale floor stand in for cameraScaleMin", () => {
        const huge = { minX: -40000, minY: -40000, maxX: 40000, maxY: 40000 };
        expect(computeOverviewFitScale(huge, 1000, 1000, tokens)).toBe(tokens.cameraScaleMin);
        expect(computeOverviewFitScale(huge, 1000, 1000, tokens, undefined, { scaleFloor: 0.002 })).toBeCloseTo(1000 / 80000, 9);
        expect(computeOverviewCameraTarget(huge, 1000, 1000, tokens, undefined, { scaleFloor: 0.002 }).tscale).toBeCloseTo((1000 / 80000) * 0.95, 9);
    });
});
