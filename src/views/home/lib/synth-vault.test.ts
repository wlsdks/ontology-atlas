import { describe, expect, it } from "vitest";

import {
  clampSynthSize,
  computeSynthCounts,
  SYNTH_MAX,
  SYNTH_MIN,
  synthesizeVaultGraph,
} from "./synth-vault";

describe("clampSynthSize", () => {
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
    // Math.random 미사용 증거 — 순서·id 모두 index 기반이라 첫/끝 노드가 고정.
    expect(a.nodes[0].id).toBe("synth-project");
    expect(a.nodes[a.nodes.length - 1].id).toBe(`synth-el-${a.counts.element - 1}`);
  });
});

describe("synthesizeVaultGraph — 분포 계약", () => {
  it("도메인 √n/3 · 역량 √n/2 · element 나머지, 20% 도메인 직속 · 5% 고아", () => {
    for (const n of [100, 2000, 5000, SYNTH_MAX]) {
      const g = synthesizeVaultGraph(n);
      const counts = computeSynthCounts(n);

      // 총 노드 수 = n (project 1 + domain + capability + element).
      expect(g.nodes).toHaveLength(n);
      expect(1 + counts.domain + counts.capability + counts.element).toBe(n);

      // kind 별 카운트가 분포 공식과 정확히 일치.
      const byKind = g.nodes.reduce<Record<string, number>>((acc, node) => {
        acc[node.kind] = (acc[node.kind] ?? 0) + 1;
        return acc;
      }, {});
      expect(byKind.project).toBe(1);
      expect(byKind.domain).toBe(counts.domain);
      expect(byKind.capability).toBe(counts.capability);
      expect(byKind.element).toBe(counts.element);
      expect(counts.domain).toBe(Math.max(1, Math.round(Math.sqrt(n) / 3)));
      expect(counts.capability).toBe(Math.max(1, Math.round(Math.sqrt(n) / 2)));

      // 고아 ≈ 5%, 직속 ≈ 20% (index%20 버킷 → 정확히 1/20, 4/20).
      const orphanRatio = counts.orphanElements / counts.element;
      const directRatio = counts.directElements / counts.element;
      expect(orphanRatio).toBeGreaterThan(0.04);
      expect(orphanRatio).toBeLessThan(0.06);
      expect(directRatio).toBeGreaterThan(0.19);
      expect(directRatio).toBeLessThan(0.21);

      // 고아는 containment edge 가 없다(부모 없음) → contains edge 수 =
      // domain + capability + (element - orphan).
      const containsEdges = g.edges.filter((e) => e.type === "contains");
      expect(containsEdges).toHaveLength(
        counts.domain + counts.capability + (counts.element - counts.orphanElements),
      );

      // 모든 edge 의 endpoint 가 실재 노드를 가리킨다(dangling 없음).
      const ids = new Set(g.nodes.map((node) => node.id));
      for (const edge of g.edges) {
        expect(ids.has(edge.from)).toBe(true);
        expect(ids.has(edge.to)).toBe(true);
      }
    }
  });
});
