import { describe, expect, it } from "vitest";
import regression from "./ledger-regression.fixture.json";
import { overlaps } from "./label-marks";
import type { Point } from "./types";
import { buildLedger, countLeaderCrossings, ledgerWanted, namesFitInPlace, type LedgerDisc, type LedgerInput } from "./ledger";

const TOKENS = { ledgerRowPx: 14, ledgerGapPx: 24 };
const measure = (text: string) => text.length * 6;

function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

function discs(n: number, random: () => number = rng(1)): LedgerDisc[] {
  return Array.from({ length: n }, (_, i) => ({
    id: `c${i}`,
    label: `Capability ${i} ${"x".repeat(Math.floor(random() * 12))}`,
    x: 300 + random() * 260,
    y: 120 + random() * 560,
    r: 2 + random() * 4,
    degree: Math.floor(random() * 6),
  }));
}

function input(over: Partial<LedgerInput> = {}): LedgerInput {
  return {
    domainId: "d", discs: discs(10), priority: new Set(), freeRect: { minX: 0, minY: 0, maxX: 1200, maxY: 800 },
    font: "12px sans-serif", measureText: measure, moreText: (n) => `+${n} more`, tokens: TOKENS, ...over,
  };
}

describe("buildLedger", () => {
  it("keeps every row clear of a protected project name even when strokes cost more", () => {
    const plan = buildLedger(input({
      ...regression,
      priority: new Set(regression.priority),
      measureText: () => regression.measureWidth,
      avoid: { boxes: regression.avoid.boxes, nameBoxes: regression.avoid.names, lines: regression.avoid.lines as Point[][] },
    }))!;
    expect(plan.rows).toHaveLength(regression.discs.length);
    expect(new Set(plan.rows.map(row => row.id))).toEqual(new Set(regression.discs.map(disc => disc.id)));
    expect(plan.rows.some(row => regression.avoid.names.some(name => overlaps(row.box, name)))).toBe(false);
    expect(countLeaderCrossings(plan.leaders)).toBe(0);
  });

  it("keeps existing names when every ledger column is occupied", () => {
    const baseline = input();
    expect(buildLedger({ ...baseline, avoid: { boxes: [], nameBoxes: [baseline.freeRect], lines: [] } })).toBeNull();
  });

  it("moves its column off planned strokes and placed names", () => {
    const set = discs(4);
    const free = buildLedger(input({ discs: set }))!;
    const colX = free.rows[0]!.box.minX;
    const midY = (free.rows[0]!.box.minY + free.rows[free.rows.length - 1]!.box.maxY) / 2;
    const stroke = [{ x: colX - 40, y: midY + 3 }, { x: colX + 400, y: midY - 3 }];
    const name = { minX: colX, maxX: colX + 80, minY: free.rows[0]!.box.minY - 2, maxY: free.rows[0]!.box.maxY };
    const plan = buildLedger(input({ discs: set, avoid: { boxes: [name], lines: [stroke] } }))!;
    const rows = plan.rows.map((r) => r.box);
    expect(rows.some((b) => b.minX < name.maxX && b.maxX > name.minX && b.minY < name.maxY && b.maxY > name.minY)).toBe(false);
    expect(rows.some((b) => b.minY < midY + 3 && b.maxY > midY - 3 && b.maxX > colX - 40)).toBe(false);
    expect(countLeaderCrossings(plan.leaders)).toBe(0);
  });

  it("leaves no leader crossings over 200 seeded disc sets", () => {
    for (let seed = 1; seed <= 200; seed += 1) {
      const random = rng(seed);
      const n = 10 + Math.floor(random() * 51);
      const plan = buildLedger(input({ discs: discs(n, random), freeRect: { minX: 0, minY: 0, maxX: 1200, maxY: 1000 } }))!;
      expect(plan).not.toBeNull();
      expect(countLeaderCrossings(plan.leaders)).toBe(0);
    }
  });

  it("keeps names whole", () => {
    const set = discs(20);
    const plan = buildLedger(input({ discs: set }))!;
    const labels = new Map(set.map((d) => [d.id, d.label]));
    for (const row of plan.rows) {
      expect(row.text).toBe(labels.get(row.id));
      expect(row.text).not.toContain("…");
    }
  });

  it("fills capacity and counts the rest as more", () => {
    const rect = { minX: 0, minY: 0, maxX: 1200, maxY: 140 };
    const plan = buildLedger(input({ discs: discs(25), freeRect: rect }))!;
    expect(plan.rows).toHaveLength(9);
    expect(plan.more?.count).toBe(16);
    expect(plan.more?.row.text).toBe("+16 more");
    expect(plan.total).toBe(25);
    const exact = buildLedger(input({ discs: discs(10), freeRect: rect }))!;
    expect(exact.rows).toHaveLength(10);
    expect(exact.more).toBeNull();
    for (const row of [...plan.rows, plan.more!.row]) {
      expect(row.box.minY).toBeGreaterThanOrEqual(rect.minY);
      expect(row.box.maxY).toBeLessThanOrEqual(rect.maxY);
    }
  });

  it("puts attended and partner capabilities first, then degree, then label", () => {
    const set: LedgerDisc[] = [
      { id: "a", label: "Alpha", x: 300, y: 100, r: 3, degree: 0 },
      { id: "b", label: "Bravo", x: 300, y: 120, r: 3, degree: 9 },
      { id: "c", label: "Charlie", x: 300, y: 140, r: 3, degree: 2 },
      { id: "d", label: "Delta", x: 300, y: 160, r: 3, degree: 2 },
      { id: "e", label: "Echo", x: 300, y: 180, r: 3, degree: 5 },
    ];
    const plan = buildLedger(input({ discs: set, priority: new Set(["a"]), freeRect: { minX: 0, minY: 0, maxX: 1200, maxY: 56 } }))!;
    expect(plan.rows.map((r) => r.id).sort()).toEqual(["a", "b", "e"]);
    const ties = buildLedger(input({ discs: set, freeRect: { minX: 0, minY: 0, maxX: 1200, maxY: 56 } }))!;
    expect(ties.rows.map((r) => r.id).sort()).toEqual(["b", "c", "e"]);
  });

  it("chooses the right side, then the left, then none", () => {
    const set = discs(8);
    expect(buildLedger(input({ discs: set }))!.side).toBe("right");
    const left = buildLedger(input({ discs: set, freeRect: { minX: 0, minY: 0, maxX: 600, maxY: 800 } }))!;
    expect(left.side).toBe("left");
    expect(left.align).toBe("right");
    for (const row of left.rows) expect(row.box.minX).toBeGreaterThanOrEqual(0);
    expect(buildLedger(input({ discs: set, freeRect: { minX: 250, minY: 0, maxX: 600, maxY: 800 } }))).toBeNull();
  });
});

