import { describe, expect, it } from "vitest";

import type { KnowledgeGraphEdge, KnowledgeGraphNode } from "../../model";
import { computeCanonicalCensus } from "./canonical-census";

const node = (id: string, kind: string): KnowledgeGraphNode => ({
  id,
  title: id,
  kind,
  projectIds: [],
  evidenceIds: [],
  lastApprovedAt: new Date(0),
  lastApprovedBy: "",
});

/**
 * Regression guard for surfaces disagreeing on the node count — measured at map 294, insights
 * 293, projects 288. The canonical figure is the whole derivation; the moment a surface adds
 * `project` back in or filters by kind, the numbers split apart again.
 */
describe("computeCanonicalCensus", () => {
  const nodes = [
    node("p", "project"),
    node("d", "domain"),
    node("c", "capability"),
    node("e", "element"),
    node("doc", "document"),
    node("readme", "vault-readme"),
  ];
  const edges = [{ id: "1", from: "p", to: "d", type: "contains" }] as KnowledgeGraphEdge[];

  it("project/document 는 개념이지만 reader sentinel 은 화면 census 에서 제외한다", () => {
    expect(computeCanonicalCensus(nodes, edges)).toEqual({ conceptCount: 5, relationCount: 1 });
  });

  it("빈 그래프는 0/0", () => {
    expect(computeCanonicalCensus([], [])).toEqual({ conceptCount: 0, relationCount: 0 });
  });
});
