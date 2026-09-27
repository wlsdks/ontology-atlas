import { describe, expect, it } from "vitest";
import type { KnowledgeGraphNode } from "@/entities/knowledge-graph";
import type { Project } from "@/entities/project";
import {
  compactTopologyPanelTitle,
  resolveTopologyNodeTitle,
} from "./resolve-topology-node-title";

function node(id: string, title: string, display?: string): KnowledgeGraphNode {
  return {
    id,
    title,
    ...(display ? { display } : {}),
    kind: "capability",
    projectIds: [],
    evidenceIds: [],
    lastApprovedAt: new Date(0),
    lastApprovedBy: "test",
  };
}

const nodes = [
  node("capability:checkout", "결제 (주문 도메인)"),
  node("domain:fulfillment", "Fulfillment", "배송"),
];
const noProjects: ReadonlyMap<string, Project> = new Map();

describe("resolveTopologyNodeTitle", () => {
  it("a resolved node gives its name without parentheses", () => {
    expect(
      resolveTopologyNodeTitle({
        slug: "capability:checkout",
        projectBySlug: noProjects,
        ontologyNodes: nodes,
      }),
    ).toBe("결제");
  });

  it("prefers the map display name over the canonical title", () => {
    expect(
      resolveTopologyNodeTitle({
        slug: "domain:fulfillment",
        projectBySlug: noProjects,
        ontologyNodes: nodes,
      }),
    ).toBe("배송");
  });

  /**
   * This one line was the source of the screen stating an outright falsehood: a
   * fallback that passes the slug off as a title gives an absent node a name,
   * and the path chip then asserts "no path" over it. null is the information
   * that the node is not here.
   */
  it("returns null when missing from this vault instead of dressing the slug as a title", () => {
    expect(
      resolveTopologyNodeTitle({
        slug: "capability:from-another-vault",
        projectBySlug: noProjects,
        ontologyNodes: nodes,
      }),
    ).toBeNull();
  });

  it("returns null before the graph exists", () => {
    expect(
      resolveTopologyNodeTitle({
        slug: "capability:checkout",
        projectBySlug: noProjects,
        ontologyNodes: null,
      }),
    ).toBeNull();
  });

  it("returns null without a slug", () => {
    expect(
      resolveTopologyNodeTitle({
        slug: null,
        projectBySlug: noProjects,
        ontologyNodes: nodes,
      }),
    ).toBeNull();
  });
});

describe("compactTopologyPanelTitle", () => {
  it("strips a parenthetical aside", () => {
    expect(compactTopologyPanelTitle("결제 (주문 도메인)")).toBe("결제");
  });

  it("keeps the original when only a parenthetical remains", () => {
    expect(compactTopologyPanelTitle("(주문)")).toBe("(주문)");
  });
});
