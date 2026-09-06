import { describe, expect, it } from "vitest";

import { DEFAULT_TIER_REVEAL } from "../model/tier-visibility";
import { LABEL_OFFSET } from "../render/labels";
import {
  computeEffectiveCameraScaleMax,
  computeEffectiveCameraScaleMin,
  computeFocusCameraTarget,
  computeOverviewCameraTarget,
  computeOverviewFitScale,
  computeUnfocusedPanBounds,
  fitWorldTarget,
  hitTestWorld,
  worldToScreen,
} from "./topology-camera-math";
import type { TopologyV2Tokens } from "../tokens/read-topology-v2-tokens";
import { computeEgoBounds, type TopologyWorld } from "./topology-world";

// The bottom label allowance is derived inside `topology-camera-math.ts` as max
// LABEL_OFFSET + 4 slack (Guardian follow-up, 2026-07-23) — the test computes its
// expectation from the same derivation so no literal drifts when LABEL_OFFSET changes.
const OVERVIEW_LABEL_BOTTOM_ALLOWANCE = Math.max(...Object.values(LABEL_OFFSET)) + 4;

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
  const tokens = { cameraScaleMax: 2.6, cameraScaleMin: 0.24, cameraSmallGraphScaleMax: 1.3, overviewEntryRatio: 0.95 };
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

  it("#11 — caps the fit at cameraSmallGraphScaleMax for a small (≤5-node) graph", () => {
    // Onboarding: a 1–3-node vault has minuscule bounds, so the plain fit
    // pins to cameraScaleMax (2.6) and a lone hexagon fills half the screen.
    // With nodeCount ≤ 5 the fit is capped at cameraSmallGraphScaleMax (1.3),
    // then the entry ratio applies — well under the plain-fit ceiling.
    const tiny = { minX: -1, minY: -1, maxX: 1, maxY: 1 };
    const clamped = computeOverviewCameraTarget(tiny, 1000, 1000, tokens, 1);
    expect(clamped.tscale).toBeLessThanOrEqual(
      tokens.cameraSmallGraphScaleMax * tokens.overviewEntryRatio + 1e-9,
    );
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
      4,
    );
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
        { id, kind: v.kind, label: id, x: v.x, y: v.y, homeX: v.x, homeY: v.y, parentId: null, isHub: false, fresh: false, stale: false, count: 0, magnitudeScale: 1 },
      ]),
    );
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

  // S8 defect 4 — a fling neighbour outside the warding circle (±5000) inflated the
  // ego bbox during realm expansion, shrinking the camera back to overview (nothing
  // on screen). With restrictIds holding only realm members it dives normally on a
  // near-neighbour fit.
  it("restrictIds(영역 멤버)면 결계 밖 fling 이웃을 무시하고 근접 fit 으로 다이브한다", () => {
    const world = egoWorld(
      {
        f: { x: 0, y: 0, kind: "domain" },
        near: { x: 80, y: 0, kind: "capability" }, // a realm member
        fling: { x: 5000, y: 0, kind: "capability" }, // flung outside the warding circle
      },
      { f: ["near", "fling"], near: ["f"], fling: ["f"] },
    );
    const overviewEntryScale = 1.5;
    const members = new Set(["f", "near"]);
    const restricted = computeFocusCameraTarget(world, baseTokens, 1200, 800, "f", overviewEntryScale, members);
    // Dives on the near ego (f + near) — decisively zoomed in, not shrunk to overview.
    expect(restricted!.tscale).toBeGreaterThan(overviewEntryScale);
    // Unrestricted, the fling neighbour inflates the bbox and it clamps to overview (the control).
    const unbounded = computeFocusCameraTarget(world, baseTokens, 1200, 800, "f", overviewEntryScale);
    expect(unbounded!.tscale).toBeCloseTo(overviewEntryScale, 6);
  });
});

