import { describe, expect, it } from "vitest";

import {
  computeRealmLayout,
  computeVisibleBounds,
  computeVisibleWardingRadius,
  computeWardingRadius,
  extractRealmSubtree,
  realmLayoutKind,
  realmMaxDepth,
  realmRingsForDepth,
  WARDING_VISIBLE_MARGIN_RATIO,
  WARDING_VISIBLE_MIN_MARGIN,
} from "./realm";
import { computeConcentricLayout, type LayoutRadii, type LayoutRings } from "./layout";

const RINGS: LayoutRings = { domain: 250, capability: 145, element: 90 };
const RADII: LayoutRadii = { project: 25, domain: 17, capability: 11, element: 7 };

/**
 * childrenByParent fixture: capability `c` as root with elements e1/e2 beneath
 * it and grandchild g1 under e1. Sibling domain d2 is outside the subtree.
 *   c ─ e1 ─ g1
 *     └ e2
 *   d2 (outside)
 */
function fixtureChildren(): Map<string, string[]> {
  return new Map<string, string[]>([
    ["c", ["e1", "e2"]],
    ["e1", ["g1"]],
    ["d2", ["x1"]],
  ]);
}

describe("extractRealmSubtree", () => {
  it("collects the transitive containment closure with depths from the root", () => {
    const sub = extractRealmSubtree("c", fixtureChildren());
    expect([...sub.memberIds].sort()).toEqual(["c", "e1", "e2", "g1"]);
    expect(sub.depthById.get("c")).toBe(0);
    expect(sub.depthById.get("e1")).toBe(1);
    expect(sub.depthById.get("e2")).toBe(1);
    expect(sub.depthById.get("g1")).toBe(2);
    expect(sub.parentById.get("g1")).toBe("e1");
    expect(sub.parentById.has("c")).toBe(false);
  });

  it("excludes sibling subtrees outside the root", () => {
    const sub = extractRealmSubtree("c", fixtureChildren());
    expect(sub.memberIds.has("d2")).toBe(false);
    expect(sub.memberIds.has("x1")).toBe(false);
  });

  it("terminates on cycles (revisit guard)", () => {
    const cyclic = new Map<string, string[]>([
      ["a", ["b"]],
      ["b", ["a", "c"]],
    ]);
    const sub = extractRealmSubtree("a", cyclic);
    expect([...sub.memberIds].sort()).toEqual(["a", "b", "c"]);
    expect(sub.depthById.get("a")).toBe(0);
    expect(sub.depthById.get("b")).toBe(1);
    expect(sub.depthById.get("c")).toBe(2);
  });

  it("is a singleton when the root has no children", () => {
    const sub = extractRealmSubtree("leaf", new Map());
    expect([...sub.memberIds]).toEqual(["leaf"]);
    expect(sub.depthById.get("leaf")).toBe(0);
  });
});

describe("realmLayoutKind", () => {
  it("maps depth to ring kind regardless of render kind", () => {
    expect(realmLayoutKind(0)).toBe("project");
    expect(realmLayoutKind(1)).toBe("domain");
    expect(realmLayoutKind(2)).toBe("capability");
    expect(realmLayoutKind(3)).toBe("element");
    expect(realmLayoutKind(9)).toBe("element");
  });
});

describe("realmMaxDepth", () => {
  it("is 0 for a root-only subtree (no children)", () => {
    const sub = extractRealmSubtree("leaf", new Map());
    expect(realmMaxDepth(sub)).toBe(0);
  });

  it("is the chain length for a linear chain", () => {
    const chain = new Map<string, string[]>([
      ["a", ["b"]],
      ["b", ["c"]],
      ["c", ["d"]],
    ]);
    const sub = extractRealmSubtree("a", chain);
    expect(realmMaxDepth(sub)).toBe(3);
  });

  it("is 1 for a fan (root with only direct children)", () => {
    const fan = new Map<string, string[]>([["root", ["a", "b", "c"]]]);
    const sub = extractRealmSubtree("root", fan);
    expect(realmMaxDepth(sub)).toBe(1);
  });
});

