import { describe, expect, it } from "vitest";

import { computeDomainCensusRows, domainCensusById } from "./domain-census";
import type { KnowledgeGraphEdge, KnowledgeGraphNode } from "../../model";

const node = (id: string, kind: string, title = id): KnowledgeGraphNode =>
  ({ id, kind, title }) as KnowledgeGraphNode;
const edge = (from: string, to: string, type: string): KnowledgeGraphEdge =>
  ({ from, to, type }) as KnowledgeGraphEdge;

describe("computeDomainCensusRows", () => {
  it("counts reachable capabilities and elements by kind", () => {
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

  it("counts a shared concept once, in the domain that claims it", () => {
    // `e1` is contained by both `c1` (in domain A) and domain B. The map can draw
    // it in only one place, so counting it for both made a domain state a number
    // its own chip could never open. The first containment parent wins, the same
    // tie-break `buildOntologyTree` uses, so A holds it and B does not.
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
    expect(byId.get("b")).toMatchObject({ capabilityCount: 0, elementCount: 0 });
  });

  it("keeps domain totals within the containing project total", () => {
    // The arithmetic that exposed the double count: eight dogfood domains summed
    // to 103 inside a project of 99. Every concept has one owner, so the domains
    // can only partition what the project holds.
    const nodes = [
      node("p", "project"),
      node("a", "domain"),
      node("b", "domain"),
      node("c1", "capability"),
      node("e1", "element"),
    ];
    const edges = [
      edge("p", "a", "contains"),
      edge("p", "b", "contains"),
      edge("a", "c1", "contains"),
      edge("c1", "e1", "contains"),
      edge("b", "e1", "contains"),
    ];
    const byId = domainCensusById(computeDomainCensusRows(nodes, edges));
    const domainSum = byId.get("a")!.total + byId.get("b")!.total;
    expect(domainSum).toBe(byId.get("p")!.total);
  });

  it("terminates on cycles without double counting", () => {
    const nodes = [node("d", "domain"), node("c1", "capability"), node("c2", "capability")];
    const edges = [
      edge("d", "c1", "contains"),
      edge("c1", "c2", "contains"),
      edge("c2", "c1", "contains"),
    ];
    const rows = computeDomainCensusRows(nodes, edges, ["domain"]);
    expect(rows[0]).toMatchObject({ capabilityCount: 2, elementCount: 0, total: 2 });
  });

  it("counts projects by the same rule as the canvas", () => {
    const nodes = [node("p", "project"), node("d", "domain"), node("e", "element")];
    const edges = [edge("p", "d", "contains"), edge("d", "e", "contains")];
    const rows = computeDomainCensusRows(nodes, edges);
    const byId = domainCensusById(rows);
    expect(byId.get("p")).toMatchObject({ capabilityCount: 0, elementCount: 1, total: 1 });
    expect(byId.get("d")).toMatchObject({ total: 1 });
  });

  it("sorts by total descending, then title ascending", () => {
    const nodes = [node("b", "domain", "B"), node("a", "domain", "A"), node("e", "element")];
    const edges = [edge("a", "e", "contains"), edge("b", "e", "contains")];
    const rows = computeDomainCensusRows(nodes, edges, ["domain"]);
    expect(rows.map((r) => r.title)).toEqual(["A", "B"]);
  });
});
