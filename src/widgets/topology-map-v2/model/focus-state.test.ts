import { describe, expect, it } from "vitest";

import {
  clusterMoreChipId,
  CLUSTER_MORE_CHIP_PREFIX,
  EGO_NEIGHBOR_LIMIT,
  isNodeEmphasisActive,
  parseClusterMoreChipId,
  rankEgoNeighborsByDOI,
  resolveEdgeEgoState,
  resolveEdgeEgoStateWithPair,
  resolveEdgePulseSpeed,
  resolveNodeEgoState,
  resolveNodeEgoStateWithPair,
  resolveTrailLensNodeEgoState,
  scheduleRipple,
  selectiveEgoNeighbors,
  stepEmphasis,
  stepFocusRamp,
  type EgoNeighborRankEntry,
} from "./focus-state";

describe("resolveNodeEgoState", () => {
  it("is normal for every node when there is no focus", () => {
    expect(resolveNodeEgoState("a", null, new Set())).toBe("normal");
  });

  it("is center for the focused node itself", () => {
    expect(resolveNodeEgoState("a", "a", new Set(["b", "c"]))).toBe("center");
  });

  it("is neighbor for a 1-hop neighbor of the focused node", () => {
    expect(resolveNodeEgoState("b", "a", new Set(["b", "c"]))).toBe("neighbor");
  });

  it("is dim for any other node while a focus is active", () => {
    expect(resolveNodeEgoState("z", "a", new Set(["b", "c"]))).toBe("dim");
  });
});

describe("resolveEdgeEgoState", () => {
  it("is normal when there is no focus", () => {
    expect(resolveEdgeEgoState(true, null)).toBe("normal");
    expect(resolveEdgeEgoState(false, null)).toBe("normal");
  });

  it("is ego when the edge touches the focused node", () => {
    expect(resolveEdgeEgoState(true, "a")).toBe("ego");
  });

  it("is dim when the edge does not touch the focused node", () => {
    expect(resolveEdgeEgoState(false, "a")).toBe("dim");
  });
});

describe("resolveEdgePulseSpeed", () => {
  const BASE = 0.075;
  const EGO = 0.2;

  it("keeps the ambient base speed when there is no focus", () => {
    expect(resolveEdgePulseSpeed(true, null, BASE, EGO)).toBe(BASE);
    expect(resolveEdgePulseSpeed(false, null, BASE, EGO)).toBe(BASE);
  });

  it("accelerates to the ego speed for an edge touching the focused node", () => {
    expect(resolveEdgePulseSpeed(true, "a", BASE, EGO)).toBe(EGO);
  });

  it("keeps the base speed for an edge not touching the focused node", () => {
    expect(resolveEdgePulseSpeed(false, "a", BASE, EGO)).toBe(BASE);
  });
});

describe("isNodeEmphasisActive", () => {
  it("follows the hover ego-set membership when there is no focus", () => {
    expect(isNodeEmphasisActive("b", null, true, null)).toBe(true);
    expect(isNodeEmphasisActive("z", null, false, null)).toBe(false);
  });

  it("suppresses hover emphasis while a focus is active", () => {
    // b is a live hover ego-member, but focus owns attention -> suppressed
    expect(isNodeEmphasisActive("b", "a", true, null)).toBe(false);
  });

  it("lets the panel-designated neighbor ramp under focus (panel↔map linkage)", () => {
    expect(isNodeEmphasisActive("b", "a", false, "b")).toBe(true);
    expect(isNodeEmphasisActive("c", "a", true, "b")).toBe(false);
  });
});