describe("realmRingsForDepth", () => {
  const BASE: LayoutRings = { domain: 250, capability: 145, element: 90 };
  const FILL = { depth1: 130, depth2: 190, depth3: 250 };

  it("pulls rings in for a shallow (maxDepth=1) subtree", () => {
    const rings = realmRingsForDepth(1, BASE, FILL);
    expect(rings.domain).toBeCloseTo(130, 5);
    expect(rings.capability).toBeCloseTo(75.4, 5);
    expect(rings.element).toBeCloseTo(46.8, 5);
  });

  it("pulls rings in less for maxDepth=2", () => {
    const rings = realmRingsForDepth(2, BASE, FILL);
    expect(rings.domain).toBeCloseTo(190, 5);
    expect(rings.capability).toBeCloseTo(110.2, 5);
    expect(rings.element).toBeCloseTo(68.4, 5);
  });

  it("is byte-identical to base rings at maxDepth>=3 (deep realms unaffected — regression guard)", () => {
    expect(realmRingsForDepth(3, BASE, FILL)).toEqual(BASE);
    expect(realmRingsForDepth(5, BASE, FILL)).toEqual(BASE);
  });

  it("is deterministic — same input yields the same output", () => {
    expect(realmRingsForDepth(1, BASE, FILL)).toEqual(realmRingsForDepth(1, BASE, FILL));
  });
});

describe("computeRealmLayout", () => {
  it("places the root at the origin and depth-1 children on the domain ring", () => {
    const sub = extractRealmSubtree("c", fixtureChildren());
    const layout = computeRealmLayout(sub, RINGS, RADII);
    const root = layout.get("c");
    expect(root).toEqual({ id: "c", x: 0, y: 0 });
    // Depth-1 children ring the origin at the ring radius, the invariant layout.test pins for domains.
    for (const id of ["e1", "e2"]) {
      const p = layout.get(id);
      expect(p).toBeDefined();
      // De-pileup only nudges local overlaps, so the siblings stay near the ring.
      const r = Math.hypot(p!.x, p!.y);
      expect(r).toBeGreaterThan(RINGS.domain * 0.5);
    }
  });

  it("is deterministic — same subtree yields byte-identical coordinates", () => {
    const a = computeRealmLayout(extractRealmSubtree("c", fixtureChildren()), RINGS, RADII);
    const b = computeRealmLayout(extractRealmSubtree("c", fixtureChildren()), RINGS, RADII);
    expect([...a.entries()]).toEqual([...b.entries()]);
  });
});

