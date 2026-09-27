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
  type EgoNeighborRankEntry, egoRestSink } from "./focus-state";

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
    expect(isNodeEmphasisActive("b", "a", true, null)).toBe(false);
  });

  it("lets the panel-designated neighbor ramp under focus (panel↔map linkage)", () => {
    expect(isNodeEmphasisActive("b", "a", false, "b")).toBe(true);
    expect(isNodeEmphasisActive("c", "a", true, "b")).toBe(false);
  });
});

describe("scheduleRipple", () => {
  /**
   * Uncapped, a 40-neighbour hub started its last neighbour far later than a low-degree
   * node finished, an enumeration rather than a ripple; one interaction, one motion.
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

describe("stepFocusRamp (click focus colour ramp)", () => {
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

describe("edge pair focus (selecting a line focuses its pair)", () => {
  const pair = { sourceId: "a", targetId: "b" };

  it("with only a pair and no node focus, the ends are neighbor and the rest dim", () => {
    expect(resolveNodeEgoStateWithPair("a", null, new Set(), pair)).toBe("neighbor");
    expect(resolveNodeEgoStateWithPair("b", null, new Set(), pair)).toBe("neighbor");
    expect(resolveNodeEgoStateWithPair("c", null, new Set(), pair)).toBe("dim");
  });

  it("node focus takes precedence over the pair, keeping the ego rule (click is safe)", () => {
    expect(resolveNodeEgoStateWithPair("x", "x", new Set(["y"]), pair)).toBe("center");
    expect(resolveNodeEgoStateWithPair("a", "x", new Set(["y"]), pair)).toBe("dim");
  });

  it("only the selected edge of the pair is ego, other edges dim; without a pair the plain rule holds", () => {
    expect(resolveEdgeEgoStateWithPair(false, null, pair, true)).toBe("ego");
    expect(resolveEdgeEgoStateWithPair(false, null, pair, false)).toBe("dim");
    expect(resolveEdgeEgoStateWithPair(true, "x", pair, false)).toBe("ego");
    expect(resolveEdgeEgoStateWithPair(false, null, null, false)).toBe("normal");
  });
});

describe("resolveTrailLensNodeEgoState (walked trail lens)", () => {
  const trail = new Set(["domain:core", "capability:x", "element:y"]);

  it("keeps visited nodes normal and dims the rest", () => {
    expect(resolveTrailLensNodeEgoState("domain:core", "element:y", trail)).toBe("normal");
    expect(resolveTrailLensNodeEgoState("capability:x", "element:y", trail)).toBe("normal");
    expect(resolveTrailLensNodeEgoState("domain:other", "element:y", trail)).toBe("dim");
  });

  it("keeps the focused node center, so the selection ring hierarchy holds", () => {
    expect(resolveTrailLensNodeEgoState("element:y", "element:y", trail)).toBe("center");
  });

  it("dims an unvisited neighbour, which is no longer in the keep set", () => {
    // The keep set swaps wholesale from 1-hop neighbours to visited nodes.
    expect(resolveTrailLensNodeEgoState("capability:neighbor-of-y", "element:y", trail)).toBe("dim");
  });

  it("separates visited from unvisited even without focus (after an empty-canvas click)", () => {
    expect(resolveTrailLensNodeEgoState("capability:x", null, trail)).toBe("normal");
    expect(resolveTrailLensNodeEgoState("domain:other", null, trail)).toBe("dim");
  });
});

describe("rankEgoNeighborsByDOI", () => {
  it("orders by kind weight (domain, capability, element), then degree descending, then slug, deterministically", () => {
    const neighbors: EgoNeighborRankEntry[] = [
      { id: "el-b", kind: "element", degree: 9 },
      { id: "cap-hi", kind: "capability", degree: 5 },
      { id: "cap-lo", kind: "capability", degree: 2 },
      { id: "dom", kind: "domain", degree: 1 },
      { id: "el-a", kind: "element", degree: 9 },
    ];
    const ranked = rankEgoNeighborsByDOI(neighbors);
    expect(ranked).toEqual(["dom", "cap-hi", "cap-lo", "el-a", "el-b"]);
    expect(rankEgoNeighborsByDOI([...neighbors].reverse())).toEqual(ranked);
  });

  it("breaks a same-kind same-degree tie by relation type: contains, then depends, then relates", () => {
    // Slugs run opposite to the relation hierarchy, so slug order alone cannot pass.
    const neighbors: EgoNeighborRankEntry[] = [
      { id: "el-a", kind: "element", degree: 4, relationType: "relates" },
      { id: "el-b", kind: "element", degree: 4, relationType: "depends_on" },
      { id: "el-c", kind: "element", degree: 4, relationType: "contains" },
      { id: "el-d", kind: "element", degree: 4, relationType: "belongs_to" },
    ];
    const ranked = rankEgoNeighborsByDOI(neighbors);
    expect(ranked).toEqual(["el-c", "el-d", "el-b", "el-a"]);
    expect(rankEgoNeighborsByDOI([...neighbors].reverse())).toEqual(ranked);
  });

  it("ranks kind weight above relation type: domain-relates precedes element-contains", () => {
    const neighbors: EgoNeighborRankEntry[] = [
      { id: "el-contains", kind: "element", degree: 99, relationType: "contains" },
      { id: "dom-relates", kind: "domain", degree: 0, relationType: "relates" },
      { id: "cap-relates", kind: "capability", degree: 0, relationType: "relates" },
    ];
    expect(rankEgoNeighborsByDOI(neighbors)).toEqual(["dom-relates", "cap-relates", "el-contains"]);
  });

  it("ranks relation type above degree: a low-degree contains child precedes a high-degree relates neighbour", () => {
    const neighbors: EgoNeighborRankEntry[] = [
      { id: "el-relates-hub", kind: "element", degree: 40, relationType: "relates" },
      { id: "el-contains-leaf", kind: "element", degree: 1, relationType: "contains" },
    ];
    expect(rankEgoNeighborsByDOI(neighbors)).toEqual(["el-contains-leaf", "el-relates-hub"]);
  });

  it("weights an omitted relationType as 1, keeping the order of existing callers such as layout", () => {
    const neighbors: EgoNeighborRankEntry[] = [
      { id: "el-unknown", kind: "element", degree: 4 },
      { id: "el-relates", kind: "element", degree: 4, relationType: "relates" },
      { id: "el-exotic", kind: "element", degree: 4, relationType: "describes" },
    ];
    expect(rankEgoNeighborsByDOI(neighbors)).toEqual(["el-exotic", "el-relates", "el-unknown"]);
  });
});

describe("selectiveEgoNeighbors", () => {
  const ids = Array.from({ length: 60 }, (_, i) => `n${String(i).padStart(2, "0")}`);

  it("shows only the top limit in batch 1 and hides the rest", () => {
    const r = selectiveEgoNeighbors(ids, 1);
    expect(r.visibleNeighbors.size).toBe(EGO_NEIGHBOR_LIMIT);
    expect(r.hiddenCount).toBe(60 - EGO_NEIGHBOR_LIMIT);
    expect(r.visibleNeighbors.has("n00")).toBe(true);
    expect(r.hiddenNeighbors.has("n59")).toBe(true);
  });

  it("lights the next limit as batches grow, with hiddenCount 0 once all are lit", () => {
    expect(selectiveEgoNeighbors(ids, 2).visibleNeighbors.size).toBe(48);
    expect(selectiveEgoNeighbors(ids, 3).hiddenCount).toBe(0);
    expect(selectiveEgoNeighbors(ids, 9).hiddenCount).toBe(0);
  });
});

describe("clusterMoreChipId / parseClusterMoreChipId (batched reveal of high fan-out)", () => {
  it("wraps the real parent id in the reserved prefix and restores it (round trip)", () => {
    const wrapped = clusterMoreChipId("domain-onboarding");
    expect(wrapped).toBe(`${CLUSTER_MORE_CHIP_PREFIX}domain-onboarding`);
    expect(parseClusterMoreChipId(wrapped)).toBe("domain-onboarding");
  });

  it("returns null for a non-synthetic id, so real node and ego chip ids never reach the batch branch", () => {
    expect(parseClusterMoreChipId("domain-onboarding")).toBeNull();
    expect(parseClusterMoreChipId("__ego_neighbors__")).toBeNull();
    expect(parseClusterMoreChipId("")).toBeNull();
  });

  it("round-trips an empty parent id with the prefix alone (edge case)", () => {
    expect(parseClusterMoreChipId(clusterMoreChipId(""))).toBe("");
  });
});

describe("egoRestSink", () => {
  it("rides the focus ramp from 1 down to the rest alpha, clamped", () => {
    expect(egoRestSink(0, 0.42)).toBe(1);
    expect(egoRestSink(1, 0.42)).toBeCloseTo(0.42, 9);
    expect(egoRestSink(0.5, 0.42)).toBeCloseTo(0.71, 9);
    expect(egoRestSink(-1, 0.42)).toBe(1);
    expect(egoRestSink(3, 0.42)).toBeCloseTo(0.42, 9);
  });
});
