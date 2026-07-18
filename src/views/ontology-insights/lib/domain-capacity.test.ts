import { describe, expect, it } from "vitest";
import type { KnowledgeGraphNode } from "@/entities/knowledge-graph";
import type { OntologyTreeNode } from "@/shared/lib/ontology-tree";
import { computeDomainCapacityRows } from "./domain-capacity";

function node(id: string, kind: string, title = id): KnowledgeGraphNode {
  return {
    id,
    title,
    kind,
    projectIds: [],
    evidenceIds: [],
    lastApprovedAt: new Date(0),
    lastApprovedBy: "vault-frontmatter",
  };
}

function tree(n: KnowledgeGraphNode, depth: number, children: OntologyTreeNode[] = []): OntologyTreeNode {
  return { node: n, depth, children };
}

describe("computeDomainCapacityRows", () => {
  it("counts capability + element descendants per domain, sorted by total desc", () => {
    const roots: OntologyTreeNode[] = [
      tree(node("project:atlas", "project"), 0, [
        tree(node("domain:views", "domain", "Views"), 1, [
          tree(node("capability:a", "capability"), 2),
          tree(node("capability:b", "capability"), 2, [
            tree(node("element:a1", "element"), 3),
            tree(node("element:a2", "element"), 3),
          ]),
        ]),
        tree(node("domain:core", "domain", "Ontology Core"), 1, [
          tree(node("capability:c", "capability"), 2),
        ]),
      ]),
    ];

    const rows = computeDomainCapacityRows(roots);

    expect(rows).toEqual([
      { id: "domain:views", title: "Views", capabilityCount: 2, elementCount: 2, total: 4 },
      { id: "domain:core", title: "Ontology Core", capabilityCount: 1, elementCount: 0, total: 1 },
    ]);
  });

  it("returns an empty array when there are no domain nodes", () => {
    const roots: OntologyTreeNode[] = [tree(node("project:atlas", "project"), 0)];
    expect(computeDomainCapacityRows(roots)).toEqual([]);
  });

  it("breaks ties by title ascending for determinism", () => {
    const roots: OntologyTreeNode[] = [
      tree(node("project:atlas", "project"), 0, [
        tree(node("domain:b", "domain", "Zeta"), 1, [tree(node("capability:z", "capability"), 2)]),
        tree(node("domain:a", "domain", "Alpha"), 1, [tree(node("capability:a", "capability"), 2)]),
      ]),
    ];
    const rows = computeDomainCapacityRows(roots);
    expect(rows.map((r) => r.title)).toEqual(["Alpha", "Zeta"]);
  });
});
