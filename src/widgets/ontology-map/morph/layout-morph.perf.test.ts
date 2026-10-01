import { describe, expect, it } from "vitest";

import type { MapLayoutMark } from "@/shared/lib/map-layout-morph-store";
import { planLayoutMorph, sampleLayoutMorph } from "./layout-morph";

const FRAMES = 30;
const LINEAR_RATIO_CEILING = 15;

function views(n: number) {
  const parents = new Map<string, string>();
  const source: MapLayoutMark[] = [];
  const target: MapLayoutMark[] = [];
  const domains = Math.max(1, Math.round(Math.sqrt(n) / 3));
  for (let i = 0; i < n; i += 1) {
    const id = i < domains ? `domain:${i}` : `concept:${i}`;
    if (i >= domains) parents.set(id, `domain:${i % domains}`);
    const style = { size: 5, shape: "disc" as const, fill: "#445566", stroke: "#778899", alpha: 1 };
    if (i < domains || i % 3 !== 0) source.push({ id, x: (i * 37) % 1400, y: (i * 53) % 860, ...style });
    if (i < domains || i % 5 !== 0) target.push({ id, x: (i * 71) % 1400, y: (i * 29) % 860, ...style, shape: "hex" });
  }
  return { parents, source, target };
}

function fastestMs(n: number): number {
  const { parents, source, target } = views(n);
  let fastest = Number.POSITIVE_INFINITY;
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const started = performance.now();
    const plan = planLayoutMorph(source, target, parents);
    for (let frame = 1; frame <= FRAMES; frame += 1) sampleLayoutMorph(plan, frame / FRAMES);
    fastest = Math.min(fastest, performance.now() - started);
  }
  return fastest;
}

describe("the layout morph plan scales linearly with the concepts it carries", () => {
  it("plans and samples 2,000 concepts within fifteen times the cost of 200", () => {
    fastestMs(200);
    const small = fastestMs(200);
    const large = fastestMs(2000);
    const ratio = large / small;
    expect(ratio, `200: ${small.toFixed(2)} ms, 2000: ${large.toFixed(2)} ms, ratio ${ratio.toFixed(1)}`).toBeLessThanOrEqual(LINEAR_RATIO_CEILING);
  });
});
