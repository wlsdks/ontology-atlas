import { describe, expect, it } from "vitest";

import { DEFAULT_TIER_REVEAL } from "../model/tier-visibility";
import {
  computeEffectiveCameraScaleMax,
  computeEffectiveCameraScaleMin,
  computeFocusCameraTarget,
  computeOverviewCameraTarget,
  computeOverviewFitScale,
  fitWorldTarget,
  worldToScreen,
} from "./topology-camera-math";
import type { TopologyV2Tokens } from "../tokens/read-topology-v2-tokens";
import { computeEgoBounds, type TopologyWorld } from "./topology-world";

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

/**
 * C1 A1 — ratio-based zoom ceiling. Audit finding: the overview entry scale is
 * viewport-proportional (≈1.5 at 1512×917), so binding the interactive zoom max
 * to the ABSOLUTE `--topology-v2-camera-scale-max` (2.6) caps zoomRatio at
 * ≈1.8 — the capability reveal band (1.5→2.0) never finishes and the element
 * band (2.3→2.85) is unreachable. The effective max must instead be
 * `overviewEntryScale × maxZoomRatio`, constant in RATIO terms across every
 * viewport, and reach at least the element tier's `fullRatio` (2.85) + margin.
 */
describe("computeEffectiveCameraScaleMax", () => {
  const MAX_ZOOM_RATIO = 3.2; // --topology-v2-camera-max-zoom-ratio
  const ABSOLUTE_FALLBACK = 2.6; // --topology-v2-camera-scale-max

  it.each([1.0, 1.5, 2.2])(
    "yields a constant zoom ratio of maxZoomRatio for any overview entry scale (%f)",
    (overviewEntryScale) => {
      const effectiveMax = computeEffectiveCameraScaleMax(overviewEntryScale, MAX_ZOOM_RATIO, ABSOLUTE_FALLBACK);
      const zoomRatio = effectiveMax / overviewEntryScale;
      expect(zoomRatio).toBeCloseTo(MAX_ZOOM_RATIO, 6);
      expect(zoomRatio).toBeGreaterThanOrEqual(DEFAULT_TIER_REVEAL.element.fullRatio);
    },
  );

  it("falls back to the absolute token when the entry scale is invalid (0 or negative)", () => {
    expect(computeEffectiveCameraScaleMax(0, MAX_ZOOM_RATIO, ABSOLUTE_FALLBACK)).toBe(ABSOLUTE_FALLBACK);
    expect(computeEffectiveCameraScaleMax(-1, MAX_ZOOM_RATIO, ABSOLUTE_FALLBACK)).toBe(ABSOLUTE_FALLBACK);
  });
});

/**
 * C1 A1 follow-up — ratio-based zoom-out floor (owner feedback: wheel zoom
 * out shouldn't shrink the spine to a speck on some viewports and barely
 * budge on others). Symmetric to `computeEffectiveCameraScaleMax`.
 */
describe("computeEffectiveCameraScaleMin", () => {
  const MIN_ZOOM_RATIO = 0.5; // --topology-v2-camera-min-zoom-ratio
  const ABSOLUTE_FALLBACK = 0.24; // --topology-v2-camera-scale-min

  it.each([1.0, 1.5, 2.2])(
    "yields a constant zoom ratio of minZoomRatio for any overview entry scale (%f)",
    (overviewEntryScale) => {
      const effectiveMin = computeEffectiveCameraScaleMin(overviewEntryScale, MIN_ZOOM_RATIO, ABSOLUTE_FALLBACK);
      const zoomRatio = effectiveMin / overviewEntryScale;
      expect(zoomRatio).toBeCloseTo(MIN_ZOOM_RATIO, 6);
    },
  );

  it("stays below the constellation crossfade's own zoom ratio (so zoom-out still reaches far-field)", () => {
    // farLow (in zoom-ratio terms) = (overviewScale * altitudeFarLowRatio) / (overviewScale * overviewEntryRatio)
    //                              = altitudeFarLowRatio / overviewEntryRatio
    const FAR_LOW_RATIO = 0.62;
    const OVERVIEW_ENTRY_RATIO = 0.95;
    const farLowZoomRatio = FAR_LOW_RATIO / OVERVIEW_ENTRY_RATIO;
    expect(MIN_ZOOM_RATIO).toBeLessThan(farLowZoomRatio);
  });

  it("falls back to the absolute token when the entry scale is invalid (0 or negative)", () => {
    expect(computeEffectiveCameraScaleMin(0, MIN_ZOOM_RATIO, ABSOLUTE_FALLBACK)).toBe(ABSOLUTE_FALLBACK);
    expect(computeEffectiveCameraScaleMin(-1, MIN_ZOOM_RATIO, ABSOLUTE_FALLBACK)).toBe(ABSOLUTE_FALLBACK);
  });
});

