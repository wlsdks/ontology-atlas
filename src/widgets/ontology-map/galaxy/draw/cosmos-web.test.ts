import { describe, expect, it } from "vitest";
import type { CosmosLayout } from "../layout/cosmos-layout";
import type { CosmosInks, GalaxyPose } from "../cosmos-types";
import { drawCosmosWeb } from "./cosmos-web";

const ring = Array.from({ length: 8 }, (_, i) => ({
  id: `d${i}`,
  x: Math.cos((i / 8) * Math.PI * 2) * 300,
  y: Math.sin((i / 8) * Math.PI * 2) * 300,
  radius: 40,
  extent: 30,
}));

const flows: [number, number, number, boolean][] = [
  [0, 1, 9, false],
  [1, 2, 7, true],
  [2, 3, 5, false],
  [3, 4, 4, false],
  [4, 5, 4, false],
  [5, 6, 2, false],
  [6, 7, 1, false],
  [7, 0, 3, false],
];

const layout = {
  galaxies: ring,
  filaments: flows.map(([from, to, count, twoWay]) => ({ from, to, count, twoWay, bow: 0.15 })),
} as unknown as CosmosLayout;

const poses: GalaxyPose[] = ring.map((g) => ({ x: g.x, y: g.y, theta: 0, wispTheta: 0, wispLight: 1, presence: 1, condense: 1 }));

const inks = { filament: "rest", filamentHead: "head", filamentDim: "dim", labelMeta: "meta" } as unknown as CosmosInks;

function fakeContext() {
  const ctx = {
    fillStyle: "",
    globalAlpha: 1,
    alphas: [] as number[],
    beginPath() {},
    moveTo() {},
    lineTo() {},
    quadraticCurveTo() {},
    closePath() {},
    fill() {
      ctx.alphas.push(ctx.globalAlpha);
    },
  };
  return ctx;
}

function draw(overrides: { zoomRatio?: number; hoverGalaxy?: number; focusGalaxy?: number; lensRest?: number } = {}) {
  const ctx = fakeContext();
  const out = drawCosmosWeb(ctx as unknown as CanvasRenderingContext2D, {
    layout,
    poses,
    camera: { x: 0, y: 0, scale: 1 },
    room: { x: 0, y: 0, width: 1000, height: 1000 },
    width: 1000,
    height: 1000,
    zoomRatio: overrides.zoomRatio ?? 1,
    hoverGalaxy: overrides.hoverGalaxy ?? -1,
    focusGalaxy: overrides.focusGalaxy ?? -1,
    inks,
    settled: true,
    lensRest: overrides.lensRest ?? 1,
    metaFont: "11px sans-serif",
  });
  return { ...out, ctx };
}

const touching = (i: number) => (item: { from: string; to: string }) => item.from === `d${i}` || item.to === `d${i}`;

describe("drawCosmosWeb", () => {
  it("fades between zoom ratio 1.4 and 2.2", () => {
    expect(draw({ zoomRatio: 1.4 }).alpha).toBeCloseTo(1, 6);
    expect(draw({ zoomRatio: 1.8 }).alpha).toBeCloseTo(0.5, 6);
    const gone = draw({ zoomRatio: 2.2 });
    expect(gone.alpha).toBe(0);
    expect(gone.items).toHaveLength(0);
  });

  it("multiplies the fade by the lens rest alpha", () => {
    const { alpha, ctx } = draw({ zoomRatio: 1.8, lensRest: 0.4 });
    expect(alpha).toBeCloseTo(0.2, 6);
    expect(ctx.alphas.every((a) => Math.abs(a - 0.2) < 1e-6)).toBe(true);
  });

  it("counts the strands at or above the fifth largest count at rest", () => {
    const { items, candidates } = draw();
    const fifth = [...flows.map((f) => f[2])].sort((a, b) => b - a)[4]!;
    expect(items.filter((i) => i.counted).map((i) => i.count).sort()).toEqual(flows.map((f) => f[2]).filter((c) => c >= fifth).sort());
    expect(items.every((i) => i.tone === "rest")).toBe(true);
    expect(candidates.every((c) => c.priority === 600 + Number(c.text))).toBe(true);
  });

  it("counts exactly the hovered galaxy's strands, lit, and recedes the rest", () => {
    const { items, candidates } = draw({ hoverGalaxy: 6 });
    expect(items.filter((i) => i.counted)).toEqual(items.filter(touching(6)));
    for (const item of items) expect(item.tone).toBe(touching(6)(item) ? "lit" : "receded");
    expect(candidates).toHaveLength(2);
    expect(candidates.every((c) => c.priority === 880)).toBe(true);
  });

  it("lights the focused galaxy's strands without receding the others", () => {
    const { items } = draw({ focusGalaxy: 2 });
    expect(items.filter((i) => i.counted)).toEqual(items.filter(touching(2)));
    for (const item of items) expect(item.tone).toBe(touching(2)(item) ? "lit" : "rest");
  });

  it("reports width from the formula and keeps the two-way flag", () => {
    const { items } = draw();
    for (const item of items) expect(item.width).toBeCloseTo(Math.min(2.4, 0.5 + 0.35 * Math.log2(1 + item.count)), 6);
    expect(items.find((i) => i.from === "d1")?.twoWay).toBe(true);
  });
});