describe("computeRealmLayout with few children lies horizontal", () => {
  it("seats two depth 1 children on the horizontal axis: the first left, the second right", () => {
    const sub = extractRealmSubtree("c", new Map([["c", ["e1", "e2"]]]));
    const layout = computeRealmLayout(sub, RINGS, RADII);
    expect(layout.get("c")).toEqual({ id: "c", x: 0, y: 0 });
    const e1 = layout.get("e1")!;
    const e2 = layout.get("e2")!;
    // −90° rigid rotation of the even split: (0,−R)→(−R,0), (0,R)→(R,0).
    expect(e1.x).toBeLessThan(0);
    expect(Math.abs(e1.y)).toBeLessThan(1e-9);
    expect(e2.x).toBeGreaterThan(0);
    expect(Math.abs(e2.y)).toBeLessThan(1e-9);
  });

  it("seats one depth 1 child on the horizontal axis (left) by the same -90 degree rigid rotation", () => {
    const sub = extractRealmSubtree("c", new Map([["c", ["only"]]]));
    const layout = computeRealmLayout(sub, RINGS, RADII);
    const only = layout.get("only")!;
    expect(only.x).toBeLessThan(0);
    expect(Math.abs(only.y)).toBeLessThan(1e-9);
  });

  it("rotates rigidly: exactly (x,y) to (y,-x) of the unrotated concentric layout", () => {
    const children = new Map([
      ["c", ["e1", "e2"]],
      ["e1", ["g1"]],
    ]);
    const sub = extractRealmSubtree("c", children);
    const rotated = computeRealmLayout(sub, RINGS, RADII);
    const rawInput = [...sub.depthById.keys()].map((id) => ({
      id,
      kind: realmLayoutKind(sub.depthById.get(id) ?? 0),
      parentId: id === sub.rootId ? null : sub.parentById.get(id) ?? null,
    }));
    const raw = new Map(computeConcentricLayout(rawInput, RINGS, { radii: RADII }).map((p) => [p.id, p]));
    for (const id of ["e1", "e2", "g1"]) {
      const r = raw.get(id)!;
      const p = rotated.get(id)!;
      expect(p.x).toBeCloseTo(r.y, 10);
      expect(p.y).toBeCloseTo(-r.x, 10);
    }
  });

  it("leaves three or more depth 1 children unrotated, the first at the top (-90 degrees)", () => {
    const sub = extractRealmSubtree("c", new Map([["c", ["a", "b", "d"]]]));
    const layout = computeRealmLayout(sub, RINGS, RADII);
    const a = layout.get("a")!;
    // The even split starts at −90°, so the first child sits on top.
    expect(Math.abs(a.x)).toBeLessThan(1e-9);
    expect(a.y).toBeLessThan(0);
  });
});

describe("computeWardingRadius", () => {
  it("is the farthest point distance plus margin (deterministic)", () => {
    const center = { x: 0, y: 0 };
    const points = [
      { x: 30, y: 40 }, // dist 50
      { x: 0, y: 100 }, // dist 100
      { x: -60, y: 0 }, // dist 60
    ];
    expect(computeWardingRadius(points, center, 24)).toBe(124);
  });

  it("returns just the margin when only the root is present", () => {
    expect(computeWardingRadius([], { x: 0, y: 0 }, 24)).toBe(24);
  });

  it("respects a non-origin center", () => {
    const r = computeWardingRadius([{ x: 100, y: 0 }], { x: 40, y: 0 }, 10);
    expect(r).toBe(70);
  });
});

describe("computeVisibleWardingRadius", () => {
  it("is the farthest reach plus a content-proportional margin", () => {
    // outer 200: margin = max(40, 200*0.1) = 40.
    expect(computeVisibleWardingRadius([50, 120, 200])).toBe(200 + Math.max(WARDING_VISIBLE_MIN_MARGIN, 200 * WARDING_VISIBLE_MARGIN_RATIO));
    expect(computeVisibleWardingRadius([50, 120, 200])).toBe(240);
    // outer 800: margin = max(40, 80) = 80.
    expect(computeVisibleWardingRadius([800])).toBe(800 + 800 * WARDING_VISIBLE_MARGIN_RATIO);
  });

  it("shrinks the radius when the visible set shrinks (folded)", () => {
    const full = computeVisibleWardingRadius([100, 400, 900]);
    const folded = computeVisibleWardingRadius([100, 400]);
    expect(folded).toBeLessThan(full);
  });

  it("keeps only the minimum margin without visible members (root only)", () => {
    expect(computeVisibleWardingRadius([])).toBe(WARDING_VISIBLE_MIN_MARGIN);
  });
});

describe("computeVisibleBounds", () => {
  const fallback = { minX: -1, minY: -1, maxX: 1, maxY: 1 };
  it("is the point set bbox plus margin", () => {
    const b = computeVisibleBounds([{ x: -10, y: 20 }, { x: 30, y: -5 }], 4, fallback);
    expect(b).toEqual({ minX: -14, minY: -9, maxX: 34, maxY: 24 });
  });
  it("returns the fallback unchanged without points", () => {
    expect(computeVisibleBounds([], 4, fallback)).toBe(fallback);
  });
});
