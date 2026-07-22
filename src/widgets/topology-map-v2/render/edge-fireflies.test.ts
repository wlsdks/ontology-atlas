import { describe, expect, it } from "vitest";

import {
  advanceParticlePhase,
  fireflySeed,
  PULSE_DURATION_MS,
  PULSE_TRAIL_LAG,
  pulseHeadTrail,
  pulseScale,
  spawnHoverPulses,
  updateParticles,
  updatePulses,
  type ParticleEdge,
  type Pulse,
} from "./edge-fireflies";

/**
 * R6 상시 혜성 + 호버 펄스의 순수 계약 — 위상 전진 결정론, reduced-motion
 * 정지, 펄스 수명/방향. 실제 픽셀 드로우는 :3107 실화면에서 메인 세션이 검증.
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
    expect(edges[0].t).toBeGreaterThan(0.1); // depends 전진
    expect(edges[1].t).toBe(0.1); // contains 불변
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
    expect(edges[0].t).toBe(0.1); // speed 0 → 정지
    expect(edges[2].t).not.toBe(0.9); // speed 0.2 → 전진
  });
});

describe("spawnHoverPulses", () => {
  const edges = [
    { sourceId: "hub", targetId: "x" },
    { sourceId: "y", targetId: "hub" },
    { sourceId: "p", targetId: "q" }, // hub 미포함
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
    // now=600 → 첫째 경과 600 > 420(만료), 둘째 경과 100 < 420(생존)
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
