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
    // `e1` sits under `c1` (domain A) and domain B; the first containment parent wins, as in
    // `buildOntologyTree`, so only A counts it.
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
    // Every concept has one owner, so domains can only partition the project's total.
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

it('keeps capability IDs in breadth-first ownership order across branches', () => {
  const nodes = [node('d', 'domain'), node('branch', 'domain'), node('direct', 'capability'), node('nested-a', 'capability'), node('nested-b', 'capability')];
  const edges = [edge('d', 'branch', 'contains'), edge('branch', 'nested-b', 'contains'), edge('d', 'direct', 'contains'), edge('branch', 'nested-a', 'contains')];
  expect(computeDomainCensusRows(nodes, edges, ['domain'], { collectCapabilityIds: true }).find((r) => r.id === 'd')?.capabilityIds)
    .toEqual(['direct', 'nested-b', 'nested-a']);
});

it('keeps cycle-relative breadth-first order and excludes the starting capability', () => {
  const nodes = [node('a', 'capability'), node('b', 'domain'), node('c', 'domain'), node('x', 'capability'), node('y', 'capability')];
  const edges = [edge('a', 'x', 'contains'), edge('a', 'b', 'contains'), edge('b', 'c', 'contains'), edge('b', 'y', 'contains'), edge('c', 'a', 'contains')];
  const rows = computeDomainCensusRows(nodes, edges, ['domain', 'capability'], { collectCapabilityIds: true });
  expect(rows.find((r) => r.id === 'a')?.capabilityIds).toEqual(['x', 'y']);
  expect(rows.find((r) => r.id === 'b')?.capabilityIds).toEqual(['y', 'a', 'x']);
});


it("counts descendants through a hundred thousand nested domains without recursion", () => {
  const size = 100_000;
  const nodes = Array.from({ length: size }, (_, i) =>
    node(String(i), i === size - 1 ? "element" : "domain"));
  const edges = Array.from({ length: size - 1 }, (_, i) =>
    edge(String(i), String(i + 1), "contains"));
  const rows = computeDomainCensusRows(nodes, edges);
  expect(rows).toHaveLength(size - 1);
  expect(rows.every(row => row.elementCount === 1 && row.capabilityCount === 0)).toBe(true);
});

it.each([false, true])("lists the terminal capability across a hundred thousand nodes with cycle=%s", (cycle) => {
  const size = 100_000;
  const nodes = Array.from({ length: size }, (_, i) =>
    node(String(i), i === size - 1 ? "capability" : "domain"));
  const edges = Array.from({ length: size - 1 }, (_, i) =>
    edge(String(i), String(i + 1), "contains"));
  if (cycle) edges.push(edge(String(size - 1), "0", "contains"));
  const rows = computeDomainCensusRows(nodes, edges, undefined, { collectCapabilityIds: true });
  expect(rows).toHaveLength(size - 1);
  expect(rows.every(row => row.capabilityCount === 1 &&
    row.capabilityIds?.length === 1 && row.capabilityIds[0] === String(size - 1))).toBe(true);
});

it("orders equal-depth capabilities after paths of different lengths", () => {
  const nodes = [node("root", "domain"), node("a", "domain"), node("b", "domain"),
    node("middle", "domain"), node("first", "capability"), node("second", "capability"),
    node("last", "capability")];
  const edges = [edge("root", "a", "contains"), edge("root", "b", "contains"),
    edge("a", "middle", "contains"), edge("middle", "first", "contains"),
    edge("b", "second", "contains"), edge("second", "last", "contains")];
  expect(computeDomainCensusRows(nodes, edges, undefined, { collectCapabilityIds: true })
    .find(row => row.id === "root")?.capabilityIds).toEqual(["second", "first", "last"]);
});

it("preserves breadth-first ties across long paths and nested capabilities", () => {
  const nodes = [node("root", "domain")];
  const edges: KnowledgeGraphEdge[] = [];
  for (const branch of ["a", "c", "b"]) {
    for (let depth = 1; depth <= 64; depth += 1) {
      const id = `${branch}-${depth}`;
      nodes.push(node(id, depth === 64 || (branch === "c" && depth === 63)
        ? "capability" : "domain"));
      edges.push(edge(depth === 1 ? "root" : `${branch}-${depth - 1}`, id, "contains"));
    }
  }
  expect(computeDomainCensusRows(nodes, edges, undefined, { collectCapabilityIds: true })
    .find(row => row.id === "root")?.capabilityIds).toEqual(["c-63", "a-64", "c-64", "b-64"]);
});
