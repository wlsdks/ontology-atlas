import { describe, expect, it } from "vitest";

import { computeDragTugSets, stepTugAxis, tugFactorForHop } from "./drag-tug";

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
