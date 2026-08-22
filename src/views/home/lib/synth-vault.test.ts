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
   * **This test pins the shape, not the formula.**
   *
   * 2026-07-31: the synthesizer derived only `sqrt(n)/2` capabilities (27 at
   * n=3000) and spread elements round-robin, averaging 82 children per
   * capability. This repo's own vault (98 nodes) measures median 3, max 92, and
   * single digits across the other 42 parents — one hub plus a long tail.
   *
   * The old synth built a world with 27 simultaneous hubs, and no such vault
   * exists; every performance number taken on it was a phantom baseline. So the
   * assertions pin the two numbers the measurement demands, not the formula,
   * which is what stops the next person reverting it for convenience.
   */
  it("부모당 자식 분포가 실측 볼트의 모양이다 — 중앙값 한 자릿수 + 허브 하나", () => {
    const g = synthesizeVaultGraph(3000);
    const childCount = new Map<string, number>();
    for (const edge of g.edges) {
      if (edge.type !== "contains") continue;
      // The fields are `from`/`to`. Reading `source` instead collapsed every
      // edge under one `undefined` key and produced an impossible median of
      // 2872 — the test was wrong while the code looked wrong.
      childCount.set(edge.from, (childCount.get(edge.from) ?? 0) + 1);
    }
    const counts = [...childCount.values()].sort((a, b) => a - b);
    const median = counts[Math.floor(counts.length / 2)];
    const max = counts[counts.length - 1];

    // Measured vault: median 3. An even spread pushes this into double digits.
    expect(median).toBeGreaterThanOrEqual(1);
    expect(median).toBeLessThanOrEqual(6);
    // Measured vault: max 92. A hub must exist, and there must be exactly one.
    expect(max).toBeGreaterThan(40);
    expect(max).toBeLessThan(160);
    // Hubs are rare: only a handful of capabilities may exceed 40 for this to be a long tail.
    const capacityCounts = [...childCount.entries()]
      .filter(([id]) => id.startsWith("synth-cap-"))
      .map(([, n]) => n);
    expect(capacityCounts.filter((n) => n > 40).length).toBeLessThanOrEqual(3);

    // Domains are deliberately outside this contract. Each carries ~25
    // capabilities plus ~28 direct elements, so all 18 exceed 40. But in the
    // measured vault, attaching an element straight to a domain without a
    // capability happens exactly once (`views`) and the steward called it a
    // detour around the schema's intent. Whether the synthesizer should
    // reproduce that across all 18 domains depends on an unsettled call about a
    // healthy ontology's branching factor, so pinning it now would freeze a
    // wrong shape into a contract.
  });

  it("범위를 [SYNTH_MIN, SYNTH_MAX] 로 clamp 하고 정수로 반올림한다", () => {
    expect(clampSynthSize(50)).toBe(SYNTH_MIN);
    expect(clampSynthSize(999999)).toBe(SYNTH_MAX);
    expect(clampSynthSize(2000)).toBe(2000);
    expect(clampSynthSize(1999.6)).toBe(2000);
  });

  it("비수치 입력은 null", () => {
    expect(clampSynthSize(Number.NaN)).toBeNull();
    expect(clampSynthSize(Number.POSITIVE_INFINITY)).toBeNull();
  });
});

describe("synthesizeVaultGraph — 결정론", () => {
  it("같은 N 은 바이트 동일한 nodes/edges 를 낸다", () => {
    const a = synthesizeVaultGraph(2000);
    const b = synthesizeVaultGraph(2000);
    expect(b.nodes).toEqual(a.nodes);
    expect(b.edges).toEqual(a.edges);
    expect(b.counts).toEqual(a.counts);
    // Evidence that no `Math.random` is involved: order and ids are index-based, so the first and last nodes are fixed.
    expect(a.nodes[0].id).toBe("synth-project");
    expect(a.nodes[a.nodes.length - 1].id).toBe(`synth-el-${a.counts.element - 1}`);
  });
});

describe("synthesizeVaultGraph — 분포 계약", () => {
  it("도메인 √n/3 · 역량 n×0.15 · element 나머지, 20% 도메인 직속 · 5% 고아", () => {
    for (const n of [100, 2000, 5000, SYNTH_MAX]) {
      const g = synthesizeVaultGraph(n);
      const counts = computeSynthCounts(n);

      // Total node count = n (1 project + domains + capabilities + elements).
      expect(g.nodes).toHaveLength(n);
      expect(1 + counts.domain + counts.capability + counts.element).toBe(n);

      // Per-kind counts match the distribution formula exactly.
      const byKind = g.nodes.reduce<Record<string, number>>((acc, node) => {
        acc[node.kind] = (acc[node.kind] ?? 0) + 1;
        return acc;
      }, {});
      expect(byKind.project).toBe(1);
      expect(byKind.domain).toBe(counts.domain);
      expect(byKind.capability).toBe(counts.capability);
      expect(byKind.element).toBe(counts.element);
      expect(counts.domain).toBe(Math.max(1, Math.round(Math.sqrt(n) / 3)));
      // Capabilities are proportional to node count; the old `sqrt(n)/2` made
      // too few parents, and the children-per-parent test above pins why.
      expect(counts.capability).toBe(
        Math.max(1, Math.min(n - 2 - counts.domain, Math.round(n * 0.15))),
      );

      // Orphans ~5%, domain-direct ~20% (the `index % 20` buckets give exactly 1/20 and 4/20).
      const orphanRatio = counts.orphanElements / counts.element;
      const directRatio = counts.directElements / counts.element;
      // When the element count is not a multiple of 20 the buckets cannot land
      // on exactly 1/20, and changing the capability count changed that total,
      // so the tolerance covers the remainder.
      expect(orphanRatio).toBeGreaterThan(0.04);
      expect(orphanRatio).toBeLessThan(0.07);
      expect(directRatio).toBeGreaterThan(0.19);
      expect(directRatio).toBeLessThan(0.21);

      // Orphans have no parent and so no containment edge, leaving
      // domain + capability + (element - orphan) contains edges.
      const containsEdges = g.edges.filter((e) => e.type === "contains");
      expect(containsEdges).toHaveLength(
        counts.domain + counts.capability + (counts.element - counts.orphanElements),
      );

      // Every edge endpoint points at a real node — nothing dangling.
      const ids = new Set(g.nodes.map((node) => node.id));
      for (const edge of g.edges) {
        expect(ids.has(edge.from)).toBe(true);
        expect(ids.has(edge.to)).toBe(true);
      }
    }
  });
});
