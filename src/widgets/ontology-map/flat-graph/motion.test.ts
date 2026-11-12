import { describe, expect, it } from "vitest";

import type { GraphAttention, GraphLine } from "./attention";
import { FLAT_MOTION, GraphMotion, waveDelays } from "./motion";

const SINK = 0.14;
const REST = 0.66;

const line = (from: string, to: string): GraphLine => ({ from, to, kind: "needs", key: `needs:${from}>${to}`, weight: 1 });
const rest: GraphAttention = { key: "rest", focusId: null, selected: false, lit: null, lines: [], reach: null, named: new Set() };

function attention(focusId: string, lit: string[], lines: GraphLine[], selected = false): GraphAttention {
  return { key: `${focusId}|${selected ? 1 : 0}`, focusId, selected, lit: new Set(lit), lines, reach: null, named: new Set([focusId]) };
}

const POSITIONS: Record<string, { x: number; y: number }> = { a: { x: 0, y: 0 }, near: { x: 10, y: 0 }, far: { x: 100, y: 0 }, b: { x: 200, y: 0 }, other: { x: 300, y: 0 } };
const delaysOf = (a: GraphAttention) => waveDelays(a, (id) => POSITIONS[id], FLAT_MOTION.waveMs);

const hoverA = attention("a", ["a", "near", "far"], [line("a", "near"), line("a", "far")]);
const selectA = attention("a", ["a", "near", "far"], [line("a", "near"), line("a", "far")], true);
const selectB = attention("b", ["b", "far"], [line("b", "far")], true);

/** A motion that has drawn every concept once at rest, as a frame would. */
function motionAtRest(): GraphMotion {
  const motion = new GraphMotion(rest);
  motion.advance(rest, 0, false, delaysOf);
  for (const id of Object.keys(POSITIONS)) motion.see(id);
  return motion;
}

const reachOf = (motion: GraphMotion, key: string) => {
  for (let i = 0; i < motion.drawnCount; i += 1) if (motion.drawn[i]!.line.key === key) return motion.drawn[i]!.reach;
  return 0;
};

/** Steps a fake clock from `from` to `to` in frame-sized ticks, calling `each` after every tick. */
function run(motion: GraphMotion, a: GraphAttention, from: number, to: number, each: (now: number) => void = () => {}): void {
  for (let now = from; now <= to; now += 8) {
    motion.advance(a, now, false, delaysOf);
    each(now);
  }
}

