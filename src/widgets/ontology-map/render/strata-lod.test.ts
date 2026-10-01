import { describe, expect, it } from "vitest";

import {
  addStrataLodDust,
  createStrataLodDust,
  drawStrataLodDust,
  drawStrataLodSheets,
  resetStrataLodDust,
  strataLodDustSpreadPx,
  type StrataLodSheetDraw,
} from "./strata-lod";

function recordingContext() {
  const calls = { fill: 0, stroke: 0, arc: 0, gradients: [] as number[][] };
  const ctx = {
    globalAlpha: 1,
    fillStyle: "" as unknown,
    beginPath() {},
    moveTo() {},
    lineTo() {},
    closePath() {},
    arc() {
      calls.arc += 1;
    },
    fill() {
      calls.fill += 1;
    },
    stroke() {
      calls.stroke += 1;
    },
    createLinearGradient(x0: number, y0: number, x1: number, y1: number) {
      calls.gradients.push([x0, y0, x1, y1]);
      return { addColorStop() {} };
    },
  };
  return { ctx: ctx as unknown as CanvasRenderingContext2D, calls };
}

const inks = {
  kindRgb: { capability: [211, 159, 73], element: [124, 166, 141] } as const,
  warningRgb: [220, 170, 60] as const,
};

describe("drawStrataLodDust", () => {
  it("fills a fixed number of batches however many concepts the dust stands for", () => {
    const fillsFor = (count: number) => {
      const dust = createStrataLodDust();
      resetStrataLodDust(dust);
      for (let i = 0; i < count; i += 1) {
        const plane = i % 3 === 0 ? "capability" : "element";
        const state = i % 7 === 0 ? "stale" : "unknown";
        addStrataLodDust(dust, plane, state, (i % 100) / 100, 1, i % 1440, i % 900);
      }
      const { ctx, calls } = recordingContext();
      const drawn = drawStrataLodDust(ctx, dust, inks, () => 1, 1);
      return { fills: calls.fill, arcs: calls.arc, drawn };
    };
    const small = fillsFor(1_000);
    const large = fillsFor(10_000);
    expect(large.drawn).toBe(10_000);
    expect(large.arcs).toBe(10_000);
    expect(large.fills).toBe(small.fills);
    expect(large.fills).toBeLessThanOrEqual(16);
  });

  it("draws nothing while the structure is hidden", () => {
    const dust = createStrataLodDust();
    addStrataLodDust(dust, "element", "unknown", 0.2, 1, 10, 10);
    const { ctx, calls } = recordingContext();
    expect(drawStrataLodDust(ctx, dust, inks, () => 1, 0)).toBe(0);
    expect(calls.fill).toBe(0);
  });
});

describe("strataLodDustSpreadPx", () => {
  it("keeps dust on its lane while neighbours stand apart, and spreads it only when they pile up", () => {
    expect(strataLodDustSpreadPx("element", 3)).toBe(0);
    expect(strataLodDustSpreadPx("element", 2.6)).toBe(0);
    const loose = strataLodDustSpreadPx("element", 1.5);
    const dense = strataLodDustSpreadPx("element", 0.3);
    expect(loose).toBeGreaterThan(0);
    expect(dense).toBeGreaterThan(loose);
    expect(strataLodDustSpreadPx("element", 0)).toBeLessThanOrEqual(4.5);
  });
});

describe("drawStrataLodSheets", () => {
  const sheet = (depth: number, weight: number, x0: number): StrataLodSheetDraw => ({
    kind: "fan",
    xs: [x0, x0 + 10, x0 - 10],
    ys: [0, 50, 50],
    length: 3,
    x0,
    y0: 0,
    u0: depth,
    x1: x0,
    y1: 50,
    u1: depth,
    weight,
    depth,
  });

  it("fills each visible sheet once, far ones first, and skips a sheet whose lines are drawn instead", () => {
    const { ctx, calls } = recordingContext();
    drawStrataLodSheets(ctx, [sheet(0.2, 1, 1), sheet(0.9, 1, 2), sheet(0.5, 0, 3)], 3, [128, 128, 140], () => 1, 1);
    expect(calls.fill).toBe(2);
    expect(calls.gradients.map((g) => g[0])).toEqual([2, 1]);
  });
});
