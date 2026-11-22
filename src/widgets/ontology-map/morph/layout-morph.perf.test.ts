import { describe, expect, it } from "vitest";

import type { MapLayoutMark } from "@/shared/lib/map-canvas/map-layout-morph-store";
import { startWorkClock } from "../../../../tests/helpers/work-clock";
import { planLayoutMorph, sampleLayoutMorph, sampleLayoutMorphFrame } from "./layout-morph";

const FRAMES = 30;

/** Reads of a mark's fields and of the parent map, the work a plan repeats if it rescans either. */
const reads = { count: 0 };

function counted(mark: MapLayoutMark): MapLayoutMark {
  return new Proxy(mark, {
    get(target, key, receiver) {
      reads.count += 1;
      return Reflect.get(target, key, receiver);
    },
  });
}

class CountedMap<K, V> extends Map<K, V> {
  override get(key: K): V | undefined {
    reads.count += 1;
    return super.get(key);
  }
}

function views(n: number) {
  const parents = new CountedMap<string, string>();
  const source: MapLayoutMark[] = [];
  const target: MapLayoutMark[] = [];
  const domains = Math.max(1, Math.round(Math.sqrt(n) / 3));
  for (let i = 0; i < n; i += 1) {
    const id = i < domains ? `domain:${i}` : `concept:${i}`;
    if (i >= domains) parents.set(id, `domain:${i % domains}`);
    const style = { size: 5, shape: "disc" as const, fill: "#445566", stroke: "#778899", alpha: 1 };
    if (i < domains || i % 3 !== 0) source.push(counted({ id, x: (i * 37) % 1400, y: (i * 53) % 860, ...style }));
    if (i < domains || i % 5 !== 0) target.push(counted({ id, x: (i * 71) % 1400, y: (i * 29) % 860, ...style, shape: "hex" }));
  }
  return { parents, source, target };
}

function readsToPlanAndSample(n: number): number {
  const { parents, source, target } = views(n);
  reads.count = 0;
  const plan = planLayoutMorph(source, target, parents);
  for (let frame = 1; frame <= FRAMES; frame += 1) sampleLayoutMorph(plan, (frame * 950) / FRAMES);
  return reads.count;
}

describe("the layout morph plan scales linearly with the concepts it carries", () => {
  it("reads each mark and parent a bounded number of times, so ten times the concepts cost at most eleven times the reads", () => {
    const small = readsToPlanAndSample(200);
    const large = readsToPlanAndSample(2000);
    // Measured 2026-11-23: 4,877 reads at 200 concepts, 48,592 at 2,000; rescanning the kept marks per mark read 4.4 million.
    expect(large, `200: ${small} reads, 2000: ${large} reads`).toBeLessThanOrEqual(11 * small);
  });

  /** The falsifier of the glide decision: planning 10,000 concepts over 30 ms, or sampling them over 2 ms. */
  it("plans 10,000 concepts within 30 ms and samples a frame of them within 2 ms", () => {
    const { parents, source, target } = views(10_000);
    const median = (values: number[]) => values.sort((a, b) => a - b)[Math.floor(values.length / 2)]!;
    const planned: number[] = [];
    let plan = planLayoutMorph(source, target, parents);
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const spent = startWorkClock();
      plan = planLayoutMorph(source, target, parents);
      planned.push(spent());
    }
    const sampled: number[] = [];
    for (let frame = 1; frame <= FRAMES; frame += 1) {
      const spent = startWorkClock();
      sampleLayoutMorphFrame(plan, (frame * 950) / FRAMES);
      sampled.push(spent());
    }
    const [plan10k, sample10k] = [median(planned), median(sampled)];
    expect(plan10k, `plan 10k: ${plan10k.toFixed(2)} ms`).toBeLessThanOrEqual(30);
    expect(sample10k, `sample 10k: ${sample10k.toFixed(2)} ms`).toBeLessThanOrEqual(2);
  });
});
