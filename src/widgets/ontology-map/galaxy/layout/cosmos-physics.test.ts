import { describe, expect, it } from "vitest";
import { relaxGalaxies, settleGalaxies, voidGap } from "./cosmos-physics";

const bodies = [
  { id: "a", radius: 40 },
  { id: "b", radius: 40 },
  { id: "c", radius: 40 },
  { id: "d", radius: 30 },
];

describe("cosmos physics", () => {
  it("settles the same bodies to the same places", () => {
    const one = settleGalaxies(bodies, [{ a: 0, b: 1, weight: 1 }], { coreRadius: 50 });
    const two = settleGalaxies(bodies, [{ a: 0, b: 1, weight: 1 }], { coreRadius: 50 });
    expect([...one.x]).toEqual([...two.x]);
    expect([...one.y]).toEqual([...two.y]);
  });

  it("holds pinned bodies still and moves only the two pinned bodies that overlap", () => {
    const x = Float64Array.from([300, 330, -300, 0]);
    const y = Float64Array.from([0, 0, 0, 300]);
    const fixed = Uint8Array.from([1, 1, 1, 0]);
    const out = relaxGalaxies(x, y, bodies, [], { coreRadius: 50, fixed });
    const mean = bodies.reduce((s, b) => s + b.radius, 0) / bodies.length;
    expect(out.x[2]).toBe(-300);
    expect(out.y[2]).toBe(0);
    expect(Math.hypot(out.x[0]! - out.x[1]!, out.y[0]! - out.y[1]!)).toBeGreaterThanOrEqual(80 + voidGap(40, 40, mean) * 0.82 - 1e-6);
    expect(out.x[0]).not.toBe(300);
    expect(out.x[1]).not.toBe(330);
  });

  it("does not move pinned bodies that only miss the void because the mean radius changed", () => {
    const mean = bodies.reduce((s, b) => s + b.radius, 0) / bodies.length;
    const gap = 80 + voidGap(40, 40, mean) * 0.82 - 1;
    const x = Float64Array.from([300, 300 + gap, -300, 0]);
    const y = Float64Array.from([0, 0, 0, 300]);
    const out = relaxGalaxies(x, y, bodies, [], { coreRadius: 50, fixed: Uint8Array.from([1, 1, 1, 0]) });
    expect([out.x[0], out.x[1], out.x[2]]).toEqual([300, 300 + gap, -300]);
  });
});
