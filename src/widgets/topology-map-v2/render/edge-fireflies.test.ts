import { describe, expect, it } from "vitest";

import {
  advanceParticlePhase,
  edgePairKey,
  EGO_CONTAINS_COMET_LIMIT,
  fireflySeed,
  PULSE_DURATION_MS,
  PULSE_TRAIL_LAG,
  pulseHeadTrail,
  pulseScale,
  edgePairMeta,
  selectEgoContainsComets,
  spawnHoverPulses,
  updateParticles,
  updatePulses,
  type ParticleEdge,
  type Pulse,
} from "./edge-fireflies";

/**
 * The pure contract of the always-on comets and hover pulses: phase-advance
 * determinism, the reduced-motion stop, pulse lifetime and direction. The pixels
 * themselves are verified on a real screen.
 */
describe("fireflySeed", () => {
  it("결정론 — 같은 엣지는 항상 같은 시드", () => {
    expect(fireflySeed("a", "b")).toBe(fireflySeed("a", "b"));
  });

  it("[0,1) 범위", () => {
    for (const [s, t] of [["a", "b"], ["capability:x", "element:y"], ["z", "z"]]) {
      const seed = fireflySeed(s, t);
      expect(seed).toBeGreaterThanOrEqual(0);
      expect(seed).toBeLessThan(1);
    }
  });

  it("방향성 — source↔target 순서가 다르면 다른 시드(대체로)", () => {
    expect(fireflySeed("a", "b")).not.toBe(fireflySeed("b", "a"));
  });
});

describe("advanceParticlePhase", () => {
  it("결정론 — 같은 입력은 같은 결과", () => {
    expect(advanceParticlePhase(0.2, 0.016, 0.075)).toBe(advanceParticlePhase(0.2, 0.016, 0.075));
  });

  it("항상 [0,1) 범위 — 큰 dt 로 여러 바퀴 돌아도 랩", () => {
    for (const dt of [0.016, 0.05, 1, 100]) {
      const t = advanceParticlePhase(0.9, dt, 0.075);
      expect(t).toBeGreaterThanOrEqual(0);
      expect(t).toBeLessThan(1);
    }
  });

  it("정방향 전진(랩 전까지 단조 증가)", () => {
    const t0 = advanceParticlePhase(0.1, 0.016, 0.075);
    expect(t0).toBeGreaterThan(0.1);
  });

  it("1 을 넘으면 랩 어라운드", () => {
    const t = advanceParticlePhase(0.98, 0.5, 0.075); // 0.98 + 0.0375 = 1.0175 → 0.0175
    expect(t).toBeCloseTo(0.0175, 6);
  });

  it("음수 speed 방어 — [0,1) 유지", () => {
    const t = advanceParticlePhase(0.02, 0.5, -0.075); // 0.02 - 0.0375 = -0.0175 → 0.9825
    expect(t).toBeGreaterThanOrEqual(0);
    expect(t).toBeLessThan(1);
    expect(t).toBeCloseTo(0.9825, 6);
  });
});

describe("updateParticles", () => {
  const makeEdges = (): ParticleEdge[] => [
    { kind: "depends", t: 0.1, sourceId: "a", targetId: "b" },
    { kind: "contains", t: 0.1, sourceId: "a", targetId: "c" },
    { kind: "depends", t: 0.9, sourceId: "b", targetId: "c" },
  ];

  it("depends 엣지만 전진, contains 는 불변", () => {
    const edges = makeEdges();
    updateParticles(edges, 0.016, false, () => 0.075);
    expect(edges[0].t).toBeGreaterThan(0.1); // depends advances
    expect(edges[1].t).toBe(0.1); // contains does not
  });

  it("reduced-motion 이면 아무 것도 전진하지 않는다(정지)", () => {
    const edges = makeEdges();
    updateParticles(edges, 0.016, true, () => 0.075);
    expect(edges[0].t).toBe(0.1);
    expect(edges[2].t).toBe(0.9);
  });

  it("speedOf 로 엣지별 속도 — 0 이면 그 엣지는 정지", () => {
    const edges = makeEdges();
    updateParticles(edges, 0.016, false, (e) => (e.sourceId === "a" ? 0 : 0.2));
    expect(edges[0].t).toBe(0.1); // speed 0 → stationary
    expect(edges[2].t).not.toBe(0.9); // speed 0.2 → advances
  });

  it("처방 E — isEgoContainsEligible 이 true 인 contains 엣지는 depends 처럼 전진한다", () => {
    const edges = makeEdges();
    updateParticles(
      edges,
      0.016,
      false,
      () => 0.075,
      (e) => e.kind === "contains" && e.sourceId === "a" && e.targetId === "c",
    );
    expect(edges[1].t).toBeGreaterThan(0.1); // an eligible contains edge now advances too
  });

  it("처방 E — isEgoContainsEligible 이 false 인 contains 는 여전히 불변", () => {
    const edges = makeEdges();
    updateParticles(edges, 0.016, false, () => 0.075, () => false);
    expect(edges[1].t).toBe(0.1);
  });

  it("처방 E — 인자 생략 시 기존 계약(contains 항상 불변) 유지", () => {
    const edges = makeEdges();
    updateParticles(edges, 0.016, false, () => 0.075);
    expect(edges[1].t).toBe(0.1);
  });
});

