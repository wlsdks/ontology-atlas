import { describe, expect, it } from "vitest";

import { computeDragTugSets, stepTugAxis, tugFactorForHop, tugFalloffForDistance } from "./drag-tug";

/**
 * C1 B1 — local spring tug during node drag. Audit finding: FA2's global relax
 * (1 iteration/frame, slowDown 20) produces no visible neighbor motion when a
 * node is dragged. The fix is an EXPLICIT displacement-propagation layer: the
 * dragged node's per-frame world-space displacement propagates to 1-hop
 * neighbors × `--topology-v2-drag-tug-1hop` (0.45) and 2-hop × `-2hop` (0.15),
 * eased in smoothly (springy, not rigid) so neighbors visibly lag then catch up.
 */
describe("tugFactorForHop", () => {
  const FACTORS = { oneHop: 0.45, twoHop: 0.15 };

  it("falls off strictly: dragged (1.0) > 1-hop (0.45) > 2-hop (0.15) > rest (0)", () => {
    const dragged = tugFactorForHop(0, FACTORS);
    const oneHop = tugFactorForHop(1, FACTORS);
    const twoHop = tugFactorForHop(2, FACTORS);
    const rest = tugFactorForHop(3, FACTORS);
    expect(dragged).toBe(1);
    expect(oneHop).toBe(0.45);
    expect(twoHop).toBe(0.15);
    expect(rest).toBe(0);
    expect(dragged).toBeGreaterThan(oneHop);
    expect(oneHop).toBeGreaterThan(twoHop);
    expect(twoHop).toBeGreaterThan(rest);
  });
});

/**
 * Distance falloff — the hop factors above say WHO may be tugged, this says HOW
 * MUCH given how far away they actually sit. Hop count alone is a poor proxy
 * for "near": in a hub-and-spoke vault every node is within 2 hops, so the
 * measured symptom was that dragging one node visibly dragged the entire map
 * (a 900-unit-away node moved ~58px on a 430px drag). Compact support means
 * far nodes are exactly still, not just slightly moved.
 */
describe("tugFalloffForDistance", () => {
  const RADIUS = 600;

  it("is full strength at the grab point and exactly zero at/beyond the radius", () => {
    expect(tugFalloffForDistance(0, RADIUS)).toBe(1);
    expect(tugFalloffForDistance(RADIUS, RADIUS)).toBe(0);
    expect(tugFalloffForDistance(RADIUS * 2, RADIUS)).toBe(0);
  });

  it("decays monotonically across the radius", () => {
    const samples = [0, 100, 200, 300, 400, 500, 600].map((d) => tugFalloffForDistance(d, RADIUS));
    for (let i = 1; i < samples.length; i += 1) {
      expect(samples[i]).toBeLessThan(samples[i - 1]);
    }
  });

  it("keeps the grabbed node's own cluster clearly elastic", () => {
    // Layout rings: element 90 / capability 145 / domain 250 from their parent.
    expect(tugFalloffForDistance(90, RADIUS)).toBeGreaterThan(0.85);
    expect(tugFalloffForDistance(145, RADIUS)).toBeGreaterThan(0.75);
    expect(tugFalloffForDistance(250, RADIUS)).toBeGreaterThan(0.5);
  });

  it("eases out rather than cutting off — no visible pop at the boundary", () => {
    expect(tugFalloffForDistance(RADIUS * 0.95, RADIUS)).toBeLessThan(0.02);
  });

  it("treats a non-positive radius as 'no tug' instead of dividing by zero", () => {
    expect(tugFalloffForDistance(10, 0)).toBe(0);
    expect(tugFalloffForDistance(10, -5)).toBe(0);
  });
});

describe("computeDragTugSets", () => {
  function graph(edges: Record<string, string[]>): Map<string, ReadonlySet<string>> {
    return new Map(Object.entries(edges).map(([id, ns]) => [id, new Set(ns)]));
  }

  it("returns the dragged node's direct neighbors as the 1-hop set", () => {
    const neighborMap = graph({ a: ["b", "c"], b: ["a"], c: ["a"] });
    const sets = computeDragTugSets(neighborMap, "a");
    expect([...sets.oneHop].sort()).toEqual(["b", "c"]);
  });

  it("returns neighbors-of-neighbors (excluding the dragged node and the 1-hop set) as the 2-hop set", () => {
    // a - b - d
    // a - c
    const neighborMap = graph({ a: ["b", "c"], b: ["a", "d"], c: ["a"], d: ["b"] });
    const sets = computeDragTugSets(neighborMap, "a");
    expect([...sets.oneHop].sort()).toEqual(["b", "c"]);
    expect([...sets.twoHop].sort()).toEqual(["d"]);
  });

  it("excludes the dragged node itself from both sets even in a triangle", () => {
    const neighborMap = graph({ a: ["b", "c"], b: ["a", "c"], c: ["a", "b"] });
    const sets = computeDragTugSets(neighborMap, "a");
    expect(sets.oneHop.has("a")).toBe(false);
    expect(sets.twoHop.has("a")).toBe(false);
    // b and c are mutual neighbors AND 1-hop of a — must not also land in twoHop.
    expect(sets.twoHop.size).toBe(0);
  });

  it("returns empty sets for a node with no neighbors", () => {
    const neighborMap = graph({ lonely: [] });
    const sets = computeDragTugSets(neighborMap, "lonely");
    expect(sets.oneHop.size).toBe(0);
    expect(sets.twoHop.size).toBe(0);
  });
});

describe("stepTugAxis (decay convergence)", () => {
  it("eases toward the target and converges over many steps", () => {
    let current = 0;
    const target = 40;
    for (let i = 0; i < 240; i += 1) {
      current = stepTugAxis(current, target, 1 / 60, 0.12);
    }
    expect(current).toBeGreaterThan(39.9);
    expect(current).toBeLessThanOrEqual(40 + 1e-6);
  });

  it("eases back toward 0 once the target drops to 0 (post-release decay)", () => {
    let current = 40;
    for (let i = 0; i < 240; i += 1) {
      current = stepTugAxis(current, 0, 1 / 60, 0.12);
    }
    expect(current).toBeLessThan(0.1);
    expect(current).toBeGreaterThanOrEqual(0);
  });

  it("never overshoots the target (monotonic approach, no spring bounce)", () => {
    let current = 0;
    let prev = -Infinity;
    for (let i = 0; i < 30; i += 1) {
      current = stepTugAxis(current, 10, 1 / 60, 0.12);
      expect(current).toBeGreaterThanOrEqual(prev);
      expect(current).toBeLessThanOrEqual(10 + 1e-9);
      prev = current;
    }
  });
});
