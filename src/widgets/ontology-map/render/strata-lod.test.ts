import { describe, expect, it } from "vitest";

import {
  addStrataLodDust,
  createStrataLodDust,
  drawStrataLodChords,
  drawStrataLodDust,
  drawStrataLodSheets,
  resetStrataLodDust,
  strataLodChordWidth,
  type StrataLodChordDraw,
  type StrataLodSheetDraw,
} from "./strata-lod";

function recordingContext() {
  const calls = { fill: 0, stroke: 0, arc: 0, gradients: [] as number[][], fillStyles: [] as string[], strokeStyles: [] as string[] };
  const ctx = {
    globalAlpha: 1,
    lineCap: "butt",
    lineWidth: 1,
    strokeStyle: "" as unknown,
    fillStyle: "" as unknown,
    quadraticCurveTo() {},
    beginPath() {},
    moveTo() {},
    lineTo() {},
    closePath() {},
    arc() {
      calls.arc += 1;
    },
    fill() {
      calls.fill += 1;
      calls.fillStyles.push(String(this.fillStyle));
    },
    stroke() {
      calls.stroke += 1;
      calls.strokeStyles.push(String(this.strokeStyle));
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
    expect(large.fills).toBeLessThanOrEqual(2 * 3 * 8);
  });

  it("follows a crossfading weight continuously instead of in steps", () => {
    const alphaFor = (weight: number) => {
      const dust = createStrataLodDust();
      addStrataLodDust(dust, "element", "current", 0.1, weight, 10, 10);
      const { ctx, calls } = recordingContext();
      drawStrataLodDust(ctx, dust, inks, () => 1, 1);
      const match = calls.fillStyles[0]?.match(/,([\d.]+)\)$/);
      return match ? Number(match[1]) : 0;
    };
    let previous = alphaFor(1);
    for (let frame = 1; frame <= 15; frame += 1) {
      const weight = Math.max(0, 1 - frame / 15);
      const alpha = alphaFor(weight);
      expect(Math.abs(alpha - 0.7 * weight)).toBeLessThanOrEqual(0.7 / 128 + 0.001);
      expect(previous - alpha).toBeLessThanOrEqual(0.7 / 15 + 0.01);
      previous = alpha;
    }
  });

  it("draws nothing while the structure is hidden", () => {
    const dust = createStrataLodDust();
    addStrataLodDust(dust, "element", "unknown", 0.2, 1, 10, 10);
    const { ctx, calls } = recordingContext();
    expect(drawStrataLodDust(ctx, dust, inks, () => 1, 0)).toBe(0);
    expect(calls.fill).toBe(0);
  });
});

describe("drawStrataLodChords", () => {
  const chord = (count: number, weight: number, depth: number): StrataLodChordDraw => ({
    ax: 0,
    ay: 0,
    bx: 100,
    by: 0,
    cx: 50,
    cy: 20,
    count,
    weight,
    depth,
    lifted: false,
  });

  it("strokes one counted chord per domain pair, wider for more dependencies, and none for a chord fully resolved", () => {
    const { ctx, calls } = recordingContext();
    const drawn = drawStrataLodChords(ctx, [chord(1, 1, 0.2), chord(40, 40, 0.6), chord(5, 0, 0.4)], 3, [102, 102, 133], () => 1, 1);
    expect(drawn).toBe(2);
    expect(calls.stroke).toBe(2);
    expect(strataLodChordWidth(40)).toBeGreaterThan(strataLodChordWidth(1));
    expect(strataLodChordWidth(100_000)).toBeLessThanOrEqual(3.5);
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
