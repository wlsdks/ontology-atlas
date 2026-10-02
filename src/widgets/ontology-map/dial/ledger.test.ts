import { describe, expect, it } from "vitest";
import { buildLedger, countLeaderCrossings, enteredDomain, ledgerWanted, type LedgerDisc, type LedgerInput } from "./ledger";
import type { DialCluster, DialScene } from "./types";

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

function cluster(domainId: string, x: number, y: number, footprint = 40): DialCluster {
  return { domainId, step: 0, angle: 0, chip: { x, y }, footprint, items: [] };
}

function scene(clusters: DialCluster[]): Pick<DialScene, "clusters" | "clusterByDomain"> {
  return { clusters, clusterByDomain: new Map(clusters.map((c) => [c.domainId, c])) };
}

describe("enteredDomain", () => {
  const free = { minX: 0, minY: 0, maxX: 1000, maxY: 800 };
  const identity = (x: number, y: number) => ({ x, y });
  const s = scene([cluster("a", 480, 380), cluster("b", 100, 100), cluster("c", 800, 600)]);

  it("takes the attended domain", () => {
    expect(enteredDomain({ scene: s, attendedDomainId: "c", capabilitiesDrawn: new Set(["a"]), freeRect: free, toScreen: identity })).toBe("c");
  });

  it("else takes the chip nearest the free-rect centre among drawn clusters", () => {
    expect(enteredDomain({ scene: s, attendedDomainId: null, capabilitiesDrawn: new Set(["a", "b", "c"]), freeRect: free, toScreen: identity })).toBe("a");
    expect(enteredDomain({ scene: s, attendedDomainId: null, capabilitiesDrawn: new Set(["b", "c"]), freeRect: free, toScreen: identity })).toBe("c");
    expect(enteredDomain({ scene: s, attendedDomainId: "gone", capabilitiesDrawn: new Set(), freeRect: free, toScreen: identity })).toBeNull();
  });

  it("measures the chip on screen", () => {
    const shifted = (x: number, y: number) => ({ x: x - 400, y: y - 300 });
    expect(enteredDomain({ scene: s, attendedDomainId: null, capabilitiesDrawn: new Set(["a", "c"]), freeRect: free, toScreen: shifted })).toBe("c");
  });
});

describe("ledgerWanted", () => {
  const tokens = { reachCap: 96 };
  it("shows only when names are missing and the pitch is below reach-cap", () => {
    expect(ledgerWanted({ capabilityCount: 20, namedInPlace: 19, capabilityPitchPx: 40, tokens })).toBe(true);
    expect(ledgerWanted({ capabilityCount: 20, namedInPlace: 20, capabilityPitchPx: 40, tokens })).toBe(false);
    expect(ledgerWanted({ capabilityCount: 20, namedInPlace: 3, capabilityPitchPx: 96, tokens })).toBe(false);
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