/**
 * Dive-framing fix (owner symptom: "clicking a node dives TOO deep —
 * over-zoomed, cluttered, labels colliding; pleasant view only after zooming
 * way out"). The old C1 A3 `revealFloor = overviewEntryScale ×
 * capability.fullRatio` forced every dive to zoomRatio ≥ 2.0 REGARDLESS of the
 * ego cluster's own size — fine for a tight cluster, but a wide-fan domain
 * (many spread-out neighbors) was zoomed in far past what fitting that fan
 * actually needed, packing it into a sliver of the viewport. The floor is now
 * redundant anyway: C1 A2's ego-tier exemption already keeps the focused node
 * + its 1-hop neighbors visible/clickable at ANY zoom, so nothing needs a
 * minimum zoom-in to "reveal" them.
 *
 * New target: `tscale = clamp(fitScale(egoBounds × marginRatio), overviewEntryScale, effectiveMax)`
 * — fits the WHOLE ego set (padded by `--topology-v2-focus-bbox-margin`, now a
 * multiplicative ratio ~1.15 rather than a fixed px pad, so the padding scales
 * with cluster size), floored at the overview's own entry scale (a dive never
 * zooms OUT past the overview itself) and capped at the ratio-based effective
 * max (unreadable/degenerate tiny-ego case).
 */
