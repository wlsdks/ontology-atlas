import { describe, expect, it } from "vitest";
import { deriveCodeLocations } from "./code-locations";
import type { KnowledgeGraphEdge, KnowledgeGraphNode } from "../model/types";

const SENTINEL_DATE = new Date(0);
function node(partial: Partial<KnowledgeGraphNode> & { id: string; title: string }): KnowledgeGraphNode {
  return {
    kind: "capability",
    projectIds: [],
    evidenceIds: [],
    lastApprovedAt: SENTINEL_DATE,
    lastApprovedBy: "test",
    ...partial,
  };
}
function edge(partial: Partial<KnowledgeGraphEdge> & { from: string; to: string; type: string }): KnowledgeGraphEdge {
  return {
    id: `${partial.from}--${partial.type}-->${partial.to}`,
    projectIds: [],
    evidenceIds: [],
    lastApprovedAt: SENTINEL_DATE,
    lastApprovedBy: "test",
    ...partial,
  };
}

describe("deriveCodeLocations", () => {
  it("collects the raw paths of direct `contains` children that look like code paths", () => {
    const nodes = [
      node({ id: "capability:mcp-server", title: "MCP Server" }),
      node({ id: "element:index-js", title: "mcp/src/index.js", kind: "element" }),
      node({ id: "element:verify-mjs", title: "mcp/src/verify.mjs", kind: "element" }),
      node({ id: "domain:ai-agent", title: "AI Agent Partner", kind: "domain" }),
    ];
    const edges = [
      edge({ from: "capability:mcp-server", to: "element:index-js", type: "contains" }),
      edge({ from: "capability:mcp-server", to: "element:verify-mjs", type: "contains" }),
      edge({ from: "domain:ai-agent", to: "capability:mcp-server", type: "contains" }),
    ];
    expect(deriveCodeLocations("capability:mcp-server", nodes, edges)).toEqual([
      "mcp/src/index.js",
      "mcp/src/verify.mjs",
    ]);
  });

  it("includes the node's OWN title when the node itself is a path-titled element", () => {
    const nodes = [
      node({ id: "element:index-js", title: "mcp/src/index.js", kind: "element" }),
    ];
    expect(deriveCodeLocations("element:index-js", nodes, [])).toEqual(["mcp/src/index.js"]);
  });

  it("excludes non-path children — plain concept titles never surface as code locations", () => {
    const nodes = [
      node({ id: "domain:ai-agent", title: "AI Agent Partner", kind: "domain" }),
      node({ id: "capability:mcp-server", title: "MCP Server" }),
    ];
    const edges = [edge({ from: "domain:ai-agent", to: "capability:mcp-server", type: "contains" })];
    expect(deriveCodeLocations("domain:ai-agent", nodes, edges)).toEqual([]);
  });

  it("does NOT fall back to evidenceIds/sourceSlug self-reference — a node with no path evidence returns empty, not its own doc slug", () => {
    const nodes = [
      node({
        id: "capability:mcp-server",
        title: "MCP Server",
        evidenceIds: ["capabilities/mcp-server"],
      }),
    ];
    expect(deriveCodeLocations("capability:mcp-server", nodes, [])).toEqual([]);
  });

  it("dedupes when the same path is reachable via more than one contains edge", () => {
    const nodes = [
      node({ id: "capability:a", title: "Cap A" }),
      node({ id: "capability:b", title: "Cap B" }),
      node({ id: "element:shared", title: "src/shared/lib/foo.ts", kind: "element" }),
    ];
    const edges = [
      edge({ from: "capability:a", to: "element:shared", type: "contains" }),
      edge({ from: "capability:b", to: "element:shared", type: "contains" }),
    ];
    expect(deriveCodeLocations("capability:a", nodes, edges)).toEqual(["src/shared/lib/foo.ts"]);
  });

  it("returns an empty array for an unknown node id", () => {
    expect(deriveCodeLocations("capability:missing", [], [])).toEqual([]);
  });
});
