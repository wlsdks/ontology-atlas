import { describe, expect, it } from "vitest";

import { computeDomainCensusRows, domainCensusById } from "./domain-census";
import type { KnowledgeGraphEdge, KnowledgeGraphNode } from "@/entities/knowledge-graph";

const node = (id: string, kind: string, title = id): KnowledgeGraphNode =>
  ({ id, kind, title }) as KnowledgeGraphNode;
const edge = (from: string, to: string, type: string): KnowledgeGraphEdge =>
  ({ from, to, type }) as KnowledgeGraphEdge;

describe("computeDomainCensusRows (Guardian I-1 — 도메인 크기 단일 진실원)", () => {
  it("containment 도달 가능한 역량+요소를 kind 별로 센다", () => {
    const nodes = [
      node("p", "project"),
      node("d1", "domain"),
      node("c1", "capability"),
      node("e1", "element"),
      node("e2", "element"),
    ];
    const edges = [
      edge("p", "d1", "contains"),
      edge("d1", "c1", "contains"),
      edge("c1", "e1", "contains"),
      edge("e2", "d1", "belongs_to"),
    ];
    const rows = computeDomainCensusRows(nodes, edges, ["domain"]);
    expect(rows).toEqual([
      { id: "d1", title: "d1", capabilityCount: 1, elementCount: 2, total: 3 },
    ]);
  });

  it("다중 부모 노드도 도메인마다 한 번씩 — 트리 단일-부모 유실이 없다", () => {
    // e1 이 c1(도메인 A 소속)과 도메인 B 양쪽에 contained — 트리는 한쪽에만
    // 배정해 다른 쪽 카운트를 잃었다 (INDEX 96 vs /projects 106 의 원인).
    const nodes = [
      node("a", "domain"),
      node("b", "domain"),
      node("c1", "capability"),
      node("e1", "element"),
    ];
    const edges = [
      edge("a", "c1", "contains"),
      edge("c1", "e1", "contains"),
      edge("b", "e1", "contains"),
    ];
    const rows = computeDomainCensusRows(nodes, edges, ["domain"]);
    const byId = domainCensusById(rows);
    expect(byId.get("a")).toMatchObject({ capabilityCount: 1, elementCount: 1 });
    expect(byId.get("b")).toMatchObject({ capabilityCount: 0, elementCount: 1 });
  });

  it("사이클이 있어도 종료하고 이중 가산하지 않는다", () => {
    const nodes = [node("d", "domain"), node("c1", "capability"), node("c2", "capability")];
    const edges = [
      edge("d", "c1", "contains"),
      edge("c1", "c2", "contains"),
      edge("c2", "c1", "contains"),
    ];
    const rows = computeDomainCensusRows(nodes, edges, ["domain"]);
    expect(rows[0]).toMatchObject({ capabilityCount: 2, elementCount: 0, total: 2 });
  });

  it("project 도 대상 kind — 각인 숫자(캔버스)와 같은 규칙", () => {
    const nodes = [node("p", "project"), node("d", "domain"), node("e", "element")];
    const edges = [edge("p", "d", "contains"), edge("d", "e", "contains")];
    const rows = computeDomainCensusRows(nodes, edges);
    const byId = domainCensusById(rows);
    expect(byId.get("p")).toMatchObject({ capabilityCount: 0, elementCount: 1, total: 1 });
    expect(byId.get("d")).toMatchObject({ total: 1 });
  });

  it("total 내림차순, 동률은 title 오름차순 — 결정론", () => {
    const nodes = [node("b", "domain", "B"), node("a", "domain", "A"), node("e", "element")];
    const edges = [edge("a", "e", "contains"), edge("b", "e", "contains")];
    const rows = computeDomainCensusRows(nodes, edges, ["domain"]);
    expect(rows.map((r) => r.title)).toEqual(["A", "B"]);
  });
});
