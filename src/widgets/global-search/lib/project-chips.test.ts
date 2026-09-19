import { describe, expect, it } from "vitest";
import type { KnowledgeGraphNode } from "@/entities/knowledge-graph";
import type { Project } from "@/entities/project";
import { buildProjectChips } from "./project-chips";

function node(input: Partial<KnowledgeGraphNode> & { id: string; title: string; kind: string }): KnowledgeGraphNode {
  return {
    projectIds: [],
    evidenceIds: [],
    lastApprovedAt: new Date("2026-09-19"),
    lastApprovedBy: "system",
    ...input,
  };
}

function project(input: Partial<Project> & { slug: string; name: string }): Project {
  return { updatedAt: new Date("2026-09-19"), ...input } as Project;
}

describe("buildProjectChips", () => {
  it("wears the map's display name for a project that has a node, and the registered name otherwise", () => {
    const chips = buildProjectChips(
      [project({ slug: "storefront", name: "Online Store" }), project({ slug: "atlas", name: "ontology-atlas" })],
      [
        node({ id: "project:storefront", title: "Online Store", kind: "project", display: "온라인 쇼핑몰" }),
        node({ id: "domain:order", title: "Orders", kind: "domain", projectIds: ["storefront"] }),
      ],
    );
    expect(chips).toEqual([
      { slug: "storefront", label: "온라인 쇼핑몰" },
      { slug: "atlas", label: "ontology-atlas" },
    ]);
  });

  it("orders by how many concepts a project carries before its name", () => {
    const chips = buildProjectChips(
      [project({ slug: "a", name: "가" }), project({ slug: "b", name: "나" })],
      [
        node({ id: "domain:x", title: "x", kind: "domain", projectIds: ["b"] }),
        node({ id: "domain:y", title: "y", kind: "domain", projectIds: ["b"] }),
        node({ id: "domain:z", title: "z", kind: "domain", projectIds: ["a"] }),
      ],
    );
    expect(chips.map((chip) => chip.slug)).toEqual(["b", "a"]);
  });

  it("falls back to the project ids the concepts name when nothing is registered", () => {
    const chips = buildProjectChips(undefined, [
      node({ id: "domain:x", title: "x", kind: "domain", projectIds: ["one"] }),
      node({ id: "domain:y", title: "y", kind: "domain", projectIds: ["two", "one"] }),
    ]);
    expect(chips).toEqual([
      { slug: "one", label: "one" },
      { slug: "two", label: "two" },
    ]);
  });
});
