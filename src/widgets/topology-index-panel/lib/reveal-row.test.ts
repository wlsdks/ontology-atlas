import { describe, expect, it } from "vitest";
import { buildOntologyTree } from "@/entities/knowledge-graph/lib/ontology-tree";
import type { KnowledgeGraphEdge, KnowledgeGraphNode } from "@/entities/knowledge-graph";
import { treeAncestorIds } from "./reveal-row";

const node = (id: string, kind: string): KnowledgeGraphNode => ({
  id,
  title: id,
  kind,
  projectIds: [],
  evidenceIds: [],
  lastApprovedAt: new Date("2026-09-25"),
  lastApprovedBy: "system",
});

const edge = (from: string, to: string, type: "contains" | "belongs_to"): KnowledgeGraphEdge => ({
  id: `${from}>${to}`,
  from,
  to,
  type,
  projectIds: [],
  evidenceIds: [],
  lastApprovedAt: new Date("2026-09-25"),
  lastApprovedBy: "system",
});

const tree = () =>
  buildOntologyTree(
    [
      node("project:atlas", "project"),
      node("domain:workbench", "domain"),
      node("domain:evidence", "domain"),
      node("capability:git-history", "capability"),
      node("element:change-headline", "element"),
    ],
    [
      edge("project:atlas", "domain:workbench", "contains"),
      edge("project:atlas", "domain:evidence", "contains"),
      // A capability reaches its domain through `belongs_to`, as a vault usually writes it.
      edge("capability:git-history", "domain:workbench", "belongs_to"),
      edge("capability:git-history", "element:change-headline", "contains"),
    ],
  ).roots;

describe("treeAncestorIds", () => {
  it("names every row above a nested row, root first", () => {
    expect(treeAncestorIds(tree(), "element:change-headline")).toEqual([
      "project:atlas",
      "domain:workbench",
      "capability:git-history",
    ]);
  });

  it("follows the branch the tree put the row in, including a belongs_to parent", () => {
    expect(treeAncestorIds(tree(), "capability:git-history")).toEqual(["project:atlas", "domain:workbench"]);
  });

  it("is empty for a root row and null for a row the tree does not hold", () => {
    expect(treeAncestorIds(tree(), "project:atlas")).toEqual([]);
    expect(treeAncestorIds(tree(), "element:not-in-the-tree")).toBeNull();
    expect(treeAncestorIds([], "project:atlas")).toBeNull();
  });
});