describe("edgePairKey", () => {
  it("source target 순서로 조인한다", () => {
    expect(edgePairKey("a", "b")).toBe("a b");
  });
});

describe("selectEgoContainsComets", () => {
  const edges = [
    { sourceId: "hub", targetId: "x1" },
    { sourceId: "hub", targetId: "x2" },
    { sourceId: "hub", targetId: "x3" },
  ];

  it("결정론 — 같은 입력은 같은 결과(seed 랭크)", () => {
    const a = selectEgoContainsComets(edges);
    const b = selectEgoContainsComets(edges);
    expect([...a].sort()).toEqual([...b].sort());
  });

  it("limit 미만이면 전부 포함", () => {
    const selected = selectEgoContainsComets(edges, 24);
    expect(selected.size).toBe(3);
    for (const e of edges) expect(selected.has(edgePairKey(e.sourceId, e.targetId))).toBe(true);
  });

  it("limit 초과분은 seed 순 상위만 선택 — 총 개수는 limit 을 넘지 않는다", () => {
    const many = Array.from({ length: 40 }, (_, i) => ({ sourceId: "hub", targetId: `n${i}` }));
    const selected = selectEgoContainsComets(many, EGO_CONTAINS_COMET_LIMIT);
    expect(selected.size).toBe(EGO_CONTAINS_COMET_LIMIT);
  });

  it("기본 limit = EGO_CONTAINS_COMET_LIMIT(24)", () => {
    const many = Array.from({ length: 40 }, (_, i) => ({ sourceId: "hub", targetId: `n${i}` }));
    expect(selectEgoContainsComets(many).size).toBe(24);
  });

  it("빈 입력은 빈 Set", () => {
    expect(selectEgoContainsComets([]).size).toBe(0);
  });
});

describe("edgePairMeta — 캐시가 원본 함수와 같은 값을 낸다 (perf 2026-08-19)", () => {
  it("seed 와 key 가 fireflySeed/edgePairKey 와 동일하고, 같은 객체엔 같은 메타를 재사용한다", () => {
    const edge = { sourceId: "kind:alpha", targetId: "kind:beta" };
    const meta = edgePairMeta(edge);
    expect(meta.seed).toBe(fireflySeed(edge.sourceId, edge.targetId));
    expect(meta.key).toBe(edgePairKey(edge.sourceId, edge.targetId));
    expect(edgePairMeta(edge)).toBe(meta); // WeakMap cache hit
  });
});

describe("rankCometEdges 재구현 파리티 — 종전 비교자(seed→key 사전순)와 원소까지 동일", () => {
  /** Reference implementation, transcribed verbatim from the code before the cache. */
  const reference = (edges: readonly { sourceId: string; targetId: string }[], limit: number): Set<string> => {
    const ranked = [...edges].sort((a, b) => {
      const seedDiff = fireflySeed(a.sourceId, a.targetId) - fireflySeed(b.sourceId, b.targetId);
      if (seedDiff !== 0) return seedDiff;
      const ka = edgePairKey(a.sourceId, a.targetId);
      const kb = edgePairKey(b.sourceId, b.targetId);
      return ka < kb ? -1 : ka > kb ? 1 : 0;
    });
    return new Set(ranked.slice(0, Math.max(0, limit)).map((e) => edgePairKey(e.sourceId, e.targetId)));
  };

  it("400개 결정론 픽스처에서 컷 안 원소가 참조판과 완전히 같다", () => {
    const edges = Array.from({ length: 400 }, (_, i) => ({
      sourceId: `node:${(i * 37) % 97}`,
      targetId: `node:${(i * 61) % 89}-t`,
    }));
    for (const limit of [0, 1, 24, 400]) {
      const got = selectEgoContainsComets(edges, limit);
      const want = reference(edges, limit);
      expect([...got].sort()).toEqual([...want].sort());
    }
  });
});

