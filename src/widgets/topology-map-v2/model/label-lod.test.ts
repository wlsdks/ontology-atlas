import { describe, expect, it } from "vitest";

import {
  DISC_LABEL_TOP_K,
  LABEL_TOP_K,
  isEgoNeighborLabelExempt,
  selectDiscLabelEligible,
  selectTopKLabels,
  type LabelRankEntry,
} from "./label-lod";

const entry = (id: string, degree: number, exempt = false): LabelRankEntry => ({ id, degree, exempt });

describe("selectTopKLabels", () => {
  it("keeps the top-K non-exempt entries by degree (descending)", () => {
    const entries = [entry("a", 1), entry("b", 9), entry("c", 5), entry("d", 3)];
    const allowed = selectTopKLabels(entries, 2);
    expect([...allowed].sort()).toEqual(["b", "c"]);
  });

  it("breaks degree ties by id ascending (deterministic)", () => {
    const entries = [entry("zeta", 5), entry("alpha", 5), entry("mid", 5)];
    // K=2 with a three-way tie → the two lexicographically-first ids.
    expect([...selectTopKLabels(entries, 2)].sort()).toEqual(["alpha", "mid"]);
  });

  it("is order-independent given the same entries (determinism)", () => {
    const a = selectTopKLabels([entry("a", 5), entry("b", 5), entry("c", 5)], 2);
    const b = selectTopKLabels([entry("c", 5), entry("b", 5), entry("a", 5)], 2);
    expect([...a].sort()).toEqual([...b].sort());
    expect([...a].sort()).toEqual(["a", "b"]);
  });

  it("always keeps exempt entries regardless of their degree", () => {
    const entries = [entry("hub", 9), entry("leaf", 0, true), entry("filler", 4)];
    const allowed = selectTopKLabels(entries, 1);
    // K=1 → the top non-exempt is "hub"; the low-degree exempt "leaf" is kept too.
    expect(allowed.has("hub")).toBe(true);
    expect(allowed.has("leaf")).toBe(true);
    expect(allowed.has("filler")).toBe(false);
  });

  it("does not let exempt entries consume the K budget", () => {
    const entries = [
      entry("focus", 9, true),
      entry("n1", 8),
      entry("n2", 7),
      entry("n3", 6),
    ];
    // K=2 keeps the 2 top non-exempt (n1,n2) PLUS the exempt focus → 3 total.
    const allowed = selectTopKLabels(entries, 2);
    expect([...allowed].sort()).toEqual(["focus", "n1", "n2"]);
  });

  it("keeps everything when K >= the non-exempt count", () => {
    const entries = [entry("a", 1), entry("b", 2), entry("c", 3, true)];
    expect(selectTopKLabels(entries, 10).size).toBe(3);
  });

  it("keeps only the exempt set when K <= 0", () => {
    const entries = [entry("a", 9), entry("b", 8, true), entry("c", 7)];
    expect([...selectTopKLabels(entries, 0)]).toEqual(["b"]);
  });

  it("returns an empty set for no entries", () => {
    expect(selectTopKLabels([], LABEL_TOP_K).size).toBe(0);
  });

  it("exposes the default budget of 20", () => {
    expect(LABEL_TOP_K).toBe(20);
  });
});

describe("selectDiscLabelEligible (high-fan disc label budget)", () => {
  it("takes each disc's top-k ranked ids (union across discs)", () => {
    const discA = ["a1", "a2", "a3", "a4"]; // already DOI-ranked by the caller
    const discB = ["b1", "b2"];
    const eligible = selectDiscLabelEligible([discA, discB], 2);
    expect([...eligible].sort()).toEqual(["a1", "a2", "b1", "b2"]);
  });

  it("caps a large disc so past-the-cut children are excluded (rest → dots)", () => {
    const disc = Array.from({ length: 60 }, (_, i) => `n${i}`);
    const eligible = selectDiscLabelEligible([disc], 8);
    expect(eligible.size).toBe(8);
    expect(eligible.has("n0")).toBe(true);
    expect(eligible.has("n7")).toBe(true);
    expect(eligible.has("n8")).toBe(false);
    expect(eligible.has("n59")).toBe(false);
  });

  it("keeps a disc smaller than k whole", () => {
    expect([...selectDiscLabelEligible([["x", "y"]], 8)].sort()).toEqual(["x", "y"]);
  });

  it("k <= 0 yields an empty set", () => {
    expect(selectDiscLabelEligible([["x", "y"]], 0).size).toBe(0);
  });

  it("defaults to DISC_LABEL_TOP_K when k is omitted", () => {
    const disc = Array.from({ length: 20 }, (_, i) => `n${i}`);
    expect(selectDiscLabelEligible([disc]).size).toBe(DISC_LABEL_TOP_K);
  });

  it("exposes a per-disc budget in the readable 6–8 band", () => {
    expect(DISC_LABEL_TOP_K).toBeGreaterThanOrEqual(6);
    expect(DISC_LABEL_TOP_K).toBeLessThanOrEqual(8);
  });
});

describe("isEgoNeighborLabelExempt (포커스 도메인 자식 라벨 겹침 LOD, 노드 감사 처방)", () => {
  it("null eligible set (focus under the DISC_LABEL_TOP_K band) keeps every neighbor exempt", () => {
    expect(isEgoNeighborLabelExempt("any-id", null)).toBe(true);
  });

  it("non-null eligible set only exempts the DOI winners", () => {
    const eligible = new Set(["a", "b"]);
    expect(isEgoNeighborLabelExempt("a", eligible)).toBe(true);
    expect(isEgoNeighborLabelExempt("c", eligible)).toBe(false);
  });

  it("end-to-end: a focused domain's 18 same-kind children caps to DISC_LABEL_TOP_K exempt labels", () => {
    // Reproduces the audited scenario: a focus with 18 neighbors, all the same
    // kind/degree (a typical domain's capability children) — before this fix,
    // `neighborsOfFocused.size > DISC_LABEL_TOP_K` would still exempt all 18
    // unconditionally; now only the DOI-ranked top-K keep the exemption.
    const neighborIds = Array.from({ length: 18 }, (_, i) => `child-${String(i).padStart(2, "0")}`);
    const ranked = neighborIds; // identical kind/degree → DOI rank falls back to id-ascending, already sorted.
    const eligible = selectDiscLabelEligible([ranked], DISC_LABEL_TOP_K);
    const exemptCount = neighborIds.filter((id) => isEgoNeighborLabelExempt(id, eligible)).length;
    expect(exemptCount).toBe(DISC_LABEL_TOP_K);
    expect(isEgoNeighborLabelExempt("child-00", eligible)).toBe(true);
    expect(isEgoNeighborLabelExempt("child-17", eligible)).toBe(false);
  });

  it("a small focus (≤ DISC_LABEL_TOP_K neighbors) is unaffected — caller passes null, regression 0", () => {
    // The caller (`ui/topology-frame-draw.ts`) only computes a non-null eligible
    // set when `neighborsOfFocused.size > DISC_LABEL_TOP_K`; below that, every
    // neighbor stays exempt exactly as before this fix.
    const neighborIds = ["a", "b", "c"];
    expect(neighborIds.every((id) => isEgoNeighborLabelExempt(id, null))).toBe(true);
  });
});
