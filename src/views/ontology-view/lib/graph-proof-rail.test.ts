import { describe, expect, it } from "vitest";
import { buildAgentGraphDbQueryPack } from "@/shared/lib/ontology-tree";
import {
  buildGraphProofRailModel,
  countExecutableCliFallbacks,
} from "./graph-proof-rail";

describe("graph proof rail", () => {
  it("summarizes the executable graph DB pack shown on /ontology", () => {
    const pack = buildAgentGraphDbQueryPack([
      {
        slug: "capabilities/mcp-server",
        title: "MCP Server",
        kind: "capability",
        degree: 9,
      },
      {
        slug: "domains/ontology-workbench",
        title: "Ontology Workbench",
        kind: "domain",
        degree: 6,
      },
    ]);

    const model = buildGraphProofRailModel(pack);

    expect(model.intentCount).toBe(5);
    expect(model.mcpCallCount).toBe(12);
    expect(model.cliFallbackCount).toBe(12);
    expect(countExecutableCliFallbacks(pack)).toBe(11);
    expect(model.previewIntents).toEqual([
      "MATCH graph RETURN kind/domain/degree/relation facets LIMIT 10",
      "MATCH (n:capability) WHERE degree(n) >= 2 RETURN n ORDER BY degree(n) DESC LIMIT 10",
      "MATCH ()-[r:depends_on]->() RETURN r LIMIT 20",
    ]);
    expect(model.operations).toEqual([
      "facets",
      "schema",
      "query_plan",
      "match_nodes",
      "match_edges",
      "domain_matrix",
      "centrality",
      "all_paths",
      "explain_relation",
    ]);
  });
});