/**
 * The pan leash — a safety net for **surfaces with no "Fit Map"**
 * (council verdict ②, 2026-07-29).
 *
 * One hard drag to the left on the gateway (`/download`) pushed the whole graph
 * behind the reserved column (the plate plus the headline) and left the stage
 * empty, with zero damping 12 seconds later. On the workbench a chrome button
 * brings it back, but the gateway has no such button — allowing an irreversible
 * gesture on a screen with no way back is the defect.
 */
describe("computeUnfocusedPanBounds — 팬 목줄", () => {
  const bounds = { minX: -400, minY: -300, maxX: 400, maxY: 300 };

  it("목줄이 꺼져 있으면 종전 봉투 그대로 (월드 bbox ± 320)", () => {
    // The workbench default is 0 — this pins the claim that this change does not
    // touch `/topology` by a single pixel.
    const off = computeUnfocusedPanBounds(bounds, 1, { cameraPanLeash: 0, safeInsetLeft: 350 });
    expect(off).toEqual({ minX: -720, minY: -620, maxX: 720, maxY: 620 });
    // Passing no tokens at all gives the same (the pure camera-math test contract).
    expect(computeUnfocusedPanBounds(bounds, 1, {})).toEqual(off);
  });

  it("목줄이 켜지면 봉투가 **핏 기준점** ± 목줄로 좁아진다", () => {
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

  it("볼트가 세 배로 커져도 봉투는 그대로다 — 종전 봉투는 같이 커졌다", () => {
    const tokens = { cameraPanLeash: 220, safeInsetLeft: 544 };
    const small = computeUnfocusedPanBounds(bounds, 1, tokens);
    const huge = computeUnfocusedPanBounds(
      { minX: -1200, minY: -900, maxX: 1200, maxY: 900 },
      1,
      tokens,
    );
    expect(huge).toEqual(small);
    // Without a leash these two differ — which is why the old envelope could not
    // guarantee "outside the reserved column" at any value.
    expect(computeUnfocusedPanBounds({ minX: -1200, minY: -900, maxX: 1200, maxY: 900 }, 1, {})).not.toEqual(
      computeUnfocusedPanBounds(bounds, 1, {}),
    );
  });
});

describe("computeFocusCameraTarget — 안전 인셋", () => {
  /**
   * ⚠️ This function used to use the insets **not at all** (fixed 2026-08-10), so
   * choosing a node could put it **behind the panel that explains it**. The overview
   * path was already solving the same problem with insets, so the prescription was
   * not a new correction system but bringing this function onto that mechanism — a
   * day earlier a second shift was stacked at the call site, and that produced a
   * 188px misalignment and a 64px over-correction.
   */
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
  } as unknown as TopologyV2Tokens;

  /** The focus node f plus two neighbours — deliberately offset so the bbox centre is not the origin. */
  const XY: Record<string, { x: number; y: number; kind: "domain" | "capability" }> = {
    f: { x: 400, y: 200, kind: "domain" },
    n1: { x: 550, y: 200, kind: "capability" },
    n2: { x: 250, y: 200, kind: "capability" },
  };
  const CENTER = { x: 400, y: 200 };

  function world(): TopologyWorld {
    const nodeById = new Map(
      Object.entries(XY).map(([id, v]) => [
        id,
        { id, kind: v.kind, label: id, x: v.x, y: v.y, homeX: v.x, homeY: v.y, parentId: null, isHub: false, fresh: false, stale: false, count: 0, magnitudeScale: 1 },
      ]),
    );
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

  const focus = (tokens: TopologyV2Tokens) => computeFocusCameraTarget(world(), tokens, 1448, 982, "f", 1);

  it("인셋이 없으면 ego bbox 가운데 그대로 — 종전 동작 불변", () => {
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
  it("오른쪽 팝오버가 열리면 노드가 그 왼쪽 자유 영역 가운데로 온다", () => {
    const t = focus({ ...base, safeInsetRight: 384 } as TopologyV2Tokens)!;
    expect(t.tx).toBeCloseTo(CENTER.x + 384 / (2 * t.tscale), 6);
    const screenX = (CENTER.x - t.tx) * t.tscale + 1448 / 2;
    expect(screenX).toBeCloseTo((1448 - 384) / 2, 6); // the free area's centre
    expect(screenX).toBeLessThan(1448 - 384); // left of the popover's left edge
  });

  it("왼쪽 패널이 열리면 반대로 밀린다", () => {
    const t = focus({ ...base, safeInsetLeft: 324 } as TopologyV2Tokens)!;
    const screenX = (CENTER.x - t.tx) * t.tscale + 1448 / 2;
    expect(screenX).toBeCloseTo((324 + 1448) / 2, 6);
  });

  it("좌우가 같으면 상쇄된다 — 보정이 공짜로 생기지 않는다", () => {
    const t = focus({ ...base, safeInsetLeft: 200, safeInsetRight: 200 } as TopologyV2Tokens)!;
    expect(t.tx).toBeCloseTo(CENTER.x, 6);
  });

  it("인셋이 크면 배율이 줄어든다 — 보이는 영역에 맞춘다", () => {
    const plain = focus(base)!;
    const tight = focus({ ...base, safeInsetRight: 900 } as TopologyV2Tokens)!;
    expect(tight.tscale).toBeLessThan(plain.tscale);
  });
});

describe("hitTestWorld — 3D 깊이 우선 (겹친 디스크는 가까운 노드가 이긴다)", () => {
  const camera = {
    x: { value: 0, velocity: 0 },
    y: { value: 0, velocity: 0 },
    scale: { value: 1, velocity: 0 },
  };
  const tokens = { radiusProject: 30, radiusDomain: 17, radiusCapability: 11, radiusElement: 7 } as unknown as Parameters<typeof hitTestWorld>[4];
  // far (dead-centre) vs near (4px off) — both discs cover the cursor.
  const nodes = [
    { id: "far", kind: "domain", x: 0, y: 0, magnitudeScale: 1 },
    { id: "near", kind: "domain", x: 4, y: 0, magnitudeScale: 1 },
  ];
  const world = {
    nodes,
    nodeById: new Map(nodes.map((n) => [n.id, n])),
  } as unknown as Parameters<typeof hitTestWorld>[0];
  // The viewport 800×600's centre (400,300) is world (0,0).

  it("depthForNode 없이는 종전 그대로 — 중심까지 거리가 이긴다", () => {
    expect(hitTestWorld(world, camera as never, 800, 600, tokens, 400, 300)).toBe("far");
  });

  it("depthForNode 가 있으면 가까운(u 작은) 노드가 이긴다 — 화가 순서와 같은 규칙", () => {
    const depth = (n: { id: string }) => (n.id === "far" ? 0.9 : 0.1);
    expect(
      hitTestWorld(world, camera as never, 800, 600, tokens, 400, 300, undefined, undefined, undefined, depth as never),
    ).toBe("near");
  });

  it("커서가 가까운 노드 디스크 밖이면 먼 노드가 잡힌다 — 깊이는 디스크 안에서만 겨룬다", () => {
    const depth = (n: { id: string }) => (n.id === "far" ? 0.9 : 0.1);
    // Both discs have radius 17+5=22, so a point covering only far has to sit on
    // far's opposite side from near: x=379 is 21 from far (inside) and 25 from near
    // (outside).
    expect(
      hitTestWorld(world, camera as never, 800, 600, tokens, 379, 300, undefined, undefined, undefined, depth as never),
    ).toBe("far");
  });
});

describe("hitTestWorld — 그려진 잉크가 여유 링을 이긴다 (3D 원판 한가운데 클릭 회귀)", () => {
  const camera = {
    x: { value: 0, velocity: 0 },
    y: { value: 0, velocity: 0 },
    scale: { value: 1, velocity: 0 },
  };
  const tokens = { radiusProject: 30, radiusDomain: 17, radiusCapability: 11, radiusElement: 7 } as unknown as Parameters<typeof hitTestWorld>[4];
  /*
   * The measured shape of the defect (sample vault, 2026-09-06): a far element is
   * drawn at r≈3.5 px next to a near domain drawn at r≈10 px, their centres about
   * 15 px apart. Nothing of the domain is painted over the element, yet pointing
   * at the element's own centre answered "domain", because the domain's 5 px
   * courtesy ring reached that far and depth was decided before ink.
   */
  const nodes = [
    { id: "element", kind: "element", x: 0, y: 0, magnitudeScale: 1 },
    { id: "domain", kind: "domain", x: 20, y: 0, magnitudeScale: 1 },
  ];
  const world = {
    nodes,
    nodeById: new Map(nodes.map((n) => [n.id, n])),
  } as unknown as Parameters<typeof hitTestWorld>[0];
  const depth = (n: { id: string }) => (n.id === "element" ? 0.9 : 0.1);
  // Both are scaled the way the dome scales them: element 7→3.5, domain 17→10.2.
  const radiusScale = (n: { id: string }) => (n.id === "element" ? 0.5 : 0.6);
  // Viewport 800×600 puts world (0,0) at (400,300).

  it("먼 노드의 그려진 원판 한가운데는 가까운 노드의 여유 링에 빼앗기지 않는다", () => {
    // domain: centre 20 px away, drawn radius 10.2, slack radius 15.2 — the cursor
    // is inside its slack ring but on no domain pixel.
    expect(
      hitTestWorld(world, camera as never, 800, 600, tokens, 400, 300, undefined, undefined, radiusScale as never, depth as never),
    ).toBe("element");
  });

  it("두 원판이 정말 겹치면 여전히 가까운(u 작은) 쪽이 이긴다", () => {
    // x=409 is 9 px from the element's centre — outside its 3.5 px disc — and 11 px
    // from the domain's, inside its 10.2 px disc. Real occlusion, near node wins.
    expect(
      hitTestWorld(world, camera as never, 800, 600, tokens, 409, 300, undefined, undefined, radiusScale as never, depth as never),
    ).toBe("domain");
  });

  it("어느 잉크에도 닿지 않으면 여유 링 안에서 깊이가 결정한다 — 종전 규칙", () => {
    // x=406 is 6 px from the element (slack only, 3.5+5=8.5) and 14 px from the
    // domain (slack only, 10.2+5=15.2). Neither is painted here, so depth decides.
    expect(
      hitTestWorld(world, camera as never, 800, 600, tokens, 406, 300, undefined, undefined, radiusScale as never, depth as never),
    ).toBe("domain");
  });

  it("히트 디스크는 계기가 보고하는 화면 좌표와 같은 투영을 쓴다 — 하나의 투영", () => {
    /*
     * `__atlasMap.nodes()` reports `(n.x + dome.dx − cam) × scale + viewport/2`
     * and multiplies the radius by `dome.s`. The hit test must land on that same
     * point from the same two inputs, or a click at a reported centre is judged
     * against a node that is somewhere else. `dome-view.test.ts` proves the frame
     * offset itself is `projectDomeCoord`; this proves the hit test consumes it.
     */
    const offset = (n: { id: string }) => (n.id === "element" ? { x: 120, y: -80 } : { x: 0, y: 0 });
    const moved = [{ id: "element", kind: "element", x: 0, y: 0, magnitudeScale: 1 }];
    const movedWorld = {
      nodes: moved,
      nodeById: new Map(moved.map((n) => [n.id, n])),
    } as unknown as Parameters<typeof hitTestWorld>[0];
    const reported = worldToScreen(camera as never, 800, 600, 0 + 120, 0 + -80);
    expect(
      hitTestWorld(movedWorld, camera as never, 800, 600, tokens, reported.x, reported.y, undefined, offset as never, radiusScale as never),
    ).toBe("element");
    // …and two pixels off the reported centre, the same answer. Below the drawn
    // radius (3.5), so this is the disc itself rather than the courtesy ring.
    expect(
      hitTestWorld(movedWorld, camera as never, 800, 600, tokens, reported.x + 2, reported.y, undefined, offset as never, radiusScale as never),
    ).toBe("element");
    // The un-offset position is empty canvas — the offset is not decorative.
    expect(
      hitTestWorld(movedWorld, camera as never, 800, 600, tokens, 400, 300, undefined, offset as never, radiusScale as never),
    ).toBeNull();
  });
});
