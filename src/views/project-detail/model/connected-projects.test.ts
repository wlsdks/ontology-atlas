import { describe, expect, it } from "vitest";
import type { KnowledgeGraphEdge, KnowledgeGraphNode } from "@/entities/knowledge-graph";
import type { Project } from "@/entities/project";
import { buildConnectedProjects, findRelatesGraphProjectSlugs } from "./connected-projects";

function project(slug: string, overrides: Partial<Project> = {}): Project {
  return {
    slug,
    name: slug,
    description: "",
    tags: [],
    stack: [],
    links: [],
    dependencies: [],
    screenshots: [],
    createdAt: new Date(0),
    updatedAt: new Date(0),
    ...overrides,
  };
}

describe("buildConnectedProjects", () => {
  it("returns an empty list when there are no dependencies, referencers, or relates edges", () => {
    const self = project("ontology-atlas");
    expect(buildConnectedProjects(self, [], [])).toEqual([]);
  });

  it("includes projects this one depends on", () => {
    const self = project("a", { dependencies: ["b"] });
    const b = project("b");
    expect(buildConnectedProjects(self, [b], [])).toEqual([b]);
  });

  it("includes projects that depend on this one (referencedBy)", () => {
    const self = project("a");
    const b = project("b", { dependencies: ["a"] });
    expect(buildConnectedProjects(self, [b], [])).toEqual([b]);
  });

  it("includes relates-graph projects not already covered by dependencies", () => {
    const self = project("a");
    const b = project("b");
    expect(buildConnectedProjects(self, [b], ["b"])).toEqual([b]);
  });

  it("dedups across dependencies / referencedBy / relates-graph sources", () => {
    const self = project("a", { dependencies: ["b"] });
    const b = project("b");
    const result = buildConnectedProjects(self, [b], ["b"]);
    expect(result).toHaveLength(1);
  });

  it("never includes the project itself even if self-referenced", () => {
    const self = project("a", { dependencies: ["a"] });
    expect(buildConnectedProjects(self, [self], ["a"])).toEqual([]);
  });
});

function node(id: string, kind: string): KnowledgeGraphNode {
  return { id, title: id, kind, projectIds: [], evidenceIds: [], lastApprovedAt: new Date(0), lastApprovedBy: "t" };
}

function relatesEdge(from: string, to: string): KnowledgeGraphEdge {
  return {
    id: `${from}--related_to-->${to}`,
    from,
    to,
    type: "related_to",
    projectIds: [],
    evidenceIds: [],
    lastApprovedAt: new Date(0),
    lastApprovedBy: "t",
  };
}

describe("findRelatesGraphProjectSlugs", () => {
  it("returns an empty array when this project has no project-level node", () => {
    expect(findRelatesGraphProjectSlugs([], [], "ontology-atlas")).toEqual([]);
  });

  it("finds another project connected via a related_to edge in either direction", () => {
    const nodes = [node("project:a", "project"), node("project:b", "project")];
    const outgoing = findRelatesGraphProjectSlugs(nodes, [relatesEdge("project:a", "project:b")], "a");
    expect(outgoing).toEqual(["b"]);

    const incoming = findRelatesGraphProjectSlugs(nodes, [relatesEdge("project:b", "project:a")], "a");
    expect(incoming).toEqual(["b"]);
  });

  it("ignores non-related_to edges and non-project targets", () => {
    const nodes = [node("project:a", "project"), node("domain:x", "domain")];
    const edges = [relatesEdge("project:a", "domain:x"), { ...relatesEdge("project:a", "domain:x"), type: "contains", id: "e2" }];
    expect(findRelatesGraphProjectSlugs(nodes, edges, "a")).toEqual([]);
  });
});
