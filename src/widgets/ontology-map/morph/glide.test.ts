import { describe, expect, it } from "vitest";

import { conceptDegrees, glideVelocity, planGlide, sampleGlide, type GlideOptions, type GlideTracks } from "./glide";

interface Point {
  id: string;
  from: [number, number];
  to: [number, number];
}

function tracksOf(points: readonly Point[]): GlideTracks {
  return {
    ids: points.map((p) => p.id),
    x0: Float64Array.from(points.map((p) => p.from[0])),
    y0: Float64Array.from(points.map((p) => p.from[1])),
    x1: Float64Array.from(points.map((p) => p.to[0])),
    y1: Float64Array.from(points.map((p) => p.to[1])),
  };
}

function trace(points: readonly Point[], options: GlideOptions, untilMs = 1200) {
  const tracks = tracksOf(points);
  const glide = planGlide(tracks, options);
  const frames = [];
  for (let ms = 0; ms <= untilMs; ms += 1) {
    const f = sampleGlide(glide, tracks, ms);
    frames.push({ ms, x: Array.from(f.x), y: Array.from(f.y) });
  }
  return { tracks, glide, frames, index: (id: string) => tracks.ids.indexOf(id) };
}

const parents = new Map([
  ["domain:a", "project:p"],
  ["capability:a1", "domain:a"],
  ["capability:a2", "domain:a"],
  ["element:a1x", "capability:a1"],
]);

