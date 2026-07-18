import { describe, expect, it } from "vitest";
import { buildOntologyTree, type OntologyTreeNode } from "@/shared/lib/ontology-tree";
import type { KnowledgeGraphEdge, KnowledgeGraphNode } from "@/entities/knowledge-graph";
import {
  computeCapacityRatio,
  computeDomainSubcounts,
  computeMaxDomainDescendantCount,
} from "./domain-subcounts";

function makeNode(id: string, kind: string, title?: string): KnowledgeGraphNode {
  return {
    id,
    title: title ?? id,
    kind,
    projectIds: [],
    evidenceIds: [],
    lastApprovedAt: new Date("2026-04-27"),
    lastApprovedBy: "system",
  };
}

function makeEdge(id: string, from: string, to: string, type = "contains"): KnowledgeGraphEdge {
  return {
    id,
    from,
    to,
    type,
    projectIds: [],
    evidenceIds: [],
    lastApprovedAt: new Date("2026-04-27"),
    lastApprovedBy: "system",
  };
}

function findDomain(roots: OntologyTreeNode[], id: string): OntologyTreeNode {
  const root = roots[0]!;
  const domain = root.children.find((child) => child.node.id === id);
  if (!domain) throw new Error(`domain ${id} not found in fixture`);
  return domain;
}

describe("computeDomainSubcounts", () => {
  it("counts capability/element descendants recursively, not just direct children", () => {
    const nodes = [
      makeNode("project:root", "project"),
      makeNode("domain:a", "domain"),
      makeNode("capability:c1", "capability"),
      makeNode("element:e1", "element"),
      makeNode("element:e2", "element"),
    ];
    const edges = [
      makeEdge("e1", "project:root", "domain:a"),
      makeEdge("e2", "domain:a", "capability:c1"),
      // e1/e2 elements: one direct child of the domain, one nested under the capability
      makeEdge("e3", "domain:a", "element:e1"),
      makeEdge("e4", "capability:c1", "element:e2"),
    ];
    const { roots } = buildOntologyTree(nodes, edges);
    const domain = findDomain(roots, "domain:a");

    const subcounts = computeDomainSubcounts(domain);
    expect(subcounts.capabilityCount).toBe(1);
    expect(subcounts.elementCount).toBe(2);
    expect(subcounts.descendantCount).toBe(3);
  });

  it("returns zero counts for a domain with no children", () => {
    const nodes = [makeNode("project:root", "project"), makeNode("domain:empty", "domain")];
    const edges = [makeEdge("e1", "project:root", "domain:empty")];
    const { roots } = buildOntologyTree(nodes, edges);
    const domain = findDomain(roots, "domain:empty");

    expect(computeDomainSubcounts(domain)).toEqual({
      descendantCount: 0,
      capabilityCount: 0,
      elementCount: 0,
    });
  });
});

describe("computeCapacityRatio", () => {
  it("clamps to 0..1", () => {
    expect(computeCapacityRatio(5, 10)).toBe(0.5);
    expect(computeCapacityRatio(10, 10)).toBe(1);
    expect(computeCapacityRatio(0, 10)).toBe(0);
  });

  it("returns 0 when maxCount is 0 or negative instead of dividing by zero", () => {
    expect(computeCapacityRatio(5, 0)).toBe(0);
    expect(computeCapacityRatio(5, -1)).toBe(0);
  });
});

describe("computeMaxDomainDescendantCount", () => {
  it("returns the largest domain's descendant count", () => {
    const nodes = [
      makeNode("project:root", "project"),
      makeNode("domain:a", "domain"),
      makeNode("domain:b", "domain"),
      makeNode("capability:c1", "capability"),
      makeNode("capability:c2", "capability"),
      makeNode("capability:c3", "capability"),
    ];
    const edges = [
      makeEdge("e1", "project:root", "domain:a"),
      makeEdge("e2", "project:root", "domain:b"),
      makeEdge("e3", "domain:a", "capability:c1"),
      makeEdge("e4", "domain:b", "capability:c2"),
      makeEdge("e5", "domain:b", "capability:c3"),
    ];
    const { roots } = buildOntologyTree(nodes, edges);
    const domains = roots[0]!.children;

    expect(computeMaxDomainDescendantCount(domains)).toBe(2);
  });

  it("returns 0 for an empty domain list", () => {
    expect(computeMaxDomainDescendantCount([])).toBe(0);
  });
});