describe("scheduleRipple", () => {
  /**
   * A7 — total stagger budget. Uncapped, a 40-neighbor hub started its last
   * neighbor 523ms in (an enumeration, not a ripple) while a low-degree node
   * finished in ~91ms. Same interaction, same motion signature.
   */
  it("compresses the per-neighbor delay so a hub's ripple ends inside the budget", () => {
    const neighbors = Array.from({ length: 40 }, (_, i) => `n${i}`);
    const schedule = scheduleRipple("hub", 1000, neighbors, 55, 12, 180);
    const last = schedule[schedule.length - 1];
    expect(last.startAtMs - 1000).toBeLessThanOrEqual(55 + 180);
  });

  it("leaves low-degree ripples untouched (12ms/neighbor is already under budget)", () => {
    const schedule = scheduleRipple("node", 1000, ["a", "b", "c"], 55, 12, 180);
    expect(schedule[3].startAtMs).toBe(1000 + 55 + 2 * 12);
  });

  it("schedules the hovered node itself to start immediately", () => {
    const schedule = scheduleRipple("hub", 1000, ["n1", "n2"], 55, 12);
    const own = schedule.find((s) => s.nodeId === "hub");
    expect(own?.startAtMs).toBe(1000);
  });

  it("staggers neighbors by baseDelay + index*perNeighborDelay", () => {
    const schedule = scheduleRipple("hub", 1000, ["n1", "n2", "n3"], 55, 12);
    expect(schedule.find((s) => s.nodeId === "n1")?.startAtMs).toBe(1000 + 55 + 0 * 12);
    expect(schedule.find((s) => s.nodeId === "n2")?.startAtMs).toBe(1000 + 55 + 1 * 12);
    expect(schedule.find((s) => s.nodeId === "n3")?.startAtMs).toBe(1000 + 55 + 2 * 12);
  });

  it("returns one schedule entry per neighbor plus the origin node", () => {
    const schedule = scheduleRipple("hub", 0, ["n1", "n2"], 55, 12);
    expect(schedule).toHaveLength(3);
  });
});

describe("stepEmphasis", () => {
  const RISE_TAU = 0.09;
  const DECAY_TAU = 0.15;

  it("rises toward 1 when active and the ripple has started", () => {
    // emphasis += (1 - 0) * (1 - exp(-dt/riseTau)); dt = riseTau -> factor = 1 - exp(-1) ≈ 0.6321206
    const next = stepEmphasis(0, true, true, RISE_TAU, RISE_TAU, DECAY_TAU);
    expect(next).toBeCloseTo(0.6321206, 5);
  });

  it("does not move while active but the ripple has not started yet", () => {
    const next = stepEmphasis(0.2, true, false, 0.05, RISE_TAU, DECAY_TAU);
    expect(next).toBe(0.2);
  });

  it("decays toward 0 when not in the active ego-set, regardless of ripple state", () => {
    // emphasis += (0 - 0.8) * (1 - exp(-dt/decayTau)); dt = decayTau -> factor ≈ 0.6321206
    // next = 0.8 - 0.8*0.6321206 = 0.8*(1-0.6321206) = 0.8*0.3678794 ≈ 0.2943035
    const next = stepEmphasis(0.8, false, false, DECAY_TAU, RISE_TAU, DECAY_TAU);
    expect(next).toBeCloseTo(0.2943035, 5);
  });

  it("stays within [0, 1] and approaches its asymptote over many steps", () => {
    let emphasis = 0;
    for (let i = 0; i < 240; i += 1) {
      emphasis = stepEmphasis(emphasis, true, true, 1 / 60, RISE_TAU, DECAY_TAU);
    }
    expect(emphasis).toBeGreaterThan(0.99);
    expect(emphasis).toBeLessThanOrEqual(1);
  });
});

describe("stepFocusRamp (클릭 포커스 색 램프)", () => {
  const TAU = 0.16;

  it("rises toward 1 while a focus is active", () => {
    // dt = tau -> factor = 1 - exp(-1) ≈ 0.6321206
    expect(stepFocusRamp(0, true, TAU, TAU)).toBeCloseTo(0.6321206, 5);
  });

  it("falls toward 0 when no focus is active, symmetric with the rise", () => {
    // from 1: next = 1 + (0 - 1) * 0.6321206 = 0.3678794
    expect(stepFocusRamp(1, false, TAU, TAU)).toBeCloseTo(0.3678794, 5);
  });

  it("stays within [0,1] and settles near 1 over many active steps", () => {
    let ramp = 0;
    for (let i = 0; i < 120; i += 1) ramp = stepFocusRamp(ramp, true, 1 / 60, TAU);
    expect(ramp).toBeGreaterThan(0.99);
    expect(ramp).toBeLessThanOrEqual(1);
  });

  it("decays back to ~0 over many inactive steps (deselect fade-out)", () => {
    let ramp = 1;
    for (let i = 0; i < 120; i += 1) ramp = stepFocusRamp(ramp, false, 1 / 60, TAU);
    expect(ramp).toBeLessThan(0.01);
    expect(ramp).toBeGreaterThanOrEqual(0);
  });
});

