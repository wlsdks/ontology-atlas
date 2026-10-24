import { describe, expect, it } from "vitest";

import { DEFAULT_TIER_REVEAL } from "../../model/visibility/tier-visibility";
import { LABEL_OFFSET } from "../../render/labels";
import {
  computeEffectiveCameraScaleMax,
  computeEffectiveCameraScaleMin,
  computeDomeFitCameraTarget,
  computeFocusCameraTarget,
  computeLensFitTarget,
  computeOverviewCameraTarget,
  computeOverviewFitScale,
  computeUnfocusedPanBounds,
  fitWorldTarget,
  hitTestWorld,
  worldToScreen, clampFitInsets, MAX_FIT_CHROME_SHARE,
  focusLeashPx, focusLeashWorld, FOCUS_LEASH_EDGE_PAD_PX } from "./topology-camera-math";
import type { OntologyMapTokens } from "../../tokens/read-map-tokens";
import { computeEgoBounds, type TopologyWorld } from "../world/topology-world";

const OVERVIEW_LABEL_BOTTOM_ALLOWANCE = Math.max(...Object.values(LABEL_OFFSET)) + 4;

describe("computeDomeFitCameraTarget", () => {
  it("keeps a large dome inside the free canvas below the flat map's minimum zoom", () => {
    const bounds = { minX: -12_000, maxX: 8_000, minY: -5_000, maxY: 7_000 };
    const width = 1040;
    const height = 720;
    const insets = { left: 324, right: 64, top: 64, bottom: 48 };
    const radius = 12;
    const target = computeDomeFitCameraTarget(bounds, width, height, insets, radius, {
      cameraScaleMin: 0.24,
      cameraScaleMax: 2.6,
      domeFitFill: 0.98,
    });
    const camera = {
      x: { value: target.tx, velocity: 0 },
      y: { value: target.ty, velocity: 0 },
      scale: { value: target.tscale, velocity: 0 },
    };
    const topLeft = worldToScreen(camera, width, height, bounds.minX, bounds.minY);
    const bottomRight = worldToScreen(camera, width, height, bounds.maxX, bounds.maxY);

    expect(topLeft.x - radius).toBeGreaterThanOrEqual(insets.left);
    expect(topLeft.y - radius).toBeGreaterThanOrEqual(insets.top);
    expect(bottomRight.x + radius).toBeLessThanOrEqual(width - insets.right);
    expect(bottomRight.y + radius).toBeLessThanOrEqual(height - insets.bottom);
    expect(target.tscale).toBeLessThan(0.24);
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

/**
 * C1 A1 — ratio-based zoom ceiling. Audit finding: the overview entry scale is
 * viewport-proportional (≈1.5 at 1512×917), so binding the interactive zoom max
 * to the ABSOLUTE `--map-camera-scale-max` (2.6) caps zoomRatio at
 * ≈1.8 — the capability reveal band (1.5→2.0) never finishes and the element
 * band (2.3→2.85) is unreachable. The effective max must instead be
 * `overviewEntryScale × maxZoomRatio`, constant in RATIO terms across every
 * viewport, and reach at least the element tier's `fullRatio` (2.85) + margin.
 */
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

describe("computeEffectiveCameraScaleMax", () => {
  const MAX_ZOOM_RATIO = 3.2; // --map-camera-max-zoom-ratio
  const ABSOLUTE_FALLBACK = 2.6; // --map-camera-scale-max

  it.each([1.0, 1.5, 2.2])(
    "yields a constant zoom ratio of maxZoomRatio for any overview entry scale (%f)",
    (overviewEntryScale) => {
      const effectiveMax = computeEffectiveCameraScaleMax(overviewEntryScale, MAX_ZOOM_RATIO, ABSOLUTE_FALLBACK);
      const zoomRatio = effectiveMax / overviewEntryScale;
      expect(zoomRatio).toBeCloseTo(MAX_ZOOM_RATIO, 6);
      expect(zoomRatio).toBeGreaterThanOrEqual(DEFAULT_TIER_REVEAL.element.fullRatio);
    });

  it("falls back to the absolute token when the entry scale is invalid (0 or negative)", () => {
    expect(computeEffectiveCameraScaleMax(0, MAX_ZOOM_RATIO, ABSOLUTE_FALLBACK)).toBe(ABSOLUTE_FALLBACK);
    expect(computeEffectiveCameraScaleMax(-1, MAX_ZOOM_RATIO, ABSOLUTE_FALLBACK)).toBe(ABSOLUTE_FALLBACK);
  });
});

describe("computeEffectiveCameraScaleMin", () => {
  const MIN_ZOOM_RATIO = 0.5; // --map-camera-min-zoom-ratio
  const ABSOLUTE_FALLBACK = 0.24; // --map-camera-scale-min

  it.each([1.0, 1.5, 2.2])(
    "yields a constant zoom ratio of minZoomRatio for any overview entry scale (%f)",
    (overviewEntryScale) => {
      const effectiveMin = computeEffectiveCameraScaleMin(overviewEntryScale, MIN_ZOOM_RATIO, ABSOLUTE_FALLBACK);
      const zoomRatio = effectiveMin / overviewEntryScale;
      expect(zoomRatio).toBeCloseTo(MIN_ZOOM_RATIO, 6);
    });

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
  } as unknown as OntologyMapTokens;

  function egoWorld(nodeXY: Record<string, { x: number; y: number; kind: "project" | "domain" | "capability" | "element";
    }>, neighbors: Record<string, string[]>): TopologyWorld {
    const nodeById = new Map(
      Object.entries(nodeXY).map(([id, v]) => [
        id,
        { id, kind: v.kind, label: id, x: v.x, y: v.y, homeX: v.x, homeY: v.y, parentId: null, isHub: false, fresh: false, stale: false, count: 0, magnitudeScale: 1 }
        ]));
    const neighborMap = new Map(Object.entries(neighbors).map(([id, ns]) => [id, new Set(ns)]));
    return {
      nodes: [...nodeById.values()],
      nodeById,
      edges: [],
      edgeIndexByNode: new Map(),
      neighborMap,
      childrenByParent: new Map(),
      clusterMetaByParent: new Map(),
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
      { f: ["n1", "n2", "n3", "n4"], n1: ["f"], n2: ["f"], n3: ["f"], n4: ["f"] });
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
      { f: ["n1"], n1: ["f"] });
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
      { f: ["n1", "n2"], n1: ["f"], n2: ["f"] });
    const overviewEntryScale = 1.5;
    const target = computeFocusCameraTarget(world, baseTokens, 1200, 800, "f", overviewEntryScale);
    expect(target).not.toBeNull();
    expect(target!.tscale).toBeCloseTo(overviewEntryScale, 6);
  });

  describe("a dial capability's frame", () => {
    const tokens = { ...baseTokens, focusMaxZoomRatio: 1.8 } as unknown as OntologyMapTokens;
    const nameScale = 22 / 34;
    const dialWorld = (partnerX: number) => ({
      ...egoWorld(
        {
          f: { x: 0, y: 0, kind: "capability" },
          p1: { x: partnerX, y: 0, kind: "capability" },
          p2: { x: -partnerX / 2, y: 30, kind: "capability" },
          chip: { x: 0, y: -4000, kind: "domain" },
        },
        { f: ["p1", "p2", "chip"] }),
      dialScaleMax: 3,
    });

    it("frames the focus and its partners, reaching the name pitch past the focus ceiling", () => {
      const world = dialWorld(60);
      const entry = 0.1;
      const target = computeFocusCameraTarget(world, tokens, 1200, 800, "f", entry, null, undefined, { ids: new Set(["f", "p1", "p2"]), nameScale })!;
      expect(entry * 1.8).toBeLessThan(nameScale);
      expect(target.tscale).toBeCloseTo(nameScale, 6);
      const classic = computeFocusCameraTarget(world, tokens, 1200, 800, "f", entry)!;
      expect(classic.tscale).toBeLessThan(nameScale);
    });

    it("keeps partners too far apart in the frame, below the name pitch", () => {
      const world = dialWorld(3000);
      const target = computeFocusCameraTarget(world, tokens, 1200, 800, "f", 0.1, null, undefined, { ids: new Set(["f", "p1", "p2"]), nameScale })!;
      expect(target.tscale).toBeLessThan(nameScale);
      expect(target.tscale).toBeGreaterThan(0.1);
      const half = 600 / target.tscale;
      expect(Math.abs(3000 - target.tx)).toBeLessThan(half);
      expect(Math.abs(-1500 - target.tx)).toBeLessThan(half);
    });
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

  // S8 defect 4 — a fling neighbour outside the warding circle (±5000) inflated the
  // ego bbox during realm expansion, shrinking the camera back to overview (nothing
  // on screen). With restrictIds holding only realm members it dives normally on a
  // near-neighbour fit.
  it("with restrictIds (area members) it ignores fling neighbours outside the realm and dives with a close fit", () => {
    const world = egoWorld(
      {
        f: { x: 0, y: 0, kind: "domain" },
        near: { x: 80, y: 0, kind: "capability" }, // a realm member
        fling: { x: 5000, y: 0, kind: "capability" }, // flung outside the warding circle
      },
      { f: ["near", "fling"], near: ["f"], fling: ["f"] });
    const overviewEntryScale = 1.5;
    const members = new Set(["f", "near"]);
    const restricted = computeFocusCameraTarget(world, baseTokens, 1200, 800, "f", overviewEntryScale, members);
    // Dives on the near ego (f + near) — decisively zoomed in, not shrunk to overview.
    expect(restricted!.tscale).toBeGreaterThan(overviewEntryScale);
    // Unrestricted, the fling neighbour inflates the bbox and it clamps to overview (the control).
    const unbounded = computeFocusCameraTarget(world, baseTokens, 1200, 800, "f", overviewEntryScale);
    expect(unbounded!.tscale).toBeCloseTo(overviewEntryScale, 6);
  });

  it("the target never leaves the leash the physics keeps around the focused node", () => {
    // A capability whose only neighbours sit far to the right (dependencies in
    // other domains): the ego bbox centre lies 1000 units from the node, the
    // leash is 180. Before the clamp the spring chased a target it could never
    // reach and the idle gate read "camera moving" for the whole selection.
    const tokens = { ...baseTokens, cameraFocusPanMargin: 180 } as unknown as OntologyMapTokens;
    const world = egoWorld(
      {
        f: { x: 0, y: 0, kind: "capability" },
        far1: { x: 2000, y: 0, kind: "capability" },
        far2: { x: 2000, y: 40, kind: "capability" },
      },
      { f: ["far1", "far2"], far1: ["f"], far2: ["f"] });
    const target = computeFocusCameraTarget(world, tokens, 1200, 800, "f", 0.9)!;
    // The leash is the free half-width less the edge pad, in world units at
    // the target's scale — never tighter than the token.
    const leash = focusLeashWorld(focusLeashPx(1200, 800, { left: 0, right: 0, top: 0, bottom: 0 }).x, target.tscale, 180);
    expect(leash).toBeGreaterThanOrEqual(180);
    expect(Math.abs(target.tx - 0)).toBeLessThanOrEqual(leash + 1e-6);
    expect(Math.abs(target.ty - 0)).toBeLessThanOrEqual(leash + 1e-6);
    // The focused node itself stays inside the free area with the pad to spare.
    const focusScreenX = 1200 / 2 + (0 - target.tx) * target.tscale;
    expect(focusScreenX).toBeGreaterThanOrEqual(FOCUS_LEASH_EDGE_PAD_PX - 1e-6);
    expect(focusScreenX).toBeLessThanOrEqual(1200 - FOCUS_LEASH_EDGE_PAD_PX + 1e-6);
    // The clamp is a clamp: a compact ego graph is framed exactly as before.
    const near = egoWorld({ f: { x: 0, y: 0, kind: "capability" }, n: { x: 60, y: 0, kind: "capability" } }, { f: ["n"], n: ["f"] });
    const wide = computeFocusCameraTarget(near, { ...baseTokens, cameraFocusPanMargin: 10000 } as unknown as OntologyMapTokens, 1200, 800, "f", 0.9)!;
    const leashed = computeFocusCameraTarget(near, tokens, 1200, 800, "f", 0.9)!;
    expect(leashed).toEqual(wide);
  });

  it("a wide ego graph is centred in the free area beside an open panel, not held near the node", () => {
    const tokens = { ...baseTokens, cameraFocusPanMargin: 180, safeInsetLeft: 0, safeInsetRight: 384 } as unknown as OntologyMapTokens;
    const world = egoWorld(
      {
        f: { x: 0, y: 0, kind: "capability" },
        n1: { x: 820, y: 60, kind: "capability" },
        n2: { x: 840, y: 340, kind: "capability" },
      },
      { f: ["n1", "n2"], n1: ["f"], n2: ["f"] });
    // The whole ring's bounds: at or below the overview scale the unfocused
    // leash (around the map, not the node) is what the physics holds.
    const ring = { minX: -1200, minY: -600, maxX: 1200, maxY: 600 };
    const target = computeFocusCameraTarget(world, tokens, 1448, 806, "f", 0.872, null, ring)!;
    const screenX = (x: number) => 1448 / 2 + (x - target.tx) * target.tscale;
    // Both neighbours sit left of the panel, the focus sits right of the pad.
    expect(screenX(840)).toBeLessThan(1448 - 384);
    expect(screenX(0)).toBeGreaterThanOrEqual(FOCUS_LEASH_EDGE_PAD_PX);
  });

  it("focusLeashPx: half the free width less the pad, never negative", () => {
    const leash = focusLeashPx(1448, 806, { left: 0, right: 384, top: 148, bottom: 96 });
    expect(leash.x).toBe((1448 - 384) / 2 - FOCUS_LEASH_EDGE_PAD_PX);
    expect(leash.y).toBe((806 - 148 - 96) / 2 - FOCUS_LEASH_EDGE_PAD_PX);
    expect(focusLeashPx(200, 200, { left: 0, right: 100, top: 0, bottom: 0 }).x).toBe(0);
    expect(focusLeashWorld(412, 0.872, 180)).toBeCloseTo(412 / 0.872, 6);
    expect(focusLeashWorld(100, 1, 180)).toBe(180);
    expect(focusLeashWorld(412, 0, 180)).toBe(180);
  });
});

describe("computeUnfocusedPanBounds: pan leash", () => {
  const bounds = { minX: -400, minY: -300, maxX: 400, maxY: 300 };

  it("with the leash off the old envelope stays (world bbox +/- 320)", () => {
    // The workbench default is 0 — this pins the claim that this change does not
    // touch `/topology` by a single pixel.
    const off = computeUnfocusedPanBounds(bounds, 1, { cameraPanLeash: 0, safeInsetLeft: 350 });
    expect(off).toEqual({ minX: -720, minY: -620, maxX: 720, maxY: 620 });
    // Passing no tokens at all gives the same (the pure camera-math test contract).
    expect(computeUnfocusedPanBounds(bounds, 1, {})).toEqual(off);
  });

  it("with the leash on the envelope narrows to the **fit anchor** +/- the leash", () => {
    // The reference point uses the same formula as the overview fit:
    // centre − (left − right) / (2 · scale). Anchoring on the fit rather than the
    // bbox is what makes the envelope's size independent of vault size.
    const leashed = computeUnfocusedPanBounds(bounds, 2, {
      cameraPanLeash: 220,
      safeInsetLeft: 544,
      safeInsetRight: 0,
    });
    const anchorX = 0 - (544 - 0) / (2 * 2); // = -136
    expect(leashed).toEqual({
      minX: anchorX - 220,
      maxX: anchorX + 220,
      minY: -220,
      maxY: 220,
    });
  });

  it("the envelope stays put when the vault triples in size, whereas the old envelope grew with it", () => {
    const tokens = { cameraPanLeash: 220, safeInsetLeft: 544 };
    const small = computeUnfocusedPanBounds(bounds, 1, tokens);
    const huge = computeUnfocusedPanBounds(
      { minX: -1200, minY: -900, maxX: 1200, maxY: 900 },
      1,
      tokens);
    expect(huge).toEqual(small);
    // Without a leash these two differ — which is why the old envelope could not
    // guarantee "outside the reserved column" at any value.
    expect(computeUnfocusedPanBounds({ minX: -1200, minY: -900, maxX: 1200, maxY: 900 }, 1, {})).not.toEqual(
      computeUnfocusedPanBounds(bounds, 1, {}));
  });
});

describe("computeFocusCameraTarget: safe inset", () => {
  const base = {
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
  } as unknown as OntologyMapTokens;

  /** The focus node f plus two neighbours — deliberately offset so the bbox centre is not the origin. */
  const XY: Record<string, { x: number; y: number; kind: "domain" | "capability";
    }> = {
    f: { x: 400, y: 200, kind: "domain" },
    n1: { x: 550, y: 200, kind: "capability" },
    n2: { x: 250, y: 200, kind: "capability" },
  };
  const CENTER = { x: 400, y: 200 };

  function world(): TopologyWorld {
    const nodeById = new Map(
      Object.entries(XY).map(([id, v]) => [
        id,
        { id, kind: v.kind, label: id, x: v.x, y: v.y, homeX: v.x, homeY: v.y, parentId: null, isHub: false, fresh: false, stale: false, count: 0, magnitudeScale: 1 }
        ]));
    return {
      nodes: [...nodeById.values()],
      nodeById,
      edges: [],
      edgeIndexByNode: new Map(),
      neighborMap: new Map([["f", new Set(["n1", "n2"])]]),
      childrenByParent: new Map(),
      clusterMetaByParent: new Map(),
      brightStarIds: new Set(),
      bounds: { minX: 0, minY: 0, maxX: 800, maxY: 400 },
      spineBounds: { minX: 0, minY: 0, maxX: 800, maxY: 400 },
    } as TopologyWorld;
  }

  const focus = (tokens: OntologyMapTokens) => computeFocusCameraTarget(world(), tokens, 1448, 982, "f", 1);

  it("with no inset it stays at the centre of the ego bbox, behaviour unchanged", () => {
    const t = focus(base);
    expect(t).not.toBeNull();
    expect(t!.tx).toBeCloseTo(CENTER.x, 6);
    expect(t!.ty).toBeCloseTo(CENTER.y, 6);
  });

  /**
   * With the right side covered, the free area's centre is **left** of the screen's
   * centre. Substituting that position into the screen formula
   * `(world − tx) × scale + W/2` and solving makes **tx larger** — moving the camera
   * right moves the content left. Flipping the sign pushes the node **further into**
   * the panel, so this directional assertion is the heart of the test.
   */
  it("when the right popover opens the node moves to the centre of the free area on its left", () => {
    const t = focus({ ...base, safeInsetRight: 384 } as OntologyMapTokens)!;
    expect(t.tx).toBeCloseTo(CENTER.x + 384 / (2 * t.tscale), 6);
    const screenX = (CENTER.x - t.tx) * t.tscale + 1448 / 2;
    expect(screenX).toBeCloseTo((1448 - 384) / 2, 6); // the free area's centre
    expect(screenX).toBeLessThan(1448 - 384); // left of the popover's left edge
  });

  it("when the left panel opens it is pushed the other way", () => {
    const t = focus({ ...base, safeInsetLeft: 324 } as OntologyMapTokens)!;
    const screenX = (CENTER.x - t.tx) * t.tscale + 1448 / 2;
    expect(screenX).toBeCloseTo((324 + 1448) / 2, 6);
  });

  it("equal left and right cancel out, so the correction does not appear for free", () => {
    const t = focus({ ...base, safeInsetLeft: 200, safeInsetRight: 200 } as OntologyMapTokens)!;
    expect(t.tx).toBeCloseTo(CENTER.x, 6);
  });

  it("a large inset shrinks the scale to fit the visible area", () => {
    const plain = focus(base)!;
    const tight = focus({ ...base, safeInsetRight: 900 } as OntologyMapTokens)!;
    expect(tight.tscale).toBeLessThan(plain.tscale);
  });
});

describe("hitTestWorld: 3D depth first (of overlapping discs the nearer node wins)", () => {
  const camera = {
    x: { value: 0, velocity: 0 },
    y: { value: 0, velocity: 0 },
    scale: { value: 1, velocity: 0 },
  };
  const tokens = { radiusProject: 30, radiusDomain: 17, radiusCapability: 11, radiusElement: 7 } as unknown as Parameters<typeof hitTestWorld>[4];
  // far (dead-centre) vs near (4px off) — both discs cover the cursor.
  const nodes = [
    { id: "far", kind: "domain", x: 0, y: 0, magnitudeScale: 1 },
    { id: "near", kind: "domain", x: 4, y: 0, magnitudeScale: 1 }
    ];
  const world = {
    nodes,
    nodeById: new Map(nodes.map((n) => [n.id, n])),
  } as unknown as Parameters<typeof hitTestWorld>[0];
  // The viewport 800×600's centre (400,300) is world (0,0).

  it("without depthForNode it is as before, and distance to the centre wins", () => {
    expect(hitTestWorld(world, camera as never, 800, 600, tokens, 400, 300)).toBe("far");
  });

  it("with depthForNode the nearer node (smaller u) wins, the same rule as painter order", () => {
    const depth = (n: { id: string;
        }) => (n.id === "far" ? 0.9 : 0.1);
    expect(
      hitTestWorld(world, camera as never, 800, 600, tokens, 400, 300, undefined, undefined, undefined, depth as never)).toBe("near");
  });

  it("when the cursor is outside the nearer node's disc the farther node is hit, since depth competes only inside the disc", () => {
    const depth = (n: { id: string;
        }) => (n.id === "far" ? 0.9 : 0.1);
    // Both discs have radius 17+5=22, so a point covering only far has to sit on
    // far's opposite side from near: x=379 is 21 from far (inside) and 25 from near
    // (outside).
    expect(
      hitTestWorld(world, camera as never, 800, 600, tokens, 379, 300, undefined, undefined, undefined, depth as never)).toBe("far");
  });
});

describe("hitTestWorld: drawn ink beats the margin ring (regression for clicking the middle of a 3D disc)", () => {
  const camera = {
    x: { value: 0, velocity: 0 },
    y: { value: 0, velocity: 0 },
    scale: { value: 1, velocity: 0 },
  };
  const tokens = { radiusProject: 30, radiusDomain: 17, radiusCapability: 11, radiusElement: 7 } as unknown as Parameters<typeof hitTestWorld>[4];
  const nodes = [
    { id: "element", kind: "element", x: 0, y: 0, magnitudeScale: 1 },
    { id: "domain", kind: "domain", x: 20, y: 0, magnitudeScale: 1 }
    ];
  const world = {
    nodes,
    nodeById: new Map(nodes.map((n) => [n.id, n])),
  } as unknown as Parameters<typeof hitTestWorld>[0];
  const depth = (n: { id: string;
    }) => (n.id === "element" ? 0.9 : 0.1);
  // Both are scaled the way the dome scales them: element 7→3.5, domain 17→10.2.
  const radiusScale = (n: { id: string;
    }) => (n.id === "element" ? 0.5 : 0.6);
  // Viewport 800×600 puts world (0,0) at (400,300).

  it("the middle of a far node's drawn disc is not stolen by a nearer node's margin ring", () => {
    // domain: centre 20 px away, drawn radius 10.2, slack radius 15.2 — the cursor
    // is inside its slack ring but on no domain pixel.
    expect(
      hitTestWorld(world, camera as never, 800, 600, tokens, 400, 300, undefined, undefined, radiusScale as never, depth as never)).toBe("element");
  });

  it("when two discs truly overlap the nearer one (smaller u) still wins", () => {
    // x=409 is 9 px from the element's centre — outside its 3.5 px disc — and 11 px
    // from the domain's, inside its 10.2 px disc. Real occlusion, near node wins.
    expect(
      hitTestWorld(world, camera as never, 800, 600, tokens, 409, 300, undefined, undefined, radiusScale as never, depth as never)).toBe("domain");
  });

  it("when no ink is touched depth decides inside the margin ring, as before", () => {
    // x=406 is 6 px from the element (slack only, 3.5+5=8.5) and 14 px from the
    // domain (slack only, 10.2+5=15.2). Neither is painted here, so depth decides.
    expect(
      hitTestWorld(world, camera as never, 800, 600, tokens, 406, 300, undefined, undefined, radiusScale as never, depth as never)).toBe("domain");
  });

  it("the hit disc uses the same projection as the screen coordinates the instrument reports, one projection", () => {
    /*
     * `__atlasMap.nodes()` reports `(n.x + dome.dx − cam) × scale + viewport/2`
     * and multiplies the radius by `dome.s`. The hit test must land on that same
     * point from the same two inputs, or a click at a reported centre is judged
     * against a node that is somewhere else. `dome-view.test.ts` proves the frame
     * offset itself is `projectDomeCoord`; this proves the hit test consumes it.
     */
    const offset = (n: { id: string;
        }) => (n.id === "element" ? { x: 120, y: -80 } : { x: 0, y: 0 });
    const moved = [{ id: "element", kind: "element", x: 0, y: 0, magnitudeScale: 1 }];
    const movedWorld = {
      nodes: moved,
      nodeById: new Map(moved.map((n) => [n.id, n])),
    } as unknown as Parameters<typeof hitTestWorld>[0];
    const reported = worldToScreen(camera as never, 800, 600, 0 + 120, 0 + -80);
    expect(
      hitTestWorld(movedWorld, camera as never, 800, 600, tokens, reported.x, reported.y, undefined, offset as never, radiusScale as never)).toBe("element");
    // …and two pixels off the reported centre, the same answer. Below the drawn
    // radius (3.5), so this is the disc itself rather than the courtesy ring.
    expect(
      hitTestWorld(movedWorld, camera as never, 800, 600, tokens, reported.x + 2, reported.y, undefined, offset as never, radiusScale as never)).toBe("element");
    // The un-offset position is empty canvas — the offset is not decorative.
    expect(
      hitTestWorld(movedWorld, camera as never, 800, 600, tokens, 400, 300, undefined, offset as never, radiusScale as never)).toBeNull();
  });
});

describe("clampFitInsets — the chrome may not eat the map", () => {
  it("leaves a desktop reservation alone: 470 of 1216 is under the ceiling", () => {
    expect(clampFitInsets(350, 120, 1216)).toEqual({ lo: 350, hi: 120 });
  });

  it("shrinks both sides in proportion when they pass the ceiling", () => {
    // 390-wide canvas: 470 asked, 195 allowed.
    const { lo, hi } = clampFitInsets(350, 120, 390);
    expect(lo + hi).toBeCloseTo(390 * MAX_FIT_CHROME_SHARE, 6);
    expect(lo / hi).toBeCloseTo(350 / 120, 6);
    expect(390 - lo - hi).toBeCloseTo(390 * (1 - MAX_FIT_CHROME_SHARE), 6);
  });

  it("side lanes give way equally, so the drawing stays centred between INDEX and the rail", () => {
    const freeCentre = (width: number) => (324 + (width - 60)) / 2;
    for (const width of [768, 800, 900, 1000]) {
      for (const floors of [[324, 0], [324, 60], [0, 0]] as const) {
        const { lo, hi } = clampFitInsets(376, 112, width, floors[0], floors[1], "equal");
        expect(lo + hi, `${width} ${floors}`).toBeLessThanOrEqual(width * MAX_FIT_CHROME_SHARE + 1e-6);
                expect((lo + (width - hi)) / 2, `${width} ${floors}`).toBeCloseTo(freeCentre(width), 6);
                expect(lo).toBeGreaterThanOrEqual(floors[0]);
                expect(hi).toBeGreaterThanOrEqual(floors[1]);
            }
        }
        // A side at its floor hands the rest of the cut to the other side: 90 px must go,
        // the left has 16 above its panel, so the right gives the other 74.
        expect(clampFitInsets(340, 200, 900, 324, 0, "equal")).toEqual({ lo: 324, hi: 126 });
        // A floor wider than the ceiling still wins, whatever the share.
        expect(clampFitInsets(600, 120, 900, 600, 0, "equal")).toEqual({ lo: 600, hi: 0 });
    });
    it("the overview on a narrow canvas lands centred between INDEX and the rail", () => {
        // The resting lanes and what the map's chrome measurably covers with INDEX open:
        // the panel's right edge at 324, the rail's column 60 from the right edge.
        const tokens = {
            cameraScaleMax: 2.6,
            cameraScaleMin: 0.24,
            cameraSmallGraphScaleMax: 1.3,
            overviewEntryRatio: 0.95,
            safeInsetLeft: 376,
            safeInsetRight: 112,
            safeInsetTop: 148,
            safeInsetBottom: 96,
        };
        const bounds = { minX: -300, minY: -300, maxX: 300, maxY: 300 };
        for (const width of [768, 800, 900, 1000]) {
            for (const obstacles of [{}, { obstacleInsetLeft: 324 }, { obstacleInsetLeft: 324, obstacleInsetRight: 60 }]) {
                const target = computeOverviewCameraTarget(bounds, width, 1000, { ...tokens, ...obstacles });
                // The bounds' centre (world 0) lands on screen at the free map's centre.
                const screenCentre = (0 - target.tx) * target.tscale + width / 2;
                expect(screenCentre, `${width} ${JSON.stringify(obstacles)}`).toBeCloseTo((324 + (width - 60)) / 2, 6);
            }
        }
    });
    it("never shrinks below what a panel measurably covers", () => {
        // An 820-wide canvas with a 324 px panel on the left and nothing on the right.
        const { lo, hi } = clampFitInsets(350, 120, 820, 324, 0);
        expect(lo, "the graph would slide under the open panel").toBeGreaterThanOrEqual(324);
        expect(lo + hi).toBeCloseTo(820 * MAX_FIT_CHROME_SHARE, 6);
    });
    it("a floor wider than the ceiling wins — occlusion is not negotiable", () => {
        const { lo, hi } = clampFitInsets(600, 120, 900, 600, 0);
        expect(lo).toBe(600);
        expect(hi).toBe(0);
    });
    it("a zero or unknown extent changes nothing", () => {
        expect(clampFitInsets(350, 120, 0)).toEqual({ lo: 350, hi: 120 });
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
