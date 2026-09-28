import { describe, expect, it } from "vitest";

import {
  EGO_CONTAINS_COMET_LIMIT,
  edgePairKey,
  selectAmbientDependsComets,
  selectEgoContainsComets,
} from "@/widgets/ontology-map/render/edge-fireflies";

/**
 * The always-on `depends` comets carry the same cap as the focused node's `contains` comets. They
 * still flow regardless of focus (#512); the cap bounds how many dots move at once.
 */
const edges = (n: number, kind: "contains" | "depends" = "depends") =>
  Array.from({ length: n }, (_, i) => ({ sourceId: `s${i}`, targetId: `t${i}`, kind }));

const allCandidates = () => true;

describe("depends comet cap contract", () => {
  it("caps both comet branches at the same limit", () => {
    expect(selectAmbientDependsComets(edges(200), allCandidates, new Set()).size).toBe(EGO_CONTAINS_COMET_LIMIT);
    const hub = Array.from({ length: 200 }, (_, i) => ({ sourceId: "hub", targetId: `t${i}`, kind: "contains" as const }));
    const incident = hub.map((_, i) => i);
    expect(selectEgoContainsComets(hub, incident).keys.size).toBe(EGO_CONTAINS_COMET_LIMIT);
  });

  it("lets every edge through below the cap", () => {
    expect(selectAmbientDependsComets(edges(20), allCandidates, new Set()).size).toBe(20);
  });

  it("selects the same set whatever the order of the edge list", () => {
    const source = edges(60);
    const a = [...selectAmbientDependsComets(source, allCandidates, new Set())].sort();
    const b = [...selectAmbientDependsComets([...source].reverse(), allCandidates, new Set())].sort();
    expect(a).toEqual(b);
  });

  it("keys a selected edge the way the draw looks it up", () => {
    const one = [{ sourceId: "a", targetId: "b", kind: "depends" }];
    expect(selectAmbientDependsComets(one, allCandidates, new Set()).has(edgePairKey("a", "b"))).toBe(true);
  });
});