describe("edge pair focus (선 선택 = 페어 포커스)", () => {
  const pair = { sourceId: "a", targetId: "b" };

  it("노드 포커스 없이 페어만 있으면 양끝=neighbor, 나머지=dim", () => {
    expect(resolveNodeEgoStateWithPair("a", null, new Set(), pair)).toBe("neighbor");
    expect(resolveNodeEgoStateWithPair("b", null, new Set(), pair)).toBe("neighbor");
    expect(resolveNodeEgoStateWithPair("c", null, new Set(), pair)).toBe("dim");
  });

  it("노드 포커스가 있으면 기존 ego 규칙이 우선한다 (클릭=안전 계약)", () => {
    expect(resolveNodeEgoStateWithPair("x", "x", new Set(["y"]), pair)).toBe("center");
    expect(resolveNodeEgoStateWithPair("a", "x", new Set(["y"]), pair)).toBe("dim");
  });

  it("페어 중 선택 엣지만 ego, 다른 엣지는 dim; 페어 없으면 종전 규칙", () => {
    expect(resolveEdgeEgoStateWithPair(false, null, pair, true)).toBe("ego");
    expect(resolveEdgeEgoStateWithPair(false, null, pair, false)).toBe("dim");
    expect(resolveEdgeEgoStateWithPair(true, "x", pair, false)).toBe("ego");
    expect(resolveEdgeEgoStateWithPair(false, null, null, false)).toBe("normal");
  });
});

describe("resolveTrailLensNodeEgoState (걸어온 길 렌즈)", () => {
  const trail = new Set(["domain:core", "capability:x", "element:y"]);

  it("방문 노드는 값을 지키고(normal) 나머지는 기존 dim 으로 물러난다", () => {
    expect(resolveTrailLensNodeEgoState("domain:core", "element:y", trail)).toBe("normal");
    expect(resolveTrailLensNodeEgoState("capability:x", "element:y", trail)).toBe("normal");
    expect(resolveTrailLensNodeEgoState("domain:other", "element:y", trail)).toBe("dim");
  });

  it("현재 포커스 노드는 center 로 남아 선택 링 위계가 불변이다", () => {
    expect(resolveTrailLensNodeEgoState("element:y", "element:y", trail)).toBe("center");
  });

  it("이웃(관계)은 더 이상 keep-set 이 아니다 — 방문하지 않았으면 dim", () => {
    // 렌즈의 핵심: keep-set 이 "1-hop 이웃"에서 "방문 노드"로 통째로 바뀐다.
    expect(resolveTrailLensNodeEgoState("capability:neighbor-of-y", "element:y", trail)).toBe("dim");
  });

  it("포커스가 없어도(빈 캔버스 클릭 후) 방문/비방문 구분은 그대로 선다", () => {
    expect(resolveTrailLensNodeEgoState("capability:x", null, trail)).toBe("normal");
    expect(resolveTrailLensNodeEgoState("domain:other", null, trail)).toBe("dim");
  });
});