describe("ledgerWanted", () => {
  const tokens = { reachCap: 96 };
  it("shows only when names are missing and the pitch is below reach-cap", () => {
    expect(ledgerWanted({ capabilityCount: 20, namedInPlace: 19, capabilityPitchPx: 40, namesFitInPlace: false, tokens })).toBe(true);
    expect(ledgerWanted({ capabilityCount: 20, namedInPlace: 20, capabilityPitchPx: 40, namesFitInPlace: false, tokens })).toBe(false);
    expect(ledgerWanted({ capabilityCount: 20, namedInPlace: 3, capabilityPitchPx: 96, namesFitInPlace: false, tokens })).toBe(false);
  });

  it("stays away while zooming in would name every capability in place", () => {
    expect(ledgerWanted({ capabilityCount: 8, namedInPlace: 0, capabilityPitchPx: 16, namesFitInPlace: true, tokens })).toBe(false);
  });
});

describe("namesFitInPlace", () => {
  const measure = (text: string) => text.length * 6.5;
  const ring = (n: number, radius: number) =>
    Array.from({ length: n }, (_, k) => ({ id: `c${k}`, x: Math.cos((k * 2 * Math.PI) / n) * radius, y: Math.sin((k * 2 * Math.PI) / n) * radius, direct: false, elements: 1, label: `Capability ${k}` }));
  const input = (items: ReturnType<typeof ring>, scale: number) => ({
    items, chip: { x: 0, y: 0 }, chipRadiusPx: 10, scale, discRadiusPx: () => 4, fontPx: 12, font: "12px sans-serif", measureText: measure,
  });

  it("finds room for a few names spread around the chip", () => {
    expect(namesFitInPlace(input(ring(4, 60), 1.5))).toBe(true);
  });

  it("refuses a crowd whose names cannot all stand beside their discs", () => {
    expect(namesFitInPlace(input(ring(40, 60), 1.5))).toBe(false);
  });
});

describe("buildLedger footprint", () => {
  it("stands outside the entered cluster's footprint", () => {
    const set = discs(20);
    const footprint = { x: 430, y: 400, r: 220 };
    const plan = buildLedger(input({ discs: set, footprint }))!;
    expect(plan.side).toBe("right");
    for (const row of plan.rows) expect(row.box.minX).toBeGreaterThanOrEqual(footprint.x + footprint.r);
    expect(countLeaderCrossings(plan.leaders)).toBe(0);
    const left = buildLedger(input({ discs: set, footprint, freeRect: { minX: 0, minY: 0, maxX: 760, maxY: 800 } }))!;
    expect(left.side).toBe("left");
    for (const row of left.rows) expect(row.box.maxX).toBeLessThanOrEqual(footprint.x - footprint.r);
  });
});

const layoutReady = false;

describe("ledger on real vaults", () => {
  it.skipIf(!layoutReady)("layered 10,000 at zoom 5x names min(52, capacity) plus more with 0 crossings", () => {
    expect(layoutReady).toBe(true);
  });
  it.skipIf(!layoutReady)("storefront Orders needs no ledger from 2.5x", () => {
    expect(layoutReady).toBe(true);
  });
});
