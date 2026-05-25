import { describe, expect, it } from "vitest";
import type { KnowledgeGraphNode } from "@/entities/knowledge-graph";
import { resolveOntologyDeeplinkNode } from "./resolve-deeplink-node";

function node(overrides: Partial<KnowledgeGraphNode>): KnowledgeGraphNode {
  return {
    id: "capability:mcp-server",
    title: "MCP Server",
    kind: "capability",
    projectIds: [],
    evidenceIds: [],
    lastApprovedAt: new Date(0),
    lastApprovedBy: "test",
    ...overrides,
  };
}

describe("resolveOntologyDeeplinkNode", () => {
  it("matches the canonical ontology node id", () => {
    const selected = node({ id: "capability:mcp-server" });

    expect(resolveOntologyDeeplinkNode("capability:mcp-server", [selected]))
      .toBe(selected);
  });

  it("matches the vault slug used by builder deep links", () => {
    const selected = node({
      id: "capability:topology-analysis-modes",
      evidenceIds: ["capabilities/topology-analysis-modes"],
    });

    expect(
      resolveOntologyDeeplinkNode("capabilities/topology-analysis-modes", [
        selected,
      ]),
    ).toBe(selected);
  });

  it("matches ontology-prefixed evidence ids", () => {
    const selected = node({
      id: "element:parser",
      kind: "element",
      evidenceIds: ["ontology/elements/parser"],
    });

    expect(resolveOntologyDeeplinkNode("elements/parser", [selected])).toBe(
      selected,
    );
  });

  it("returns null for unknown or empty ids", () => {
    expect(resolveOntologyDeeplinkNode("", [])).toBeNull();
    expect(
      resolveOntologyDeeplinkNode("capabilities/missing", [
        node({ evidenceIds: ["capabilities/mcp-server"] }),
      ]),
    ).toBeNull();
  });
});
