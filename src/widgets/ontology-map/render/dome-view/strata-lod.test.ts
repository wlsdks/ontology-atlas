import { describe, expect, it, vi } from "vitest";

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
  const calls = {
    fill: 0,
    stroke: 0,
    arc: 0,
    arcs: [] as { r: number; anticlockwise: boolean }[],
    moves: [] as [number, number][],
    gradients: [] as number[][],
    fillStyles: [] as string[],
    strokeStyles: [] as string[],
  };
  const ctx = {
    globalAlpha: 1,
    lineCap: "butt",
    lineWidth: 1,
    strokeStyle: "" as unknown,
    fillStyle: "" as unknown,
    quadraticCurveTo() {},
    beginPath() {},
    moveTo(x: number, y: number) {
      calls.moves.push([x, y]);
    },
    lineTo() {},
    closePath() {},
    arc(_x: number, _y: number, r: number, _start: number, _end: number, anticlockwise = false) {
      calls.arc += 1;
      calls.arcs.push({ r, anticlockwise });
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
  it("keeps cached marks current across movement, removal, colour changes and empty frames", () => {
    class RecordedPath {
      arcs: number[][] = [];
      moveTo() {}
      arc(...values: number[]) { this.arcs.push(values); }
    }
    vi.stubGlobal("Path2D", RecordedPath);
    try {
      const dust = createStrataLodDust();
      const { ctx } = recordingContext();
      const painted: { path: RecordedPath; style: string }[] = [];
      ctx.fill = ((path: RecordedPath) => painted.push({ path, style: String(ctx.fillStyle) })) as unknown as typeof ctx.fill;
      const draw = (points: number[], colours: Parameters<typeof drawStrataLodDust>[2] = inks) => {
        resetStrataLodDust(dust);
        for (const x of points) addStrataLodDust(dust, "element", "unknown", 0.1, 1, x, 10);
        drawStrataLodDust(ctx, dust, colours, () => 1, 1);
        return painted.at(-1)!;
      };
      const first = draw([10, 20]);
      const unchanged = draw([10, 20]);
      expect(unchanged.path).toBe(first.path);
      const recoloured = draw([10, 20], { ...inks, kindRgb: { ...inks.kindRgb, element: [20, 30, 40] } });
      expect(recoloured.path).toBe(first.path);
      expect(recoloured.style).not.toBe(first.style);
      const moved = draw([10, 30]);
      expect(moved.path.arcs.map(a => a[0])).toEqual([10, 10, 30, 30]);
      const removed = draw([30]);
      expect(removed.path.arcs.map(a => a[0])).toEqual([30, 30]);
      const count = painted.length;
      draw([]);
      expect(painted).toHaveLength(count);
      expect(draw([30]).path).not.toBe(removed.path);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("fills a fixed number of batches however many concepts the dust stands for", () => {
    const fillsFor = (count: number) => {
      const dust = createStrataLodDust();
      resetStrataLodDust(dust);
      let rings = 0;
      for (let i = 0; i < count; i += 1) {
        const plane = i % 3 === 0 ? "capability" : "element";
        const state = i % 7 === 0 ? "stale" : i % 5 === 0 ? "current" : "unknown";
        if (state !== "current") rings += 1;
        addStrataLodDust(dust, plane, state, (i % 100) / 100, 1, i % 1440, i % 900);
      }
      const { ctx, calls } = recordingContext();
      const drawn = drawStrataLodDust(ctx, dust, inks, () => 1, 1);
      return { fills: calls.fill, arcs: calls.arc, rings, drawn };
    };
    const small = fillsFor(1_000);
    const large = fillsFor(10_000);
    expect(large.drawn).toBe(10_000);
    expect(large.arcs).toBe(10_000 + large.rings);
    expect(large.fills).toBe(small.fills);
    expect(large.fills).toBeLessThanOrEqual(2 * 3 * 8);
  });

  it("marks evidence by shape: current a filled dot, stale an amber ring, unknown a ring in its kind colour", () => {
    const marks = {} as Record<string, { arcs: { r: number; anticlockwise: boolean }[]; style: string }>;
    for (const state of ["current", "stale", "unknown"] as const) {
      const dust = createStrataLodDust();
      addStrataLodDust(dust, "element", state, 0.1, 1, 10, 10);
      const { ctx, calls } = recordingContext();
      const byState = { current: 0, stale: 0, unknown: 0 };
      drawStrataLodDust(ctx, dust, inks, () => 1, 1, byState);
      expect(byState[state]).toBe(1);
      marks[state] = { arcs: calls.arcs, style: calls.fillStyles[0] };
    }
    expect(marks.current.arcs).toHaveLength(1);
    expect(marks.current.style.startsWith("rgba(148,182,162,")).toBe(true);
    for (const state of ["stale", "unknown"]) {
      const [outer, inner] = marks[state].arcs;
      expect(marks[state].arcs).toHaveLength(2);
      expect(outer.anticlockwise).toBe(false);
      expect(inner.anticlockwise).toBe(true);
      expect(inner.r).toBeLessThan(outer.r);
      expect(outer.r).toBeGreaterThan(marks.current.arcs[0].r);
    }
    expect(marks.stale.style.startsWith("rgba(220,170,60,")).toBe(true);
    expect(marks.unknown.style.startsWith("rgba(124,166,141,")).toBe(true);
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
      expect(Math.abs(alpha - 0.85 * weight)).toBeLessThanOrEqual(0.85 / 128 + 0.001);
      expect(previous - alpha).toBeLessThanOrEqual(0.85 / 15 + 0.01);
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
  const chord = (count: number, weight: number, depth: number, lift: number): StrataLodChordDraw => ({
    ax: 0,
    ay: 0,
    ar: 8,
    bx: 100,
    by: 0,
    br: 8,
    cx: 50,
    cy: 20,
    count,
    weight,
    depth,
    lift,
  });

  it("draws only the chords of a pointed or focused domain, each tapering to an arrowhead at the domain it depends on", () => {
    const { ctx, calls } = recordingContext();
    const chords = [chord(1, 1, 0.2, 1), chord(40, 40, 0.6, 1), chord(5, 0, 0.4, 1), chord(9, 9, 0.3, 0)];
    const drawn = drawStrataLodChords(ctx, chords, chords.length, [102, 102, 133], () => 1, 1);
    expect(drawn).toBe(2);
    expect(calls.fill).toBe(4);
    expect(calls.stroke).toBe(0);
    const endAngle = Math.atan2(0 - 20, 100 - 50);
    const tip = [100 - 11 * Math.cos(endAngle), 0 - 11 * Math.sin(endAngle)];
    expect(calls.moves.some(([x, y]) => Math.abs(x - tip[0]) < 1e-6 && Math.abs(y - tip[1]) < 1e-6)).toBe(true);
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
