import { describe, expect, it } from "vitest";

import { bodyPoints, bodyPointsScratch, minCornerRadius, roundedPolygonPath, squarePoints, type NodeKind } from "./silhouette";

const POLYGON_KINDS: NodeKind[] = ["project", "domain", "element"];

describe("bodyPointsScratch", () => {
  it("holds the same points as the allocating bodyPoints for every polygon kind", () => {
    for (const kind of POLYGON_KINDS) {
      const expected = bodyPoints(kind, 40, 25, 12);
      expect(bodyPointsScratch(kind, 40, 25, 12), kind).toEqual(expected);
    }
  });

  it("gives a capability no polygon, since it is a circle", () => {
    expect(bodyPoints("capability", 0, 0, 10)).toBeNull();
    expect(bodyPointsScratch("capability", 0, 0, 10)).toBeNull();
  });

  it("reuses one buffer per shape so a frame allocates nothing per node", () => {
    expect(bodyPointsScratch("domain", 0, 0, 10)).toBe(bodyPointsScratch("element", 5, 5, 8));
    expect(bodyPointsScratch("project", 0, 0, 10)).toBe(bodyPointsScratch("project", 5, 5, 8));
  });
});

describe("minCornerRadius", () => {
  it("is a share of the draw radius that depends on the kind", () => {
    expect(minCornerRadius("project", 10)).toBeCloseTo(1.4, 6);
    expect(minCornerRadius("domain", 10)).toBeCloseTo(1.892, 6);
    expect(minCornerRadius("element", 10)).toBeCloseTo(2.76, 6);
  });

  it("never drops below half a pixel, so a tiny node still rounds", () => {
    for (const kind of POLYGON_KINDS) expect(minCornerRadius(kind, 0.1), kind).toBe(0.5);
  });
});

describe("roundedPolygonPath", () => {
  function trace(rad: number) {
    const calls: string[] = [];
    const sink = {
      moveTo: (x: number, y: number) => void calls.push(`M${x},${y}`),
      lineTo: (x: number, y: number) => void calls.push(`L${x},${y}`),
      quadraticCurveTo: (cx: number, cy: number, x: number, y: number) => void calls.push(`Q${cx},${cy},${x},${y}`),
      closePath: () => void calls.push("Z"),
    };
    roundedPolygonPath(sink, squarePoints(5, 5, 5), rad);
    return calls;
  }

  it("rounds each corner by the radius, curving through the corner itself", () => {
    expect(trace(2).slice(0, 2)).toEqual(["M0,2", "Q0,0,2,0"]);
  });

  it("caps the radius at 45% of the adjacent edge so neighbouring corners never cross", () => {
    expect(trace(100).slice(0, 2)).toEqual(["M0,4.5", "Q0,0,4.5,0"]);
  });

  it("closes the path and leaves beginPath to the caller", () => {
    const calls = trace(2);
    expect(calls.at(-1)).toBe("Z");
    expect(calls.filter((c) => c.startsWith("M"))).toHaveLength(1);
  });
});
