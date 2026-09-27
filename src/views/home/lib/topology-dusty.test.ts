import { describe, expect, it } from "vitest";

import { DUSTY_MIN_AGE_MS, deriveDustySlugs } from "./topology-dusty";

const NOW = Date.parse("2026-07-23T00:00:00Z");

function node(id: string, sourceSlug: string | null) {
  return { id, evidenceIds: sourceSlug ? [sourceSlug] : [] };
}

function daysAgoIso(days: number): string {
  return new Date(NOW - days * 24 * 60 * 60 * 1000).toISOString();
}

describe("deriveDustySlugs", () => {
  it("dusty only when strictly older than the median and older than 30 days", () => {
    const nodes = [node("a", "doc-a"), node("b", "doc-b"), node("c", "doc-c")];
    const index = new Map([
      ["doc-a", daysAgoIso(120)], // older than the median (10d) and over 30d -> dusty
      ["doc-b", daysAgoIso(10)], // the median itself (a tie) -> fresh
      ["doc-c", daysAgoIso(1)],
    ]);
    expect([...deriveDustySlugs(nodes, index, NOW)]).toEqual(["a"]);
  });

  it("fresh within 30 days even when older than the median", () => {
    const nodes = [node("a", "doc-a"), node("b", "doc-b"), node("c", "doc-c")];
    const index = new Map([
      ["doc-a", daysAgoIso(20)],
      ["doc-b", daysAgoIso(2)],
      ["doc-c", daysAgoIso(1)],
    ]);
    expect(deriveDustySlugs(nodes, index, NOW).size).toBe(0);
  });

  it("all nodes sharing one mtime after a bulk import or clone stay fresh under the strict tie rule", () => {
    const nodes = [node("a", "doc-a"), node("b", "doc-b")];
    const index = new Map([
      ["doc-a", daysAgoIso(300)],
      ["doc-b", daysAgoIso(300)],
    ]);
    expect(deriveDustySlugs(nodes, index, NOW).size).toBe(0);
  });

  it("a node trailing the median age by under twice stays fresh, only the real tail is dusty", () => {
    // median = (100d+5d)/2 = 52.5d, so the threshold is max(30d, 105d) = 105d.
    // Only a (200d) passes it; b (100d) is older than the median but within 2x,
    // so it stays fresh. A plain "below median plus 30 days" test marked the
    // majority of the dogfood vault (guardian's prescription).
    const nodes = [node("a", "doc-a"), node("b", "doc-b"), node("c", "doc-c"), node("d", "doc-d")];
    const index = new Map([
      ["doc-a", daysAgoIso(200)],
      ["doc-b", daysAgoIso(100)],
      ["doc-c", daysAgoIso(5)],
      ["doc-d", daysAgoIso(1)],
    ]);
    expect([...deriveDustySlugs(nodes, index, NOW)]).toEqual(["a"]);
  });

  it("returns an empty set without any date data, so the feature turns off quietly", () => {
    expect(deriveDustySlugs([node("a", "doc-a"), node("b", null)], new Map(), NOW).size).toBe(0);
  });

  it("nodes with a missing or unparseable date leave the sample and stay fresh", () => {
    const nodes = [
      node("a", "doc-a"),
      node("b", "doc-b"),
      node("c", "doc-c"),
      node("e", "doc-e"),
      node("d", null),
    ];
    const index = new Map([
      ["doc-a", daysAgoIso(300)],
      ["doc-b", "not-a-date"],
      ["doc-c", daysAgoIso(1)],
      ["doc-e", daysAgoIso(2)],
    ]);
    // Population is a, c, e (median 2d, threshold 30d): only a is dusty; b and d have no data and stay fresh.
    expect([...deriveDustySlugs(nodes, index, NOW)]).toEqual(["a"]);
  });

  it("caps at the oldest quartile, so only the oldest 25% are dusty even when many pass", () => {
    // 8 nodes (median 1d, threshold 30d) gives a cap of 2. a, b and c all pass
    // the threshold, but only the two oldest are marked.
    const ids = ["a", "b", "c", "d", "e", "f", "g", "h"];
    const ages = [400, 390, 380, 1, 1, 1, 1, 1];
    const nodes = ids.map((id) => node(id, `doc-${id}`));
    const index = new Map(ids.map((id, i) => [`doc-${id}`, daysAgoIso(ages[i])]));
    expect([...deriveDustySlugs(nodes, index, NOW)].sort()).toEqual(["a", "b"]);
  });

  it("a single-node vault is its own median and stays fresh", () => {
    const nodes = [node("a", "doc-a")];
    const index = new Map([["doc-a", daysAgoIso(365)]]);
    expect(deriveDustySlugs(nodes, index, NOW).size).toBe(0);
  });

  it("boundary: in a recent vault with a one-day median, exactly 30 days is fresh and 31 is dusty", () => {
    // Median 1d makes the threshold max(30d, 2d), so the 30-day floor dominates.
    const nodes = ["a", "b", "c", "d", "e"].map((id) => node(id, `doc-${id}`));
    const index = new Map([
      ["doc-a", new Date(NOW - DUSTY_MIN_AGE_MS).toISOString()], // exactly 30d, not over -> fresh
      ["doc-b", daysAgoIso(31)], // over 30d and below the median -> dusty
      ["doc-c", daysAgoIso(1)],
      ["doc-d", daysAgoIso(1)],
      ["doc-e", daysAgoIso(1)],
    ]);
    expect([...deriveDustySlugs(nodes, index, NOW)]).toEqual(["b"]);
  });
});
