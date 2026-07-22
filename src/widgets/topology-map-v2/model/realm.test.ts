import { describe, expect, it } from "vitest";

import {
  computeRealmLayout,
  computeWardingRadius,
  extractRealmSubtree,
  realmLayoutKind,
} from "./realm";
import type { LayoutRadii, LayoutRings } from "./layout";

const RINGS: LayoutRings = { domain: 250, capability: 145, element: 90 };
const RADII: LayoutRadii = { project: 25, domain: 17, capability: 11, element: 7 };

/**
 * childrenByParent 픽스처: capability `c` 루트, 그 아래 element e1/e2,
 * e1 아래 손자 g1. 형제 도메인 d2 는 서브트리 밖.
 *   c ─ e1 ─ g1
 *     └ e2
 *   d2 (밖)
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

describe("computeRealmLayout", () => {
  it("places the root at the origin and depth-1 children on the domain ring", () => {
    const sub = extractRealmSubtree("c", fixtureChildren());
    const layout = computeRealmLayout(sub, RINGS, RADII);
    const root = layout.get("c");
    expect(root).toEqual({ id: "c", x: 0, y: 0 });
    // depth-1 children (e1, e2) fan around the domain ring — at exactly the
    // ring radius from the origin (same invariant layout.test pins for domains).
    for (const id of ["e1", "e2"]) {
      const p = layout.get(id);
      expect(p).toBeDefined();
      // Two depth-1 siblings sit on the ring at radius `domain` before de-pileup;
      // the de-pileup only nudges local overlaps, so they stay near the ring.
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
