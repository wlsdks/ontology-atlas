import { describe, expect, it, vi } from "vitest";

import type { LightLayer } from "./light-layer";
import { installLightProbe, type LightProbe } from "./light-probe";
import type { LightHead } from "./light-sources";

type Frame = Parameters<LightProbe["afterFrame"]>[0];
type Sample = { key: string; ambiguous: boolean; offsetPx: number; lineContrast: number; lightPeak: number; headInk: number; aheadInk: number };

function pixels(left: number, top: number, width: number, height: number, lit: (x: number, y: number) => boolean) {
  const data = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y += 1) for (let x = 0; x < width; x += 1) {
    const at = (y * width + x) * 4;
    if (lit(left + x, top + y)) data.fill(255, at, at + 4);
  }
  return data;
}

function sampleCrossing(tailStart: number, reverse = false): Sample[] {
  const primary: LightHead = {
    source: "focus", key: "a\0b", t: 0.6, x: 116, y: 50, arrived: false, revealBound: false,
    departAt: 0, arriveAt: 1, tailStart: 0.25, drawnEnd: 0.6, curve: [20, 50, 100, 50, 180, 50],
  };
  const other: LightHead = {
    source: "focus", key: reverse ? "b\0a" : "crossing", t: 0.8, x: reverse ? 52 : 128, y: reverse ? 50 : 128,
    arrived: false, revealBound: false, departAt: 0, arriveAt: 1, tailStart, drawnEnd: 0.8,
    curve: reverse ? [180, 50, 100, 50, 20, 50] : [128, 0, 128, 80, 128, 160],
  };
  const heads = [primary, other];
  const canvas = document.createElement("canvas");
  canvas.width = 200;
  canvas.height = 200;
  vi.spyOn(canvas, "getBoundingClientRect").mockReturnValue({ width: 200, height: 200 } as DOMRect);
  vi.spyOn(canvas, "getContext").mockReturnValue({
    getImageData: (left: number, top: number, width: number, height: number) => ({ data: pixels(left, top, width, height, (_, y) => y === 50) }),
  } as unknown as CanvasRenderingContext2D);
  const layer = { read: (left: number, top: number, width: number, height: number) => pixels(left, top, width, height,
    (x, y) => (y === 50 && x >= 60 && x <= 116) || (reverse
      ? y === 50 && x >= 52 && x <= 180 - 160 * tailStart
      : x === 128 && y >= 160 * tailStart && y <= 128)) } as LightLayer;
  const probe = installLightProbe({ state: () => "ready", active: () => true, plans: () => [], heads: () => heads });
  const hook = (window as unknown as { __atlasMapLight: { record(on: boolean, options: { glue: boolean }): void; records(): { glue: Sample[] }[] } }).__atlasMapLight;
  hook.record(true, { glue: true });
  const frame: Frame = {
    now: 1, lightMs: 0, prepareMs: 0, renderMs: 0, focus: "a", reveal: 1, standDowns: 0,
    drew: true, camera: { x: 0, y: 0, scale: 1 }, width: 200, height: 200, pathOpen: false, heads, blooms: [],
  };
  probe.afterFrame(frame, layer, canvas);
  const samples = hook.records().flatMap(record => record.glue).filter(sample => sample.key === primary.key);
  probe.dispose();
  return samples;
}

describe("light glue sampling at crossings", () => {
  it("keeps ahead and offset assertions eligible after a crossing tail has passed", () => {
    const samples = sampleCrossing(0.7);
    expect(samples).toHaveLength(1);
    expect(samples[0]).toMatchObject({ ambiguous: false, offsetPx: 0, lightPeak: 255, headInk: 255, aheadInk: 0 });
    expect(samples[0]!.lineContrast).toBeCloseTo(255);
  });

  it("marks an ahead pixel crossed by an emitted tail as ambiguous", () => {
    const samples = sampleCrossing(0.2);
    expect(samples).toHaveLength(1);
    expect(samples[0]).toMatchObject({ ambiguous: true, aheadInk: 255 });
  });

  it("keeps a reverse-pair sample after the opposing tail has passed its slices", () => {
    const samples = sampleCrossing(0.7, true);
    expect(samples).toHaveLength(1);
    expect(samples[0]).toMatchObject({ ambiguous: false, offsetPx: 0, aheadInk: 0 });
  });

  it("excludes a reverse-pair sample whose slices overlap the opposing emitted tail", () => {
    expect(sampleCrossing(0.2, true)).toHaveLength(0);
  });
});