describe("computeFocusCameraTarget — fit-to-ego dive (dive-framing fix)", () => {
  const baseTokens = {
    cameraScaleMax: 2.6,
    cameraMaxZoomRatio: 3.2,
    cameraScaleMin: 0.24,
    overviewEntryRatio: 0.95,
    focusFitMaxScale: 1.9,
    focusBboxMargin: 1.15,
    radiusProject: 25,
    radiusDomain: 17,
    radiusCapability: 11,
    radiusElement: 7,
  } as unknown as TopologyV2Tokens;

  function egoWorld(nodeXY: Record<string, { x: number; y: number; kind: "project" | "domain" | "capability" | "element" }>, neighbors: Record<string, string[]>): TopologyWorld {
    const nodeById = new Map(
      Object.entries(nodeXY).map(([id, v]) => [
        id,
        { id, kind: v.kind, label: id, x: v.x, y: v.y, homeX: v.x, homeY: v.y, isHub: false, fresh: false, stale: false, count: 0 },
      ]),
    );
    const neighborMap = new Map(Object.entries(neighbors).map(([id, ns]) => [id, new Set(ns)]));
    return {
      nodes: [...nodeById.values()],
      nodeById,
      edges: [],
      neighborMap,
      brightStarIds: new Set(),
      bounds: { minX: -100, minY: -100, maxX: 100, maxY: 100 },
      spineBounds: { minX: -100, minY: -100, maxX: 100, maxY: 100 },
    } as TopologyWorld;
  }

  it("fits the WHOLE ego set for a wide-fan domain — lands at the natural fit, never deeper than needed (owner: dive too deep)", () => {
    const world = egoWorld(
      {
        f: { x: 0, y: 0, kind: "domain" },
        n1: { x: 150, y: 0, kind: "capability" },
        n2: { x: -150, y: 0, kind: "capability" },
        n3: { x: 0, y: 150, kind: "capability" },
        n4: { x: 0, y: -150, kind: "capability" },
      },
      { f: ["n1", "n2", "n3", "n4"], n1: ["f"], n2: ["f"], n3: ["f"], n4: ["f"] },
    );
    const overviewEntryScale = 1.5;
    const viewportWidth = 1200;
    const viewportHeight = 800;
    const target = computeFocusCameraTarget(world, baseTokens, viewportWidth, viewportHeight, "f", overviewEntryScale);
    expect(target).not.toBeNull();

    const egoBounds = computeEgoBounds(world, baseTokens, "f")!;
    const marginRatio = baseTokens.focusBboxMargin;
    const w = (egoBounds.maxX - egoBounds.minX) * marginRatio;
    const h = (egoBounds.maxY - egoBounds.minY) * marginRatio;
    const expectedFit = Math.min(viewportWidth / w, viewportHeight / h);

    expect(target!.tscale).toBeCloseTo(expectedFit, 6);
    // The old revealFloor (overviewEntryScale × capability.fullRatio = 3.0) would
    // have forced a much deeper dive than this wide fan's natural fit needs.
    expect(target!.tscale).toBeLessThan(overviewEntryScale * DEFAULT_TIER_REVEAL.capability.fullRatio);
  });

  it("for a tiny ego (leaf with 1 neighbor), clamps by effectiveMax only — no floor drags it deeper than the fit needs", () => {
    const world = egoWorld(
      { f: { x: 0, y: 0, kind: "domain" }, n1: { x: 5, y: 0, kind: "capability" } },
      { f: ["n1"], n1: ["f"] },
    );
    const overviewEntryScale = 1.5;
    const target = computeFocusCameraTarget(world, baseTokens, 1200, 800, "f", overviewEntryScale);
    expect(target).not.toBeNull();
    const effectiveMax = computeEffectiveCameraScaleMax(overviewEntryScale, baseTokens.cameraMaxZoomRatio, baseTokens.cameraScaleMax);
    // The tiny bbox's raw fit vastly exceeds effectiveMax — the cap is the only
    // thing that engages (never a "sane readable cap" beyond it).
    expect(target!.tscale).toBe(effectiveMax);
  });

  it("never dives OUT past the overview's own entry scale, even for an extremely wide ego fan", () => {
    const world = egoWorld(
      { f: { x: 0, y: 0, kind: "domain" }, n1: { x: 5000, y: 0, kind: "capability" }, n2: { x: -5000, y: 0, kind: "capability" } },
      { f: ["n1", "n2"], n1: ["f"], n2: ["f"] },
    );
    const overviewEntryScale = 1.5;
    const target = computeFocusCameraTarget(world, baseTokens, 1200, 800, "f", overviewEntryScale);
    expect(target).not.toBeNull();
    expect(target!.tscale).toBeCloseTo(overviewEntryScale, 6);
  });

  it("never exceeds the ratio-based effective max", () => {
    const world = egoWorld({ f: { x: 0, y: 0, kind: "domain" } }, { f: [] });
    const overviewEntryScale = 1.5;
    const target = computeFocusCameraTarget(world, baseTokens, 1200, 800, "f", overviewEntryScale);
    const effectiveMax = computeEffectiveCameraScaleMax(overviewEntryScale, baseTokens.cameraMaxZoomRatio, baseTokens.cameraScaleMax);
    expect(target!.tscale).toBeLessThanOrEqual(effectiveMax + 1e-9);
  });

  it("returns the full-graph overview target when focusedSlug is null", () => {
    const world = egoWorld({ f: { x: 0, y: 0, kind: "domain" } }, { f: [] });
    const target = computeFocusCameraTarget(world, baseTokens, 1200, 800, null, 1.5);
    expect(target).not.toBeNull();
  });

  it("returns null when the focused slug doesn't resolve", () => {
    const world = egoWorld({ f: { x: 0, y: 0, kind: "domain" } }, { f: [] });
    const target = computeFocusCameraTarget(world, baseTokens, 1200, 800, "missing", 1.5);
    expect(target).toBeNull();
  });
});
