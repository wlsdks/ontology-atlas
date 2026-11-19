import { describe, expect, it } from "vitest";

import { BandMotion } from "./band-motion";

const FRAME = 1 / 60;

function run(motion: BandMotion, frames: number): number[][] {
  const drawn: number[][] = [];
  for (let i = 0; i < frames; i += 1) {
    motion.advance(FRAME);
    drawn.push([...motion.positions]);
  }
  return drawn;
}

describe("BandMotion", () => {
  it("counts up from zero to the first targets and rests there", () => {
    const motion = new BandMotion(2);
    motion.set([0.4, 12], "intro");
    const drawn = run(motion, 40);
    expect(drawn[0]![0]).toBeGreaterThan(0);
    expect(drawn[0]![0]).toBeLessThan(0.4);
    expect(drawn.at(-1)).toEqual([0.4, 12]);
    expect(motion.advance(FRAME)).toBe(false);
  });

  it("bends a running motion toward a new target from the drawn value and speed, never from zero", () => {
    const motion = new BandMotion(1);
    motion.set([0.2], "instant");
    motion.set([0.5], "follow");
    const before = run(motion, 6);
    const speed = before[5]![0]! - before[4]![0]!;
    motion.set([0.6], "follow");
    const after = run(motion, 1);
    const step = after[0]![0]! - before[5]![0]!;
    // The next frame continues in the same direction at nearly the same speed: no jump, no restart.
    expect(step).toBeGreaterThan(0);
    expect(Math.abs(step - speed)).toBeLessThan(speed * 0.5);
  });

  it("hands an intro interrupted by a new target to the spring at the intro's speed", () => {
    const motion = new BandMotion(1);
    motion.set([0.5], "intro");
    const before = run(motion, 12);
    const speed = before[11]![0]! - before[10]![0]!;
    motion.set([0.7], "follow");
    const step = run(motion, 1)[0]![0]! - before[11]![0]!;
    expect(Math.abs(step - speed)).toBeLessThan(speed * 0.5);
  });

  it("moves no further on a late frame than on a normal one", () => {
    const late = new BandMotion(1);
    const normal = new BandMotion(1);
    late.set([1], "follow");
    normal.set([1], "follow");
    late.advance(0.25);
    normal.advance(FRAME);
    expect(late.positions[0]).toBeCloseTo(normal.positions[0]!, 10);
  });

  it("leaves a running intro alone when the same targets arrive again", () => {
    const motion = new BandMotion(1);
    motion.set([0.5], "intro");
    run(motion, 3);
    motion.set([0.5], "follow");
    const drawn = run(motion, 40);
    expect(drawn.every((value, i) => i === 0 || value[0]! >= drawn[i - 1]![0]!)).toBe(true);
    expect(drawn.at(-1)).toEqual([0.5]);
  });
});