describe("spawnHoverPulses", () => {
  const edges = [
    { sourceId: "hub", targetId: "x" },
    { sourceId: "y", targetId: "hub" },
    { sourceId: "p", targetId: "q" }, // does not touch the hub
  ];

  it("호버 노드에 닿는 엣지마다 펄스 하나", () => {
    const pulses = spawnHoverPulses("hub", edges, 1000, false);
    expect(pulses).toHaveLength(2);
  });

  it("방향 — 호버 노드가 source 면 +1, target 이면 -1(바깥 방향)", () => {
    const pulses = spawnHoverPulses("hub", edges, 1000, false);
    expect(pulses.find((p) => p.targetId === "x")?.dir).toBe(1); // hub=source
    expect(pulses.find((p) => p.sourceId === "y")?.dir).toBe(-1); // hub=target
  });

  it("t0 = 발사 시각", () => {
    const pulses = spawnHoverPulses("hub", edges, 4242, false);
    expect(pulses.every((p) => p.t0 === 4242)).toBe(true);
  });

  it("reduced-motion 이면 발사 0", () => {
    expect(spawnHoverPulses("hub", edges, 1000, true)).toHaveLength(0);
  });
});

describe("updatePulses", () => {
  const pulses: Pulse[] = [
    { sourceId: "a", targetId: "b", dir: 1, t0: 0 },
    { sourceId: "c", targetId: "d", dir: -1, t0: 500 },
  ];

  it("수명 지난 펄스 제거", () => {
    // now=600 → the first has run 600 > 420 (expired), the second 100 < 420 (alive)
    const alive = updatePulses(pulses, 600);
    expect(alive).toHaveLength(1);
    expect(alive[0].t0).toBe(500);
  });

  it("전부 살아있으면 입력 배열 그대로(할당 회피)", () => {
    const alive = updatePulses(pulses, 100);
    expect(alive).toBe(pulses);
  });

  it("전부 만료되면 빈 배열", () => {
    expect(updatePulses(pulses, 10000)).toHaveLength(0);
  });

  it("빈 입력은 그대로", () => {
    const empty: Pulse[] = [];
    expect(updatePulses(empty, 1000)).toBe(empty);
  });

  it("수명 = PULSE_DURATION_MS 경계", () => {
    const at: Pulse[] = [{ sourceId: "a", targetId: "b", dir: 1, t0: 0 }];
    expect(updatePulses(at, PULSE_DURATION_MS - 1)).toHaveLength(1);
    expect(updatePulses(at, PULSE_DURATION_MS)).toHaveLength(0);
  });
});

describe("pulseScale / pulseHeadTrail", () => {
  it("크기는 raw 증가에 따라 축소, 하한 0.35", () => {
    expect(pulseScale(0)).toBe(1);
    expect(pulseScale(0.5)).toBeCloseTo(0.5, 6);
    expect(pulseScale(1)).toBe(0.35); // max(0.35, 0)
  });

  it("순방향(dir=1): head=raw, trail=head-lag", () => {
    const { head, trail } = pulseHeadTrail(1, 0.5);
    expect(head).toBe(0.5);
    expect(trail).toBeCloseTo(0.5 - PULSE_TRAIL_LAG, 6);
  });

  it("역방향(dir=-1): head=1-raw, trail=head+lag", () => {
    const { head, trail } = pulseHeadTrail(-1, 0.2);
    expect(head).toBeCloseTo(0.8, 6);
    expect(trail).toBeCloseTo(0.8 + PULSE_TRAIL_LAG, 6);
  });

  it("트레일이 [0,1] 밖이면 null(순방향 시작 직후)", () => {
    const { trail } = pulseHeadTrail(1, 0); // head 0, trail -0.05
    expect(trail).toBeNull();
  });
});
