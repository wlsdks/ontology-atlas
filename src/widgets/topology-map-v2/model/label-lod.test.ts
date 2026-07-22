import { describe, expect, it } from "vitest";

import { LABEL_TOP_K, selectTopKLabels, type LabelRankEntry } from "./label-lod";

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
