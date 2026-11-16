import { describe, expect, it } from "vitest";

import { openRadiusPx, starRooms, type StarPoint } from "./open-star";

const TOKENS = { capOpenMaxPx: 24, elementOpenMaxPx: 10, openFill: 0.8 };
const OWN_PX = 3;

function radii(points: readonly StarPoint[], scale = 1, fixed: { x: number; y: number } | null = null, fixedPx = 0): Map<string, number> {
  const rooms = starRooms(points, fixed, TOKENS);
  return new Map(points.map((p) => [p.id, openRadiusPx(OWN_PX, rooms.get(p.id)!, scale, fixedPx, TOKENS)]));
}

const capability = (id: string, x: number, y = 0): StarPoint => ({ id, kind: "capability", x, y });
const element = (id: string, x: number, y = 0): StarPoint => ({ id, kind: "element", x, y });

describe("an opened star's marks", () => {
  it("grow to their open maxima when few stand far apart", () => {
    const r = radii([capability("a", 0), capability("b", 400), element("e", 200, 200)]);
    expect(r.get("a")).toBe(TOKENS.capOpenMaxPx);
    expect(r.get("b")).toBe(TOKENS.capOpenMaxPx);
    expect(r.get("e")).toBe(TOKENS.elementOpenMaxPx);
  });

  it("grow less when crowded, never past the fill of the distance between a pair, and more with the zoom", () => {
    const crowded = [capability("a", 0), capability("b", 30), capability("c", 60)];
    const near = radii(crowded);
    expect(near.get("b")!).toBeLessThan(TOKENS.capOpenMaxPx);
    expect(near.get("a")! + near.get("b")!).toBeLessThanOrEqual(TOKENS.openFill * 30 + 1e-9);
    expect(radii(crowded, 1.5).get("b")!).toBeGreaterThan(near.get("b")!);
  });

  it("give a capability the larger share of the room it shares with an element, and leave air between them", () => {
    const r = radii([capability("c", 0), element("e", 25)]);
    expect(r.get("c")!).toBeGreaterThan(r.get("e")! * 2);
    expect(r.get("c")! + r.get("e")!).toBeLessThan(25);
  });

  it("keep their own radius on a shared spot, with no division by zero", () => {
    const r = radii([capability("a", 10, 10), capability("b", 10, 10), element("e", 10, 10)]);
    for (const id of ["a", "b", "e"]) expect(r.get(id), id).toBe(OWN_PX);
  });

  it("keep the fill of the gap past a fixed disc clear of it", () => {
    const fixedPx = 20;
    const r = radii([capability("a", 30)], 1, { x: 0, y: 0 }, fixedPx);
    expect(r.get("a")!).toBeCloseTo(TOKENS.openFill * (30 - fixedPx), 9);
  });

  it("never draw under their own radius", () => {
    const rooms = starRooms([element("e", 0), element("f", 1)], null, TOKENS);
    expect(openRadiusPx(4.5, rooms.get("e")!, 1, 0, TOKENS)).toBe(4.5);
  });
});