describe("rankEgoNeighborsByDOI (S2 파트 3a)", () => {
  it("kind 가중치(domain>capability>element) → degree 내림차순 → slug 사전순, 결정론", () => {
    const neighbors: EgoNeighborRankEntry[] = [
      { id: "el-b", kind: "element", degree: 9 },
      { id: "cap-hi", kind: "capability", degree: 5 },
      { id: "cap-lo", kind: "capability", degree: 2 },
      { id: "dom", kind: "domain", degree: 1 },
      { id: "el-a", kind: "element", degree: 9 }, // degree 동률 → slug 사전순 el-a < el-b
    ];
    const ranked = rankEgoNeighborsByDOI(neighbors);
    expect(ranked).toEqual(["dom", "cap-hi", "cap-lo", "el-a", "el-b"]);
    // 결정론: 재실행해도 동일.
    expect(rankEgoNeighborsByDOI([...neighbors].reverse())).toEqual(ranked);
  });

  it("같은 kind·같은 degree 면 관계 타입 위계가 가른다 — contains > depends > relates", () => {
    // slug 를 관계 위계와 **역순**으로 배치 — slug 사전순만으로는 이 기대
    // 순서가 절대 안 나오게 해 관계 가중치 자체를 못박는다.
    const neighbors: EgoNeighborRankEntry[] = [
      { id: "el-a", kind: "element", degree: 4, relationType: "relates" },
      { id: "el-b", kind: "element", degree: 4, relationType: "depends_on" },
      { id: "el-c", kind: "element", degree: 4, relationType: "contains" },
      { id: "el-d", kind: "element", degree: 4, relationType: "belongs_to" },
    ];
    const ranked = rankEgoNeighborsByDOI(neighbors);
    // contains/belongs_to(3, 동가중치 → slug 사전순) > depends_on(2) > relates(1).
    expect(ranked).toEqual(["el-c", "el-d", "el-b", "el-a"]);
    // 결정론: 입력 순서 무관.
    expect(rankEgoNeighborsByDOI([...neighbors].reverse())).toEqual(ranked);
  });

  it("kind 가중치가 관계 타입보다 우선한다 — domain-relates 가 element-contains 를 앞선다", () => {
    const neighbors: EgoNeighborRankEntry[] = [
      { id: "el-contains", kind: "element", degree: 99, relationType: "contains" },
      { id: "dom-relates", kind: "domain", degree: 0, relationType: "relates" },
      { id: "cap-relates", kind: "capability", degree: 0, relationType: "relates" },
    ];
    expect(rankEgoNeighborsByDOI(neighbors)).toEqual(["dom-relates", "cap-relates", "el-contains"]);
  });

  it("관계 타입이 degree 보다 우선한다 — 저차수 contains 자식이 고차수 relates 이웃을 앞선다", () => {
    const neighbors: EgoNeighborRankEntry[] = [
      { id: "el-relates-hub", kind: "element", degree: 40, relationType: "relates" },
      { id: "el-contains-leaf", kind: "element", degree: 1, relationType: "contains" },
    ];
    expect(rankEgoNeighborsByDOI(neighbors)).toEqual(["el-contains-leaf", "el-relates-hub"]);
  });

  it("relationType 미상(생략)은 가중치 1 — 레이아웃 등 기존 호출부의 순서를 바꾸지 않는다", () => {
    const neighbors: EgoNeighborRankEntry[] = [
      { id: "el-unknown", kind: "element", degree: 4 },
      { id: "el-relates", kind: "element", degree: 4, relationType: "relates" },
      { id: "el-exotic", kind: "element", degree: 4, relationType: "describes" },
    ];
    // 셋 다 가중치 1 → degree 동률 → slug 사전순.
    expect(rankEgoNeighborsByDOI(neighbors)).toEqual(["el-exotic", "el-relates", "el-unknown"]);
  });
});

describe("selectiveEgoNeighbors (S2 파트 3a)", () => {
  const ids = Array.from({ length: 60 }, (_, i) => `n${String(i).padStart(2, "0")}`);

  it("배치 1 = 상위 limit 만 visible, 나머지 hidden", () => {
    const r = selectiveEgoNeighbors(ids, 1);
    expect(r.visibleNeighbors.size).toBe(EGO_NEIGHBOR_LIMIT);
    expect(r.hiddenCount).toBe(60 - EGO_NEIGHBOR_LIMIT);
    expect(r.visibleNeighbors.has("n00")).toBe(true);
    expect(r.hiddenNeighbors.has("n59")).toBe(true);
  });

  it("배치가 늘면 다음 limit 개가 추가 점등, 전부 점등되면 hiddenCount 0", () => {
    expect(selectiveEgoNeighbors(ids, 2).visibleNeighbors.size).toBe(48);
    expect(selectiveEgoNeighbors(ids, 3).hiddenCount).toBe(0);
    expect(selectiveEgoNeighbors(ids, 9).hiddenCount).toBe(0);
  });
});

describe("clusterMoreChipId / parseClusterMoreChipId (고팬아웃 배치-공개)", () => {
  it("실제 부모 id 를 예약 접두어로 감싸고 다시 원복한다(왕복)", () => {
    const wrapped = clusterMoreChipId("domain-onboarding");
    expect(wrapped).toBe(`${CLUSTER_MORE_CHIP_PREFIX}domain-onboarding`);
    expect(parseClusterMoreChipId(wrapped)).toBe("domain-onboarding");
  });

  it("합성 id 가 아니면 null — 실제 노드 id/ego 칩 id 는 배치 분기로 새지 않는다", () => {
    expect(parseClusterMoreChipId("domain-onboarding")).toBeNull();
    expect(parseClusterMoreChipId("__ego_neighbors__")).toBeNull();
    expect(parseClusterMoreChipId("")).toBeNull();
  });

  it("빈 부모 id 도 접두어만으로 왕복(경계)", () => {
    expect(parseClusterMoreChipId(clusterMoreChipId(""))).toBe("");
  });
});
