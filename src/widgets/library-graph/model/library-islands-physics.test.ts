import { describe, expect, it } from "vitest";

import { createIslandField, isIslandFieldMoving, pinIsland, releaseIsland, settleIslandField, stepIslandField } from "./library-islands-physics";

const ISLANDS = [
  { id: "a", x: 300, y: 200, r: 60 },
  { id: "b", x: 450, y: 200, r: 40 },
  { id: "c", x: 300, y: 340, r: 30 },
  { id: "d", x: 180, y: 220, r: 25 },
];
const CENTRE = { x: 300, y: 200 };

describe("island physics", () => {
  it("arrives from near the centre and settles on the layout's own places, in a bounded number of steps", () => {
    const field = createIslandField(ISLANDS, CENTRE, { arriving: true });
    expect(isIslandFieldMoving(field)).toBe(true);
    const b = field.bodies[1];
    expect(Math.hypot(b.x - CENTRE.x, b.y - CENTRE.y)).toBeLessThan(Math.hypot(450 - CENTRE.x, 200 - CENTRE.y));
    let steps = 0;
    while (stepIslandField(field) && steps < 600) steps += 1;
    expect(steps).toBeLessThan(120);
    for (const body of field.bodies) expect(Math.hypot(body.x - body.home.x, body.y - body.home.y)).toBeLessThan(0.5);
    expect(isIslandFieldMoving(field)).toBe(false);
  });

  it("is the same journey every time: no randomness anywhere", () => {
    const one = createIslandField(ISLANDS, CENTRE, { arriving: true });
    const two = createIslandField(ISLANDS, CENTRE, { arriving: true });
    for (let i = 0; i < 20; i += 1) {
      stepIslandField(one);
      stepIslandField(two);
    }
    expect(one.bodies.map((body) => [body.x, body.y])).toEqual(two.bodies.map((body) => [body.x, body.y]));
  });

  it("is still at rest: a field created in place reports no motion and a step moves nothing", () => {
    const field = createIslandField(ISLANDS, CENTRE, { arriving: false });
    expect(isIslandFieldMoving(field)).toBe(false);
    const before = field.bodies.map((body) => [body.x, body.y]);
    expect(stepIslandField(field)).toBe(false);
    expect(field.bodies.map((body) => [body.x, body.y])).toEqual(before);
  });

  it("a held island shoves the one it is dragged into, which returns home once released", () => {
    const field = createIslandField(ISLANDS, CENTRE, { arriving: false });
    // Drag `a` onto `b`'s place.
    pinIsland(field, "a", { x: 450, y: 200 });
    for (let i = 0; i < 40; i += 1) stepIslandField(field);
    const b = field.bodies[1];
    const a = field.bodies[0];
    expect(Math.hypot(b.x - a.x, b.y - a.y)).toBeGreaterThanOrEqual(a.r + b.r + 10 - 1);
    expect(Math.hypot(b.x - 450, b.y - 200)).toBeGreaterThan(20);
    releaseIsland(field, "a");
    expect(a.home).toEqual({ x: 450, y: 200 });
    settleIslandField(field);
    // `b` cannot reach its old home while `a` stands on it, so it rests beside `a`.
    expect(Math.hypot(b.x - a.x, b.y - a.y)).toBeGreaterThanOrEqual(a.r + b.r + 10 - 1);
    expect(isIslandFieldMoving(field)).toBe(false);
  });

  it("settles synchronously for reduced motion", () => {
    const field = createIslandField(ISLANDS, CENTRE, { arriving: true });
    settleIslandField(field);
    expect(isIslandFieldMoving(field)).toBe(false);
    for (const body of field.bodies) expect(Math.hypot(body.x - body.home.x, body.y - body.home.y)).toBeLessThan(0.5);
  });

  /** A fitted map: a grid of islands whose homes stand closer than the 10-unit gap. */
  function tightField(columns: number, rows: number, gap: number) {
    const r = 6;
    const islands = Array.from({ length: columns * rows }, (_, i) => ({
      id: `i${i}`,
      x: (i % columns) * (2 * r + gap),
      y: Math.floor(i / columns) * (2 * r + gap),
      r,
    }));
    return createIslandField(islands, { x: ((columns - 1) * (2 * r + gap)) / 2, y: ((rows - 1) * (2 * r + gap)) / 2 }, { arriving: true });
  }

  it("rests on its homes when the fitted map stands tighter than its usual gap", () => {
    const field = tightField(40, 25, 3);
    expect(field.gap).toBeCloseTo(3, 6);
    let steps = 0;
    while (stepIslandField(field, Infinity) && steps < 600) steps += 1;
    expect(steps).toBeLessThan(120);
    for (const body of field.bodies) expect(Math.hypot(body.x - body.home.x, body.y - body.home.y)).toBe(0);
  });

  it("still comes to rest when every step runs out of its time, each picking up where the last stopped", () => {
    const field = tightField(40, 25, 3);
    let steps = 0;
    while (stepIslandField(field, 0) && steps < 600) steps += 1;
    expect(isIslandFieldMoving(field)).toBe(false);
    for (const body of field.bodies) expect(Math.hypot(body.x - body.home.x, body.y - body.home.y)).toBe(0);
  });

  it("sleeps at rest and wakes only what a held island touches", () => {
    const field = tightField(40, 25, 3);
    settleIslandField(field);
    expect([...field.asleep].every((flag) => flag === 1)).toBe(true);
    // Hold the middle island a little to the right: it and its right-hand neighbour wake, nothing far away.
    const middle = field.bodies[12 * 40 + 20];
    pinIsland(field, middle.id, { x: middle.x + 8, y: middle.y });
    stepIslandField(field, Infinity);
    const awake = field.bodies.filter((_, i) => field.asleep[i] === 0).map((body) => body.id);
    expect(awake).toContain(middle.id);
    expect(awake).toContain(field.bodies[12 * 40 + 21].id);
    expect(awake.length).toBeLessThan(10);
  });

  it("stands a map of more than a thousand islands at home at once, and moves it for real under a hand", () => {
    const field = tightField(50, 25, 3);
    expect(isIslandFieldMoving(field)).toBe(false);
    for (const body of field.bodies) expect([body.x, body.y]).toEqual([body.home.x, body.home.y]);
    const middle = field.bodies[12 * 50 + 25];
    pinIsland(field, middle.id, { x: middle.x + 8, y: middle.y });
    stepIslandField(field, Infinity);
    expect(field.bodies[12 * 50 + 26].x).toBeGreaterThan(field.bodies[12 * 50 + 26].home.x);
  });
});
