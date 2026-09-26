import { describe, expect, it } from "vitest";

import { placeTierNames, sameTierNames, TIER_NAME_GAP_PX, TIER_NAME_ROW_PX, type TierPlane } from "./tier-names";

/*
 * Four planes as Strata projects them on a 1448 × 949 canvas with INDEX open (the
 * product's own ontology at 1512×949, rounded, canvas px): each lower plane wider,
 * and every rim's right extreme left of the rail's column, which starts at 1388.
 */
const PLANES: TierPlane[] = [
  { kind: "project", left: 792, right: 951, top: 98, bottom: 152, y: 125, a: 1 },
  { kind: "domain", left: 545, right: 1204, top: 159, bottom: 454, y: 306, a: 1 },
  { kind: "capability", left: 466, right: 1284, top: 265, bottom: 682, y: 473, a: 1 },
  { kind: "element", left: 421, right: 1330, top: 363, bottom: 909, y: 636, a: 1 },
];
const WIDTHS = { project: 44, domain: 33, capability: 22, element: 22 };
const ROOM = { left: 324, right: 1388, top: 88, bottom: 870 };

describe("placeTierNames", () => {
  it("hangs each name on its own plane's rim, at the plane's height", () => {
    const names = placeTierNames(PLANES, WIDTHS, ROOM);
    expect(names.map((name) => name.kind)).toEqual(["project", "domain", "capability", "element"]);
    for (const name of names) {
      const plane = PLANES.find((p) => p.kind === name.kind)!;
      expect(name.side).toBe("right");
      expect(name.minX).toBe(plane.right + TIER_NAME_GAP_PX);
      expect((name.minY + name.maxY) / 2).toBe(plane.y);
      expect(name.maxY - name.minY).toBe(TIER_NAME_ROW_PX);
    }
  });

  it("takes the left extreme when the right one runs into the chrome, and leaves a plane unnamed when both do", () => {
    // A narrower window: the fit took the element rim to within 10 px of the rail's column.
    const tight = { ...ROOM, right: 1340 };
    const names = placeTierNames(PLANES, WIDTHS, tight);
    const element = names.find((name) => name.kind === "element");
    expect(element?.side).toBe("left");
    expect(element?.maxX).toBe(421 - TIER_NAME_GAP_PX);

    const cramped = { ...tight, left: 400 };
    expect(placeTierNames(PLANES, WIDTHS, cramped).map((name) => name.kind)).not.toContain("element");

    // A name that would end flush against the chrome keeps half a gap of air instead: measured
    // through the entry fade's 0.995 scale, the rail read 2 px wide of where it stands.
    const flush = { ...ROOM, right: 1330 + TIER_NAME_GAP_PX + 22 };
    expect(placeTierNames(PLANES, WIDTHS, flush).find((name) => name.kind === "element")?.side).toBe("left");
  });

  it("never lays a name inside another plane's disc", () => {
    // A flatter pitch: the domain rim's right extreme now sits inside the capability disc.
    const flat: TierPlane[] = [
      { kind: "domain", left: 700, right: 1100, top: 300, bottom: 360, y: 330, a: 1 },
      { kind: "capability", left: 500, right: 1300, top: 280, bottom: 420, y: 350, a: 1 },
    ];
    const names = placeTierNames(flat, WIDTHS, ROOM);
    expect(names.map((name) => name.kind)).toEqual(["capability"]);
  });

  it("never lays two names on each other", () => {
    const twins: TierPlane[] = [
      { kind: "domain", left: 600, right: 1000, top: 290, bottom: 310, y: 300, a: 1 },
      { kind: "capability", left: 600, right: 1000, top: 296, bottom: 316, y: 306, a: 1 },
    ];
    const names = placeTierNames(twins, WIDTHS, ROOM);
    // Both rims are thin enough to leave the other's name alone, so the second takes the other side.
    expect(names.map((name) => `${name.kind}:${name.side}`)).toEqual(["domain:right", "capability:left"]);
  });

  it("names nothing it cannot measure", () => {
    expect(placeTierNames(PLANES, {}, ROOM)).toEqual([]);
  });

  it("publishes only a change a person could see", () => {
    const names = placeTierNames(PLANES, WIDTHS, ROOM);
    const nudged = names.map((name) => ({ ...name, minX: name.minX + 0.2, maxX: name.maxX + 0.2 }));
    expect(sameTierNames(names, nudged)).toBe(true);
    expect(sameTierNames(names, names.slice(1))).toBe(false);
    expect(sameTierNames(null, null)).toBe(true);
    expect(sameTierNames(names, null)).toBe(false);
  });
});
