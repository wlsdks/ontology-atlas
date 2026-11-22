import { describe, expect, it } from "vitest";

import { DEFAULT_TIER_REVEAL } from "../../../model/visibility/tier-visibility";
import type { OntologyMapTokens } from "../../../tokens/read-map-tokens";
import { computeEgoBounds } from "../../world/framing/world-bounds";
import { type TopologyWorld } from "../../world/topology-world";
import { computeDomeFocusCameraTarget, computeFocusCameraTarget } from "./focus-fit";
import { focusLeashPx, focusLeashWorld, FOCUS_LEASH_EDGE_PAD_PX } from "./pan-leash";
import { computeEffectiveCameraScaleMax } from "./zoom-range";

describe("computeDomeFocusCameraTarget", () => {
  const tokens = { focusBboxMargin: 1, cameraMaxZoomRatio: 4, cameraScaleMax: 10, focusMaxZoomRatio: 2, cameraFocusPanMargin: 50 } as unknown as OntologyMapTokens;
  const ego = { minX: 0, minY: 0, maxX: 100, maxY: 100 };

  it("fits the ego bounds, capped by the focus zoom-in ceiling, and centres them", () => {
    expect(computeDomeFocusCameraTarget(ego, tokens, 1000, 800, 1, null)).toEqual({ tx: 50, ty: 50, tscale: 2 });
  });

  it("never zooms out past the dome fit scale it is given as a floor", () => {
    const wide = { minX: 0, minY: 0, maxX: 2000, maxY: 2000 };
    expect(computeDomeFocusCameraTarget(wide, tokens, 1000, 800, 1, 0.8).tscale).toBe(0.8);
  });

  it("pulls a centre that falls outside the focus pan leash back to its edge", () => {
    expect(computeDomeFocusCameraTarget(ego, tokens, 1000, 800, 1, null, { x: -100, y: 200 })).toEqual({ tx: -50, ty: 150, tscale: 2 });
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
