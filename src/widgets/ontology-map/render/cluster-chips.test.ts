import { describe, expect, it } from "vitest";

import {
  clusterBadgeCenter,
  clusterBadgeLabel,
  clusterBadgeRect,
  clusterChipLabel,
  clusterChipOccupancyRect,
  clusterChipRect,
  clusterChipScale,
  clusterChipTravelPoint,
  CLUSTER_BADGE_HEIGHT,
  CLUSTER_CHIP_HEIGHT,
} from "./cluster-chips";

/**
 * Hit-testing (`topology-pointer-hit-tests.ts`) and drawing
 * (`ui/frame-draw/labels/paint-chips.ts`) must use the same `clusterChipRect` /
 * `clusterChipLabel` or click coordinates drift. That shared geometry is this
 * slice's load-bearing contract, so it is unit-tested here; the actual canvas
 * pixels are verified on the running screen.
 */
describe("clusterChipLabel", () => {
  it("collapsed is `+N`, expanded is `- N` (the number is kept)", () => {
    expect(clusterChipLabel(108, false)).toBe("+108");
    expect(clusterChipLabel(108, true)).toBe("− 108");
    expect(clusterChipLabel(5, false)).toBe("+5");
  });
});

describe("clusterChipScale", () => {
  it("follows the camera scale but clamps to a 0.85-1.5 band to stay legible", () => {
    expect(clusterChipScale(1)).toBe(1);
    expect(clusterChipScale(0.4)).toBe(0.85);
    expect(clusterChipScale(3)).toBe(1.5);
    expect(clusterChipScale(1.2)).toBeCloseTo(1.2, 6);
  });
  it("a non-finite scale falls back to 1", () => {
    expect(clusterChipScale(Number.NaN)).toBe(1);
  });
});

describe("clusterChipRect scale", () => {
  it("width and height scale proportionally with scale (shared by hit and draw)", () => {
    const base = clusterChipRect(0, 0, "+12", 1);
    const big = clusterChipRect(0, 0, "+12", 1.5);
    expect(big.w).toBeCloseTo(base.w * 1.5, 6);
    expect(big.h).toBeCloseTo(base.h * 1.5, 6);
    // The centre stays on the anchor.
    expect(big.x + big.w / 2).toBeCloseTo(0, 6);
  });
});

describe("clusterChipRect", () => {
  it("places the rectangle around the anchor (centre = anchor)", () => {
    const rect = clusterChipRect(200, 150, "+12");
    expect(rect.x + rect.w / 2).toBeCloseTo(200, 6);
    expect(rect.y + rect.h / 2).toBeCloseTo(150, 6);
    expect(rect.h).toBe(CLUSTER_CHIP_HEIGHT);
  });

  it("deterministic: the same input gives the same rectangle (the basis for hit and draw agreeing)", () => {
    expect(clusterChipRect(10, 20, "+7")).toEqual(clusterChipRect(10, 20, "+7"));
  });

  it("a longer label gives a wider rectangle (reflects the digit count)", () => {
    const narrow = clusterChipRect(0, 0, "+9");
    const wide = clusterChipRect(0, 0, "+108");
    expect(wide.w).toBeGreaterThan(narrow.w);
  });

  it("point-in-rect: the anchor point is always inside the rectangle", () => {
    const cx = 300;
    const cy = 220;
    const rect = clusterChipRect(cx, cy, clusterChipLabel(40, false));
    expect(cx >= rect.x && cx <= rect.x + rect.w).toBe(true);
    expect(cy >= rect.y && cy <= rect.y + rect.h).toBe(true);
  });
});

/**
 * The expanded badge, docked to the parent node. The floating pill was dropped;
 * the badge rectangle is derived from the parent's screen position and base
 * radius. Draw and hit must use the same `clusterBadgeRect` or click
 * coordinates drift.
 */
describe("clusterBadgeLabel", () => {
  it("the expanded badge is a compact `-N` (no space, symmetric with +N)", () => {
    expect(clusterBadgeLabel(63)).toBe("−63");
    expect(clusterBadgeLabel(5)).toBe("−5");
  });
});