describe("planGlide", () => {
  it("carries a child whose offset is unchanged with its parent", () => {
    const run = trace(
      [
        { id: "domain:a", from: [0, 0], to: [600, 200] },
        { id: "capability:a1", from: [40, 10], to: [640, 210] },
      ],
      { parentOf: parents, anchorId: "domain:a" },
    );
    const [d, c] = [run.index("domain:a"), run.index("capability:a1")];
    for (const frame of run.frames) {
      expect(Math.hypot(frame.x[c]! - frame.x[d]! - 40, frame.y[c]! - frame.y[d]! - 10)).toBeLessThanOrEqual(0.5);
    }
  });

  it("keeps the radius linear and never crosses the parent in a wide turn", () => {
    const run = trace(
      [
        { id: "domain:a", from: [0, 0], to: [0, 0] },
        { id: "capability:a1", from: [100, 0], to: [-120, 10] },
      ],
      { parentOf: parents, anchorId: "domain:a" },
    );
    const c = run.index("capability:a1");
    const r0 = 100;
    const r1 = Math.hypot(120, 10);
    const p = (ms: number) => {
      const t = ms / 1000;
      const w = Math.sqrt(140);
      const wd = w * Math.sqrt(1 - 0.85 ** 2);
      return 1 - Math.exp(-0.85 * w * t) * (Math.cos(wd * t) + ((0.85 * w) / wd) * Math.sin(wd * t));
    };
    for (const frame of run.frames) {
      const r = Math.hypot(frame.x[c]!, frame.y[c]!);
      const expected = r0 + (r1 - r0) * p(Math.max(0, frame.ms - 35));
      expect(Math.abs(r - expected) / expected).toBeLessThanOrEqual(0.01);
      expect(r).toBeGreaterThanOrEqual(0.5 * Math.min(r0, r1));
    }
  });

  it("turns siblings in a wide turn with the median sense", () => {
    const tracks = tracksOf([
      { id: "domain:a", from: [0, 0], to: [0, 0] },
      { id: "capability:a1", from: [100, 0], to: [-100, -10] },
      { id: "capability:a2", from: [0, 100], to: [-90, 0] },
    ]);
    const glide = planGlide(tracks, { parentOf: parents, anchorId: "domain:a" });
    const a1 = glide.turn[tracks.ids.indexOf("capability:a1")]!;
    const a2 = glide.turn[tracks.ids.indexOf("capability:a2")]!;
    expect(Math.sign(a2)).toBe(1);
    expect(Math.sign(a1)).toBe(Math.sign(a2));
    expect(Math.abs(a1)).toBeGreaterThan(Math.PI);
  });

  it("starts each concept's own motion after its containment distance in 35 ms steps, capped at three", () => {
    const tracks = tracksOf([
      { id: "project:p", from: [0, 0], to: [0, 0] },
      { id: "domain:a", from: [100, 0], to: [0, 100] },
      { id: "capability:a1", from: [140, 0], to: [0, 160] },
      { id: "element:a1x", from: [170, 0], to: [0, 200] },
    ]);
    const glide = planGlide(tracks, { parentOf: parents, anchorId: "element:a1x" });
    expect(Array.from(glide.delayMs)).toEqual([105, 70, 35, 0]);
    const rooted = planGlide(tracks, { parentOf: parents, anchorId: null });
    expect(Array.from(rooted.delayMs)).toEqual([0, 35, 70, 105]);
    const d = tracks.ids.indexOf("domain:a");
    const offsetAt = (ms: number) => {
      const f = sampleGlide(rooted, tracks, ms);
      return Math.hypot(f.x[d]! - f.x[0]! - 100, f.y[d]! - f.y[0]!);
    };
    expect(offsetAt(34)).toBe(0);
    expect(offsetAt(36)).toBeGreaterThan(0);
  });

  it("slows a heavy concept by the square root of its mass with the same overshoot", () => {
    const t90 = (mass: number) => {
      const tracks = tracksOf([{ id: "domain:a", from: [0, 0], to: [1000, 0] }]);
      const glide = planGlide(tracks, { parentOf: parents, massOf: () => mass - 1 });
      let crossed = -1;
      let peak = 0;
      for (let ms = 0; ms <= 2000; ms += 0.25) {
        const x = sampleGlide(glide, tracks, ms).x[0]!;
        if (crossed < 0 && x >= 900) crossed = ms;
        peak = Math.max(peak, x);
      }
      return { crossed, overshoot: (peak - 1000) / 1000 };
    };
    const light = t90(1);
    const heavy = t90(2);
    expect(Math.abs(heavy.crossed / light.crossed - Math.SQRT2) / Math.SQRT2).toBeLessThanOrEqual(0.05);
    expect(light.overshoot).toBeLessThanOrEqual(0.007);
    expect(heavy.overshoot).toBeLessThanOrEqual(0.007);
    expect(planGlide(tracksOf([{ id: "x", from: [0, 0], to: [1, 0] }]), { parentOf: parents, massOf: () => 9 }).omega[0]).toBeCloseTo(Math.sqrt(70), 9);
  });

  it("keeps position and velocity through a reversal", () => {
    const outbound = tracksOf([
      { id: "domain:a", from: [0, 0], to: [500, 0] },
      { id: "capability:a1", from: [40, 0], to: [500, 80] },
    ]);
    const first = planGlide(outbound, { parentOf: parents, anchorId: "domain:a" });
    const at = 140;
    const here = sampleGlide(first, outbound, at);
    const velocity = glideVelocity(first, outbound, at);
    const back = tracksOf([
      { id: "domain:a", from: [here.x[0]!, here.y[0]!], to: [0, 0] },
      { id: "capability:a1", from: [here.x[1]!, here.y[1]!], to: [40, 0] },
    ]);
    const second = planGlide(back, { parentOf: parents, anchorId: "domain:a", carried: velocity });
    const start = sampleGlide(second, back, 0);
    const carriedOn = glideVelocity(second, back, 2);
    for (const [i, id] of back.ids.entries()) {
      expect(Math.hypot(start.x[i]! - here.x[i]!, start.y[i]! - here.y[i]!)).toBeLessThanOrEqual(0.5);
      const before = velocity.get(id)!;
      const after = carriedOn.get(id)!;
      expect(Math.hypot(after.vx - before.vx, after.vy - before.vy) / Math.hypot(before.vx, before.vy)).toBeLessThanOrEqual(0.1);
    }
  });

  it("guards against non-finite input", () => {
    const tracks = tracksOf([{ id: "domain:a", from: [0, 0], to: [10, 0] }]);
    const glide = planGlide(tracks, {
      parentOf: parents,
      massOf: () => Number.NaN,
      carried: new Map([["domain:a", { vx: Number.NaN, vy: Number.POSITIVE_INFINITY }]]),
    });
    const frame = sampleGlide(glide, tracks, Number.NaN);
    expect([frame.x[0], frame.y[0]]).toEqual([0, 0]);
    expect(Number.isFinite(sampleGlide(glide, tracks, 300).x[0])).toBe(true);
  });

  it("re-roots components without the anchor one step behind it", () => {
    const tracks = tracksOf([
      { id: "domain:a", from: [0, 0], to: [10, 0] },
      { id: "domain:loose", from: [0, 0], to: [10, 0] },
    ]);
    const glide = planGlide(tracks, { parentOf: new Map(), anchorId: "domain:a" });
    expect(Array.from(glide.delayMs)).toEqual([0, 35]);
  });
});

describe("conceptDegrees", () => {
  it("counts each relation at both ends", () => {
    const degree = conceptDegrees([
      { source: "a", target: "b" },
      { source: "a", target: "c" },
    ]);
    expect([degree.get("a"), degree.get("b"), degree.get("c")]).toEqual([2, 1, 1]);
  });
});
