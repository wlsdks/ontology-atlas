import { describe, expect, it } from "vitest";
import type { KnowledgeGraphNode } from "@/entities/knowledge-graph";
import { resolveInsightsQueryNode } from "./resolve-insights-query-node";

const nodes: KnowledgeGraphNode[] = [
  {
    id: "element:insights-query-cockpit",
    title: "Insights Query Cockpit",
    kind: "element",
    projectIds: [],
    evidenceIds: ["ontology/elements/insights-query-cockpit"],
    lastApprovedAt: new Date(0),
    lastApprovedBy: "vault",
  },
  {
    id: "domain:views",
    title: "Views",
    kind: "domain",
    projectIds: [],
    evidenceIds: ["domains/views"],
    lastApprovedAt: new Date(0),
    lastApprovedBy: "vault",
  },
  {
    id: "project:ontology-atlas",
    title: "ontology-atlas",
    kind: "project",
    projectIds: [],
    evidenceIds: ["ontology/project"],
    lastApprovedAt: new Date(0),
    lastApprovedBy: "vault",
  },
];

describe("resolveInsightsQueryNode", () => {
  it("resolves graph node ids used by builder proof links", () => {
    expect(resolveInsightsQueryNode("element:insights-query-cockpit", nodes)?.id).toBe(
      "element:insights-query-cockpit",
    );
  });

  it("resolves canonical vault slugs used by ontology tree query handoffs", () => {
    expect(resolveInsightsQueryNode("elements/insights-query-cockpit", nodes)?.id).toBe(
      "element:insights-query-cockpit",
    );
  });

  it("normalizes ontology-prefixed evidence slugs", () => {
    expect(resolveInsightsQueryNode("ontology/elements/insights-query-cockpit", nodes)?.id).toBe(
      "element:insights-query-cockpit",
    );
  });

  it("falls back to kind folder inference when evidence ids are short slugs", () => {
    expect(resolveInsightsQueryNode("domains/views", nodes)?.id).toBe("domain:views");
  });

  it("resolves project frontmatter slug aliases from builder proof links", () => {
    expect(resolveInsightsQueryNode("ontology-atlas", nodes)?.id).toBe(
      "project:ontology-atlas",
    );
  });
});
