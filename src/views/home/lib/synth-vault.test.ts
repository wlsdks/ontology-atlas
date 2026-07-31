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
   * **이 테스트가 잠그는 것은 공식이 아니라 «모양» 이다.**
   *
   * 2026-07-31: 합성 볼트가 역량을 `√n/2`(n=3000 → 27개)만 만들고 element 를
   * 라운드로빈으로 균등 배분해 **역량당 평균 82** 를 만들고 있었다. 그런데 이
   * 저장소 자신의 볼트(98노드)를 실측하면 **중앙값 3 · 최댓값 92 · 나머지 42개
   * 부모는 한 자릿수** — 즉 «허브 하나 + 롱테일» 이다.
   *
   * 종전 합성은 «허브가 27개 동시에 존재하는 세상» 이었고, **그런 볼트는 실재하지
   * 않는다.** 그 위에서 잰 성능 수치는 전부 허수 기준선이었다. 그래서 다음 사람이
   * 편의로 공식을 되돌리지 못하게, 공식이 아니라 **실측이 요구하는 두 수**를 건다.
   */
  it("부모당 자식 분포가 실측 볼트의 모양이다 — 중앙값 한 자릿수 + 허브 하나", () => {
    const g = synthesizeVaultGraph(3000);
    const childCount = new Map<string, number>();
    for (const edge of g.edges) {
      if (edge.type !== "contains") continue;
      // ⚠️ 필드는 `from`/`to` 다. 처음에 `source` 를 읽어 전부 `undefined` 한
      // 키로 뭉쳤고, 「중앙값 2872」라는 말이 안 되는 수치가 나왔다 — 테스트가
      // 틀렸는데 코드가 틀린 것처럼 보였다.
      childCount.set(edge.from, (childCount.get(edge.from) ?? 0) + 1);
    }
    const counts = [...childCount.values()].sort((a, b) => a - b);
    const median = counts[Math.floor(counts.length / 2)];
    const max = counts[counts.length - 1];

    // 실측 볼트: 중앙값 3. 균등 배분이면 여기가 두 자릿수로 튄다.
    expect(median).toBeGreaterThanOrEqual(1);
    expect(median).toBeLessThanOrEqual(6);
    // 실측 볼트: 최댓값 92. 허브가 **존재하되 하나** 여야 한다.
    expect(max).toBeGreaterThan(40);
    expect(max).toBeLessThan(160);
    // 허브는 소수다 — **역량 중** 40개 초과가 손에 꼽혀야 «롱테일» 이다.
    const capacityCounts = [...childCount.entries()]
      .filter(([id]) => id.startsWith("synth-cap-"))
      .map(([, n]) => n);
    expect(capacityCounts.filter((n) => n > 40).length).toBeLessThanOrEqual(3);

    // ⚠️ **도메인은 아직 이 계약 밖이다.** 도메인마다 역량 ~25 + 직속 element ~28
    // 이라 18개 전부가 40을 넘는다. 그런데 실측 볼트에서 «element 를 capability
    // 경유 없이 도메인에 직결» 하는 것은 `views` 하나뿐인 **이상 현상**이고,
    // 지킴이가 스키마 의도 우회로 지목했다. 합성이 그 결함을 18개 도메인 전부에
    // 재현하는 것이 옳은지는 «건강한 온톨로지의 분기 계수» 판정에 달려 있어,
    // 그 결론 전에는 잠그지 않는다 — 잠그면 잘못된 모양을 계약으로 굳힌다.
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
    // Math.random 미사용 증거 — 순서·id 모두 index 기반이라 첫/끝 노드가 고정.
    expect(a.nodes[0].id).toBe("synth-project");
    expect(a.nodes[a.nodes.length - 1].id).toBe(`synth-el-${a.counts.element - 1}`);
  });
});

describe("synthesizeVaultGraph — 분포 계약", () => {
  it("도메인 √n/3 · 역량 n×0.15 · element 나머지, 20% 도메인 직속 · 5% 고아", () => {
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
      // 역량은 **노드 수에 비례**한다(구 `√n/2` 는 부모를 너무 적게 만들었다 —
      // 아래 「부모당 자식 분포」 테스트가 그 이유를 잠근다).
      expect(counts.capability).toBe(
        Math.max(1, Math.min(n - 2 - counts.domain, Math.round(n * 0.15))),
      );

      // 고아 ≈ 5%, 직속 ≈ 20% (index%20 버킷 → 정확히 1/20, 4/20).
      const orphanRatio = counts.orphanElements / counts.element;
      const directRatio = counts.directElements / counts.element;
      // element 수가 20의 배수가 아니면 `%20` 버킷이 정확히 1/20 을 못 낸다 —
      // 역량 수가 바뀌며 element 총수도 바뀌었으므로 허용폭을 그만큼 준다.
      expect(orphanRatio).toBeGreaterThan(0.04);
      expect(orphanRatio).toBeLessThan(0.07);
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
