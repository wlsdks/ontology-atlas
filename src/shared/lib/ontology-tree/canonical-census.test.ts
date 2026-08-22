import { describe, expect, it } from "vitest";

import type { KnowledgeGraphEdge, KnowledgeGraphNode } from "@/entities/knowledge-graph";
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
 * P0c — 표면별 census 불일치(지도 294/인사이트 293/프로젝트 288)의 회귀
 * 가드. 정본은 파생 전체이며, project 를 다시 더하거나 kind 를 걸러내는
 * 순간 표면 간 숫자가 갈라진다.
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
