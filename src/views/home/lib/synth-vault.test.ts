import { describe, expect, it } from "vitest";

import {
  clampSynthSize,
  computeSynthCounts,
  SYNTH_MAX,
  SYNTH_MIN,
  synthesizeVaultGraph,
} from "./synth-vault";

describe("clampSynthSize", () => {
  /**
   * Pins the shape of the measured vault (median 3, max 92, one hub), not the formula,
   * so nobody reverts to a distribution with many hubs that no real vault has.
   */
  it("children per parent match a measured vault: single-digit median plus one hub", () => {
    const g = synthesizeVaultGraph(3000);
    const childCount = new Map<string, number>();
    for (const edge of g.edges) {
      if (edge.type !== "contains") continue;
      // The fields are `from`/`to`; reading `source` collapses every edge under `undefined`.
      childCount.set(edge.from, (childCount.get(edge.from) ?? 0) + 1);
    }
    const counts = [...childCount.values()].sort((a, b) => a - b);
    const median = counts[Math.floor(counts.length / 2)];
    const max = counts[counts.length - 1];

    // Measured vault: median 3. An even spread pushes this into double digits.
    expect(median).toBeGreaterThanOrEqual(1);
    expect(median).toBeLessThanOrEqual(6);
    // Measured vault: max 92. A hub must exist, and exactly one.
    expect(max).toBeGreaterThan(40);
    expect(max).toBeLessThan(160);
    const capacityCounts = [...childCount.entries()]
      .filter(([id]) => id.startsWith("synth-cap-"))
      .map(([, n]) => n);
    expect(capacityCounts.filter((n) => n > 40).length).toBeLessThanOrEqual(3);

    // Domains are outside this contract: whether a healthy ontology attaches elements straight to
    // a domain
    // is unsettled, so pinning it would freeze a guess.
  });

  it("clamps to [SYNTH_MIN, SYNTH_MAX] and rounds to an integer", () => {
    expect(clampSynthSize(50)).toBe(SYNTH_MIN);
    expect(clampSynthSize(999999)).toBe(SYNTH_MAX);
    expect(clampSynthSize(2000)).toBe(2000);
    expect(clampSynthSize(1999.6)).toBe(2000);
  });

  it("returns null for non-numeric input", () => {
    expect(clampSynthSize(Number.NaN)).toBeNull();
    expect(clampSynthSize(Number.POSITIVE_INFINITY)).toBeNull();
  });
});

describe("synthesizeVaultGraph determinism", () => {
  it("the same N yields byte-identical nodes and edges", () => {
    const a = synthesizeVaultGraph(2000);
    const b = synthesizeVaultGraph(2000);
    expect(b.nodes).toEqual(a.nodes);
    expect(b.edges).toEqual(a.edges);
    expect(b.counts).toEqual(a.counts);
    // Index-based ids show no `Math.random` is involved.
    expect(a.nodes[0].id).toBe("synth-project");
    expect(a.nodes[a.nodes.length - 1].id).toBe(`synth-el-${a.counts.element - 1}`);
  });
});

describe("synthesizeVaultGraph distribution contract", () => {
  it("domains sqrt(n)/3, capabilities n*0.15, elements the rest, 20% direct under a domain, 5% orphans", () => {
    for (const n of [100, 2000, 5000, SYNTH_MAX]) {
      const g = synthesizeVaultGraph(n);
      const counts = computeSynthCounts(n);

      expect(g.nodes).toHaveLength(n);
      expect(1 + counts.domain + counts.capability + counts.element).toBe(n);

      const byKind = g.nodes.reduce<Record<string, number>>((acc, node) => {
        acc[node.kind] = (acc[node.kind] ?? 0) + 1;
        return acc;
      }, {});
      expect(byKind.project).toBe(1);
      expect(byKind.domain).toBe(counts.domain);
      expect(byKind.capability).toBe(counts.capability);
      expect(byKind.element).toBe(counts.element);
      expect(counts.domain).toBe(Math.max(1, Math.round(Math.sqrt(n) / 3)));
      // Capabilities scale with node count; the children-per-parent test above pins why.
      expect(counts.capability).toBe(
        Math.max(1, Math.min(n - 2 - counts.domain, Math.round(n * 0.15))),
      );

      // The `index % 20` buckets give exactly 1/20 and 4/20.
      const orphanRatio = counts.orphanElements / counts.element;
      const directRatio = counts.directElements / counts.element;
      // An element count that is not a multiple of 20 leaves a remainder, which the tolerance
      // covers.
      expect(orphanRatio).toBeGreaterThan(0.04);
      expect(orphanRatio).toBeLessThan(0.07);
      expect(directRatio).toBeGreaterThan(0.19);
      expect(directRatio).toBeLessThan(0.21);

      // Orphans have no containment edge.
      const containsEdges = g.edges.filter((e) => e.type === "contains");
      expect(containsEdges).toHaveLength(
        counts.domain + counts.capability + (counts.element - counts.orphanElements),
      );

      const ids = new Set(g.nodes.map((node) => node.id));
      for (const edge of g.edges) {
        expect(ids.has(edge.from)).toBe(true);
        expect(ids.has(edge.to)).toBe(true);
      }
    }
  });
});