describe("clusterBadgeRect", () => {
  const PARENT_X = 400;
  const PARENT_Y = 300;
  const NODE_R = 20;

  /**
   * The badge sits upper-left because the upper-right is the orbit button's bearing; sharing a shoulder
   * put 80% of the badge under the button (`tests/contract/settings/expand-settings.contract.test.ts`).
   */
  it("the badge sits at the parent's top-left (screen x to the left, y up)", () => {
    const rect = clusterBadgeRect(PARENT_X, PARENT_Y, NODE_R, clusterBadgeLabel(63));
    const cx = rect.x + rect.w / 2;
    const cy = rect.y + rect.h / 2;
    expect(cx).toBeLessThan(PARENT_X); // Left
    expect(cy).toBeLessThan(PARENT_Y); // Top
  });

  it("the badge lies fully outside the parent node radius (no aura or node overlap)", () => {
    const rect = clusterBadgeRect(PARENT_X, PARENT_Y, NODE_R, clusterBadgeLabel(63));
    // Distance to the badge corner nearest the parent (**lower-right**) > node radius.
    const nearX = rect.x + rect.w; // The right edge is closer to the parent
    const nearY = rect.y + rect.h; // The bottom edge is closer to the parent
    const dist = Math.hypot(nearX - PARENT_X, nearY - PARENT_Y);
    expect(dist).toBeGreaterThan(NODE_R);
  });

  it("a larger node radius pushes the badge further out (follows the camera)", () => {
    const near = clusterBadgeRect(PARENT_X, PARENT_Y, 10, clusterBadgeLabel(9));
    const far = clusterBadgeRect(PARENT_X, PARENT_Y, 40, clusterBadgeLabel(9));
    const nearReach = Math.hypot(near.x + near.w / 2 - PARENT_X, near.y + near.h / 2 - PARENT_Y);
    const farReach = Math.hypot(far.x + far.w / 2 - PARENT_X, far.y + far.h / 2 - PARENT_Y);
    expect(farReach).toBeGreaterThan(nearReach);
  });

  it("width and height scale proportionally with scale (shared by hit and draw)", () => {
    const base = clusterBadgeRect(PARENT_X, PARENT_Y, NODE_R, "−12", 1);
    const big = clusterBadgeRect(PARENT_X, PARENT_Y, NODE_R, "−12", 1.5);
    expect(big.w).toBeCloseTo(base.w * 1.5, 6);
    expect(big.h).toBeCloseTo(base.h * 1.5, 6);
    expect(base.h).toBe(CLUSTER_BADGE_HEIGHT);
  });

  it("deterministic: the same input gives the same rectangle (the basis for hit and draw agreeing)", () => {
    expect(clusterBadgeRect(PARENT_X, PARENT_Y, NODE_R, "−7")).toEqual(
      clusterBadgeRect(PARENT_X, PARENT_Y, NODE_R, "−7"),
    );
  });

  it("the badge height is smaller than the collapsed pill (mini badge)", () => {
    expect(CLUSTER_BADGE_HEIGHT).toBeLessThan(CLUSTER_CHIP_HEIGHT);
  });
});

/**
 * `clusterChipOccupancyRect` must take the **same branches** as
 * `drawClusterChip`. Diverge and labels either overlap the chip again (a missed
 * reservation) or dodge empty space (a ghost reservation). The two functions are
 * always edited together.
 */
describe("clusterChipOccupancyRect (label reservation for cluster chips)", () => {
  const base = { screenX: 400, screenY: 300, count: 31, hovered: false };

  it("collapsed matches the pill rectangle exactly", () => {
    const rect = clusterChipOccupancyRect({ ...base, expanded: false });
    expect(rect).toEqual(clusterChipRect(400, 300, clusterChipLabel(31, false)));
  });

  it("expanded matches the parent's top-right badge rectangle exactly", () => {
    const rect = clusterChipOccupancyRect({
      ...base,
      expanded: true,
      parentScreenX: 200,
      parentScreenY: 250,
      nodeScreenRadius: 18,
    });
    expect(rect).toEqual(clusterBadgeRect(200, 250, 18, clusterBadgeLabel(31)));
  });

  it("expanded with no parent geometry is null, and draw paints nothing either", () => {
    expect(clusterChipOccupancyRect({ ...base, expanded: true })).toBeNull();
  });

  it("a shape that fades out on the reveal ramp reserves nothing, since an invisible chip pushing labels away would leave a ghost margin", () => {
    // Collapsed pill alpha = 1 − revealT, so at revealT=1 the pill is invisible.
    expect(clusterChipOccupancyRect({ ...base, expanded: false, revealT: 1 })).toBeNull();
    // Expanded badge alpha = revealT, so at revealT=0 the badge is invisible.
    expect(
      clusterChipOccupancyRect({
        ...base,
        expanded: true,
        revealT: 0,
        parentScreenX: 200,
        parentScreenY: 250,
        nodeScreenRadius: 18,
      }),
    ).toBeNull();
  });

  it("the zoom scale carries through to the reserved width as well", () => {
    const small = clusterChipOccupancyRect({ ...base, expanded: false, scale: 1 })!;
    const large = clusterChipOccupancyRect({ ...base, expanded: false, scale: 1.5 })!;
    expect(large.w).toBeCloseTo(small.w * 1.5);
    expect(large.h).toBeCloseTo(small.h * 1.5);
  });
});

