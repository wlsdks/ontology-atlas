import { describe, expect, it } from "vitest";

import type { LibraryGraph } from "./build-library-graph";
import {
  alignToLongestAxis,
  easeMotion,
  fitToBox,
  interpolatePositions,
  layoutLibraryGraph,
  seedPositions,
} from "./library-graph-layout";

function ring(count: number, edges: Array<[number, number]> = []): LibraryGraph {
  return {
    nodes: Array.from({ length: count }, (_, index) => ({
      id: `n${index}`,
      kind: "page" as const,
      label: `n${index}`,
      ref: `n${index}`,
      href: null,
    })),
    edges: edges.map(([from, to]) => ({
      id: `e${from}-${to}`,
      source: `n${from}`,
      target: `n${to}`,
      relation: "cites" as const,
      certainty: "current" as const,
    })),
    counts: { sources: 0, pages: count, concepts: 0, cites: edges.length, mentions: 0 },
  };
}

describe("the library graph's layout", () => {
  it("gives every node a finite position", () => {
    const layout = layoutLibraryGraph(ring(12, [[0, 1], [1, 2], [2, 3], [3, 0], [4, 5]]));
    expect(layout.settled.size).toBe(12);
    for (const point of layout.settled.values()) {
      expect(Number.isFinite(point.x)).toBe(true);
      expect(Number.isFinite(point.y)).toBe(true);
    }
  });

  it("draws the same picture twice — the shape of a folder has to be learnable", () => {
    const graph = ring(20, [[0, 1], [1, 2], [3, 4], [5, 6], [6, 7], [0, 7]]);
    expect(layoutLibraryGraph(graph).settled).toEqual(layoutLibraryGraph(graph).settled);
  });

  it("separates connected nodes instead of stacking them on one point", () => {
    const layout = layoutLibraryGraph(ring(6, [[0, 1], [1, 2], [2, 3], [3, 4], [4, 5]]));
    const points = [...layout.settled.values()];
    const distances = points.flatMap((a, i) =>
      points.slice(i + 1).map((b) => Math.hypot(a.x - b.x, a.y - b.y)),
    );
    expect(Math.min(...distances)).toBeGreaterThan(1);
  });

  it("handles an empty graph without inventing a node", () => {
    const layout = layoutLibraryGraph(ring(0));
    expect(layout.settled.size).toBe(0);
    expect(layout.seeds.size).toBe(0);
  });

  it("seeds a spiral, not a dial: no two nodes share a radius", () => {
    const seeds = seedPositions(["a", "b", "c", "d"]);
    const radii = [...seeds.values()].map((point) => Math.hypot(point.x, point.y));
    expect(new Set(radii.map((r) => r.toFixed(4))).size).toBe(radii.length);
  });
});

describe("aligning the picture with the canvas's long axis", () => {
  it("preserves every distance — it is a rotation, not a stretch", () => {
    const points = new Map([
      ["a", { x: 0, y: 0 }],
      ["b", { x: 30, y: 30 }],
      ["c", { x: -10, y: 40 }],
    ]);
    const rotated = alignToLongestAxis(points);
    const distance = (map: ReadonlyMap<string, { x: number; y: number }>, from: string, to: string) =>
      Math.hypot(map.get(from)!.x - map.get(to)!.x, map.get(from)!.y - map.get(to)!.y);
    for (const [from, to] of [["a", "b"], ["b", "c"], ["a", "c"]] as const) {
      expect(distance(rotated, from, to)).toBeCloseTo(distance(points, from, to), 6);
    }
  });

  it("lays a diagonal line flat, which is what buys the width back", () => {
    const points = new Map(
      Array.from({ length: 6 }, (_, index) => [`n${index}`, { x: index * 10, y: index * 10 }] as const),
    );
    const rotated = [...alignToLongestAxis(points).values()];
    const spanX = Math.max(...rotated.map((p) => p.x)) - Math.min(...rotated.map((p) => p.x));
    const spanY = Math.max(...rotated.map((p) => p.y)) - Math.min(...rotated.map((p) => p.y));
    expect(spanX).toBeGreaterThan(spanY * 100);
  });

  it("leaves a single node exactly where it is", () => {
    const one = new Map([["only", { x: 4, y: 9 }]]);
    expect(alignToLongestAxis(one)).toEqual(one);
  });
});

describe("fitting the layout into the canvas box", () => {
  it("uses one scale for both axes, so a distance means the same thing in x and y", () => {
    const points = new Map([
      ["a", { x: -100, y: -10 }],
      ["b", { x: 100, y: 10 }],
    ]);
    const fitted = fitToBox(points, { width: 600, height: 320, padding: 20 });
    const a = fitted.get("a");
    const b = fitted.get("b");
    // The world span is 200 × 20; a per-axis fit would have stretched y by 10×.
    const scaleX = (b!.x - a!.x) / 200;
    const scaleY = (b!.y - a!.y) / 20;
    expect(scaleX).toBeCloseTo(scaleY, 6);
  });

  it("keeps every fitted point inside the padded box", () => {
    const points = new Map(
      Array.from({ length: 30 }, (_, index) => [
        `n${index}`,
        { x: Math.cos(index) * 500, y: Math.sin(index) * 500 },
      ] as const),
    );
    const box = { width: 640, height: 320, padding: 26 };
    for (const point of fitToBox(points, box).values()) {
      expect(point.x).toBeGreaterThanOrEqual(box.padding - 0.001);
      expect(point.x).toBeLessThanOrEqual(box.width - box.padding + 0.001);
      expect(point.y).toBeGreaterThanOrEqual(box.padding - 0.001);
      expect(point.y).toBeLessThanOrEqual(box.height - box.padding + 0.001);
    }
  });

  it("centres a single node rather than dividing by a zero span", () => {
    const fitted = fitToBox(new Map([["only", { x: 12, y: -4 }]]), {
      width: 600,
      height: 320,
      padding: 26,
    });
    expect(fitted.get("only")).toEqual({ x: 300, y: 160 });
  });
});

describe("the settle", () => {
  it("starts at the seed and ends at the settled position", () => {
    const seeds = new Map([["a", { x: 0, y: 0 }]]);
    const settled = new Map([["a", { x: 100, y: 50 }]]);
    expect(interpolatePositions(seeds, settled, 0).get("a")).toEqual({ x: 0, y: 0 });
    expect(interpolatePositions(seeds, settled, 1).get("a")).toEqual({ x: 100, y: 50 });
  });

  it("decelerates: more than half the distance is covered in the first half of the time", () => {
    expect(easeMotion(0.5)).toBeGreaterThan(0.5);
    expect(easeMotion(0)).toBe(0);
    expect(easeMotion(1)).toBe(1);
  });

  it("never moves backwards", () => {
    let previous = -1;
    for (let t = 0; t <= 1.0001; t += 0.05) {
      const value = easeMotion(t);
      expect(value).toBeGreaterThanOrEqual(previous);
      previous = value;
    }
  });

  it("matches `cubic-bezier(0.25, 0.1, 0.25, 1)` at its midpoint", () => {
    // The curve's own y at x = 0.5, computed from the control points, is 0.8024…
    expect(easeMotion(0.5)).toBeCloseTo(0.8024, 3);
  });
});