describe("Flat attention motion", () => {
  it("lights the pointed concept first, then the reach in order of distance", () => {
    const motion = motionAtRest();
    const litAt: Record<string, number> = {};
    run(motion, hoverA, 1_000, 2_000, (now) => {
      for (const id of ["a", "near", "far"]) if (litAt[id] === undefined && motion.ink(id, SINK, REST) > REST + 0.05) litAt[id] = now;
    });
    expect(litAt.a).toBeLessThan(litAt.near!);
    expect(litAt.near).toBeLessThan(litAt.far!);
  });

  it("draws each lit line from its source end, never in whole", () => {
    const motion = motionAtRest();
    const reaches: number[] = [];
    run(motion, selectA, 1_000, 1_000 + FLAT_MOTION.waveMs + FLAT_MOTION.drawMs, () => reaches.push(reachOf(motion, "needs:a>far")));
    const partial = reaches.filter((r) => r > 0.05 && r < 0.95);
    expect(partial.length, "the line passes through partial reaches").toBeGreaterThan(3);
    expect(reaches.every((r, i) => i === 0 || r >= reaches[i - 1]!)).toBe(true);
  });

  it("starts nothing for a hover shorter than the intent window", () => {
    const motion = motionAtRest();
    const inks: number[] = [];
    run(motion, hoverA, 1_000, 1_000 + FLAT_MOTION.hoverIntentMs - 8, () => inks.push(motion.ink("a", SINK, REST), motion.ink("other", SINK, REST)));
    run(motion, rest, 1_000 + FLAT_MOTION.hoverIntentMs, 2_000, () => inks.push(motion.ink("a", SINK, REST), motion.ink("other", SINK, REST)));
    expect(inks.every((ink) => ink === REST)).toBe(true);
    expect(motion.drawnCount).toBe(0);
  });

  it("retargets from one selection to another without passing through the rest picture", () => {
    const motion = motionAtRest();
    run(motion, selectA, 1_000, 2_000);
    const lowest: Record<string, number> = { far: 1, a: 1 };
    run(motion, selectB, 2_000, 3_000, () => {
      lowest.far = Math.min(lowest.far!, motion.ink("far", SINK, REST));
      lowest.a = Math.min(lowest.a!, motion.ink("a", SINK, REST));
    });
    expect(lowest.far, "a concept lit by both stays lit").toBe(1);
    expect(lowest.a, "the old focus sinks straight to the sunk ink").toBeCloseTo(SINK, 6);
  });

  it("retracts the old target's lines toward their source while the new ones draw", () => {
    const motion = motionAtRest();
    run(motion, selectA, 1_000, 2_000);
    let overlapped = false;
    const old: number[] = [];
    run(motion, selectB, 2_000, 2_400, () => {
      const was = reachOf(motion, "needs:a>near");
      old.push(was);
      if (was > 0 && reachOf(motion, "needs:b>far") > 0) overlapped = true;
    });
    expect(overlapped).toBe(true);
    expect(old.every((r, i) => i === 0 || r <= old[i - 1]!)).toBe(true);
    expect(old.at(-1)).toBe(0);
  });

  it("keeps every drawn line one span from its source end, never longer than its source is lit", () => {
    const neededBy = (from: string, to: string): GraphLine => ({ from, to, kind: "neededBy", key: `neededBy:${from}>${to}`, weight: 1 });
    const fromA = attention("a", ["a", "near", "far"], [line("a", "near"), neededBy("far", "a")], true);
    const fromB = attention("b", ["b", "far", "other"], [line("b", "far"), neededBy("other", "b")], true);
    const motion = motionAtRest();
    const previous = new Map<string, number>();
    const check = (now: number) => {
      for (let i = 0; i < motion.drawnCount; i += 1) {
        const { line: drawn, reach, current } = motion.drawn[i]!;
        expect(reach, `${drawn.key} at ${now}`).toBeGreaterThan(0);
        expect(reach, `${drawn.key} at ${now}`).toBeLessThanOrEqual(1);
        expect(motion.litShare(drawn.from), `${drawn.key}'s source at ${now}`).toBeGreaterThanOrEqual(reach - 1e-9);
        const was = previous.get(`${current}|${drawn.key}`);
        if (was !== undefined) expect(current ? reach >= was : reach <= was, `${drawn.key} at ${now}`).toBe(true);
        previous.set(`${current}|${drawn.key}`, reach);
      }
    };
    for (let now = 1_000; now <= 2_000; now += 1) {
      motion.advance(fromA, now, false, delaysOf);
      check(now);
    }
    previous.clear();
    for (let now = 2_000; now <= 3_000; now += 1) {
      motion.advance(fromB, now, false, delaysOf);
      check(now);
    }
  });

  it("leaves faster than it arrives", () => {
    const motion = motionAtRest();
    let enteredAt = Number.NaN;
    run(motion, selectA, 1_000, 2_000, (now) => {
      if (Number.isNaN(enteredAt) && motion.settled) enteredAt = now;
    });
    let leftAt = Number.NaN;
    run(motion, rest, 3_000, 4_000, (now) => {
      if (Number.isNaN(leftAt) && motion.settled) leftAt = now;
    });
    expect(leftAt - 3_000).toBeLessThan(enteredAt - 1_000);
  });

  it("lands every state at once under reduced motion", () => {
    const motion = motionAtRest();
    motion.advance(selectA, 1_000, true, delaysOf);
    expect(motion.settled).toBe(true);
    expect(motion.ink("far", SINK, REST)).toBe(1);
    expect(motion.ink("other", SINK, REST)).toBe(SINK);
    expect(reachOf(motion, "needs:a>far")).toBe(1);
    motion.advance(rest, 1_001, true, delaysOf);
    expect(motion.ink("other", SINK, REST)).toBe(REST);
    expect(motion.drawnCount).toBe(0);
  });

  it("reaches rest and reports idle after every motion", () => {
    const motion = motionAtRest();
    const sequence: [GraphAttention, number][] = [[hoverA, 1_000], [selectA, 1_040], [selectB, 1_100], [rest, 1_150]];
    for (const [a, at] of sequence) motion.advance(a, at, false, delaysOf);
    expect(motion.active).toBe(true);
    let idleAt = Number.NaN;
    run(motion, rest, 1_150, 3_000, (now) => {
      if (Number.isNaN(idleAt) && !motion.active) idleAt = now;
    });
    expect(idleAt).toBeLessThan(1_150 + FLAT_MOTION.exitMs + 16);
    expect(motion.drawnCount).toBe(0);
    for (const id of Object.keys(POSITIONS)) expect(motion.ink(id, SINK, REST), id).toBe(REST);
  });
});