/**
 * The chip walks the gap: the collapsed pill and the expanded badge sit 51-147px apart, so at the end
 * of the transition the pill's position must equal the badge's and the crossfade happens at one point.
 */
describe("clusterChipTravelPoint: the chip walks to the badge position", () => {
  const base = {
    screenX: 100,
    screenY: 400,
    parentScreenX: 220,
    parentScreenY: 300,
    nodeScreenRadius: 14,
    scale: 1,
  };

  it("at rest it moves not one pixel from the anchor, with zero regression", () => {
    // Both revealT omitted (backward compatible) and 0 (collapsed, at rest) must keep the earlier coordinates.
    for (const revealT of [undefined, 0]) {
      const p = clusterChipTravelPoint({ ...base, revealT });
      expect(p, `revealT=${String(revealT)}`).toEqual({ x: base.screenX, y: base.screenY });
    }
  });

  it("when the transition ends it **arrives** at the badge position, so the crossfade happens at one point", () => {
    const arrived = clusterChipTravelPoint({ ...base, revealT: 1 });
    const badge = clusterBadgeCenter(
      base.parentScreenX,
      base.parentScreenY,
      base.nodeScreenRadius,
      base.scale,
    );
    expect(arrived.x).toBeCloseTo(badge.x, 6);
    expect(arrived.y).toBeCloseTo(badge.y, 6);
  });

  it("midway it lies between the two points rather than teleporting", () => {
    const mid = clusterChipTravelPoint({ ...base, revealT: 0.5 });
    const badge = clusterBadgeCenter(
      base.parentScreenX,
      base.parentScreenY,
      base.nodeScreenRadius,
      base.scale,
    );
    expect(mid.x).toBeCloseTo((base.screenX + badge.x) / 2, 6);
    expect(mid.y).toBeCloseTo((base.screenY + badge.y) / 2, 6);
  });

  it("does not move when the destination is unknown, so there is no drift", () => {
    // Without parent coordinates or radius (the degraded path) the badge is not
    // drawn either. A pill drifting off alone there is drift, not travel.
    for (const missing of [
      { parentScreenX: undefined },
      { parentScreenY: undefined },
      { nodeScreenRadius: undefined },
    ]) {
      const p = clusterChipTravelPoint({ ...base, ...missing, revealT: 1 });
      expect(p).toEqual({ x: base.screenX, y: base.screenY });
    }
  });

  it("the occupancy rectangle follows the movement and does not avoid the empty spot", () => {
    // If label avoidance keeps dodging the anchor, labels land on the ink of the
    // pill that walked away. Draw and occupancy must use the same travel point.
    //
    // ⚠️ Measured **mid-transition**. At `revealT: 1` the pill has fully faded, so
    // the earlier rule ("a form fading out occupies nothing") fires first and
    // returns null — correctly: an invisible chip pushing labels away is a ghost gap.
    const revealT = 0.5;
    const rect = clusterChipOccupancyRect({
      ...base,
      count: 7,
      hovered: false,
      expanded: false,
      revealT,
    });
    const travel = clusterChipTravelPoint({ ...base, revealT });
    expect(rect).not.toBeNull();
    expect(rect!.x + rect!.w / 2).toBeCloseTo(travel.x, 6);
    expect(rect!.y + rect!.h / 2).toBeCloseTo(travel.y, 6);
    // The point of this test is that it has not stayed on the anchor.
    expect(rect!.x + rect!.w / 2).not.toBeCloseTo(base.screenX, 1);
  });
});
