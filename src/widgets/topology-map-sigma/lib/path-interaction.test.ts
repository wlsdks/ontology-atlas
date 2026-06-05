import { describe, expect, it } from "vitest";
import {
  buildPathRelationSteps,
  formatPathAllPathsCliCheck,
  formatPathAllPathsMcpCheck,
  formatPathAllPathsPlanMcpCheck,
  formatPathCliCheck,
  formatPathBuilderHref,
  formatPathEvidenceBrief,
  formatPathExplainRelationCliCheck,
  formatPathExplainRelationMcpCheck,
  formatPathMcpCheck,
  formatPathOntologyHref,
  formatPathRelationPreflightCliCheck,
  formatPathRelationPreflightMcpCheck,
  formatPathRelationPreflightReason,
  inferPathRelationPreflightType,
  resolvePathGraphNodeId,
  shouldUsePathSelectionGesture,
} from "./path-interaction";

describe("shouldUsePathSelectionGesture", () => {
  it("treats normal clicks as path gestures while Path mode is active", () => {
    expect(
      shouldUsePathSelectionGesture({
        pathWorkflowActive: true,
        shiftKey: false,
      }),
    ).toBe(true);
  });

  it("keeps Shift+click as the fallback gesture outside Path mode", () => {
    expect(
      shouldUsePathSelectionGesture({
        pathWorkflowActive: false,
        shiftKey: true,
      }),
    ).toBe(true);
  });

  it("leaves ordinary clicks as normal selection outside Path mode", () => {
    expect(
      shouldUsePathSelectionGesture({
        pathWorkflowActive: false,
        shiftKey: false,
      }),
    ).toBe(false);
  });
});

describe("resolvePathGraphNodeId", () => {
  const existing = new Set([
    "domain:views",
    "capability:mcp-server",
    "element:mcp-index",
  ]);
  const hasNode = (nodeId: string) => existing.has(nodeId);

  it("keeps graph ids used by direct Sigma path clicks", () => {
    expect(resolvePathGraphNodeId("domain:views", hasNode)).toBe("domain:views");
  });

  it("resolves vault slugs emitted by builder and collaborator handoff URLs", () => {
    expect(resolvePathGraphNodeId("capabilities/mcp-server", hasNode)).toBe(
      "capability:mcp-server",
    );
    expect(resolvePathGraphNodeId("elements/mcp-index", hasNode)).toBe(
      "element:mcp-index",
    );
  });

  it("normalizes docs-vault ontology-prefixed slugs before graph lookup", () => {
    expect(resolvePathGraphNodeId("ontology/domains/views", hasNode)).toBe(
      "domain:views",
    );
  });

  it("returns null when the target cannot be resolved in the visible graph", () => {
    expect(resolvePathGraphNodeId("capabilities/missing", hasNode)).toBeNull();
  });
});

describe("formatPathEvidenceBrief", () => {
  it("formats a copyable route with relation evidence and slugs", () => {
    expect(
      formatPathEvidenceBrief({
        slugs: ["capabilities/a", "domains/b", "elements/c"],
        steps: [
          { from: "capabilities/a", to: "domains/b", relation: "domain" },
          { from: "domains/b", to: "elements/c", relation: "elements" },
        ],
        getLabel: (slug) => ({ "capabilities/a": "A", "domains/b": "B", "elements/c": "C" })[slug] ?? slug,
        labels: {
          title: "Topology path evidence",
          hops: "Hops",
          source: "Source",
          target: "Target",
          route: "Route",
          slugs: "Slugs",
          url: "URL",
          sourceOntologyUrl: "Source ontology URL",
          targetOntologyUrl: "Target ontology URL",
          sourceBuilderUrl: "Source builder URL",
          targetBuilderUrl: "Target builder URL",
          cliCheck: "CLI check",
          mcpCheck: "MCP check",
          relationPreflightReason: "Relation preflight reason",
          relationPreflightCliCheck: "Relation preflight CLI check",
          relationPreflightMcpCheck: "Relation preflight MCP check",
          explainRelationCliCheck: "explain_relation CLI check",
          explainRelationMcpCheck: "explain_relation MCP check",
          traversalCompleteness: "Traversal completeness",
          traversalCompletenessPolicy: "Run bounded all_paths before treating this shortest path as complete graph evidence.",
          allPathsCliCheck: "all_paths CLI check",
          allPathsPlanMcpCheck: "all_paths query plan MCP check",
          allPathsMcpCheck: "all_paths MCP check",
          allPathsCopyInstruction: "all_paths evidence contract",
          postWriteSyncGate: "Post-write sync gate",
        },
        url: "http://localhost:3000/en/topology?mode=path",
        syncGatePacket: "# Post-change ontology sync gate\n\n## MCP\n1. query_ontology",
      }),
    ).toBe(
      [
        "# Topology path evidence",
        "- Hops: 2",
        "- Source: A (capabilities/a)",
        "- Target: C (elements/c)",
        "- Route: A (capabilities/a) --domain--> B (domains/b) --elements--> C (elements/c)",
        "- Slugs: `capabilities/a` -> `domains/b` -> `elements/c`",
        "- URL: http://localhost:3000/en/topology?mode=path",
        "- Source ontology URL: /ontology/?node=capabilities%2Fa",
        "- Target ontology URL: /ontology/?node=elements%2Fc",
        "- Source builder URL: /ontology/edit/?node=capabilities%2Fa",
        "- Target builder URL: /ontology/edit/?node=elements%2Fc",
        "- CLI check: ontology-atlas path capabilities/a elements/c [vault] --max-hops 5",
        '- MCP check: query_ontology({"operation":"path","from":"capabilities/a","to":"elements/c","maxHops":5})',
        "- Relation preflight reason: capability -> element maps to elements because capabilities use concrete elements.",
        "- Relation preflight CLI check: ontology-atlas relation-check capabilities/a elements/c elements [vault]",
        '- Relation preflight MCP check: query_ontology({"operation":"relation_check","from":"capabilities/a","to":"elements/c","type":"elements"})',
        "- explain_relation CLI check: ontology-atlas explain capabilities/a elements/c [vault] --direction undirected --max-hops 5 --limit 10",
        '- explain_relation MCP check: query_ontology({"operation":"explain_relation","from":"capabilities/a","to":"elements/c","direction":"undirected","maxHops":5,"limit":10})',
        "- Traversal completeness: Run bounded all_paths before treating this shortest path as complete graph evidence.",
        "- all_paths CLI check: ontology-atlas all-paths capabilities/a elements/c [vault] --plan --max-hops 5 --limit 10 --search-budget 1000",
        '- all_paths query plan MCP check: query_ontology({"operation":"query_plan","targetOperation":"all_paths","from":"capabilities/a","to":"elements/c","maxHops":5,"limit":10,"searchBudget":1000})',
        '- all_paths MCP check: query_ontology({"operation":"all_paths","from":"capabilities/a","to":"elements/c","maxHops":5,"limit":10,"searchBudget":1000})',
        "- all_paths evidence contract: report limit, searchBudget, expandedStates, exhaustive, truncatedByBudget, totalPathsExact, evidence.status, evidence.reason, and evidence.pathsComplete before using paths as write evidence",
        "- Post-write sync gate:",
        "  # Post-change ontology sync gate",
        "",
        "  ## MCP",
        "  1. query_ontology",
      ].join("\n"),
    );
  });

  it("formats path reproduction checks for CLI and MCP handoff", () => {
    expect(formatPathCliCheck("capabilities/a", "elements/c")).toBe(
      "ontology-atlas path capabilities/a elements/c [vault] --max-hops 5",
    );
    expect(formatPathMcpCheck("capabilities/a", "elements/c")).toBe(
      'query_ontology({"operation":"path","from":"capabilities/a","to":"elements/c","maxHops":5})',
    );
    expect(formatPathAllPathsCliCheck("capabilities/a", "elements/c")).toBe(
      "ontology-atlas all-paths capabilities/a elements/c [vault] --plan --max-hops 5 --limit 10 --search-budget 1000",
    );
    expect(formatPathAllPathsPlanMcpCheck("capabilities/a", "elements/c")).toBe(
      'query_ontology({"operation":"query_plan","targetOperation":"all_paths","from":"capabilities/a","to":"elements/c","maxHops":5,"limit":10,"searchBudget":1000})',
    );
    expect(formatPathAllPathsMcpCheck("capabilities/a", "elements/c")).toBe(
      'query_ontology({"operation":"all_paths","from":"capabilities/a","to":"elements/c","maxHops":5,"limit":10,"searchBudget":1000})',
    );
    expect(formatPathRelationPreflightCliCheck("capabilities/a", "elements/c")).toBe(
      "ontology-atlas relation-check capabilities/a elements/c elements [vault]",
    );
    expect(formatPathRelationPreflightMcpCheck("capabilities/a", "elements/c")).toBe(
      'query_ontology({"operation":"relation_check","from":"capabilities/a","to":"elements/c","type":"elements"})',
    );
    expect(formatPathExplainRelationCliCheck("capabilities/a", "elements/c")).toBe(
      "ontology-atlas explain capabilities/a elements/c [vault] --direction undirected --max-hops 5 --limit 10",
    );
    expect(formatPathExplainRelationMcpCheck("capabilities/a", "elements/c")).toBe(
      'query_ontology({"operation":"explain_relation","from":"capabilities/a","to":"elements/c","direction":"undirected","maxHops":5,"limit":10})',
    );
    expect(
      formatPathRelationPreflightMcpCheck(
        "domain:views",
        "capability:topology-analysis-modes",
      ),
    ).toBe(
      'query_ontology({"operation":"relation_check","from":"domain:views","to":"capability:topology-analysis-modes","type":"capabilities"})',
    );
    expect(inferPathRelationPreflightType("domain:views", "capability:topology-analysis-modes")).toBe(
      "capabilities",
    );
    expect(formatPathRelationPreflightReason("domain:views", "capability:topology-analysis-modes")).toBe(
      "domain -> capability maps to capabilities because domains own capabilities.",
    );
  });

  it("formats browse and builder links for topology graph ids", () => {
    expect(formatPathOntologyHref("capability:topology-analysis-modes")).toBe(
      "/ontology/?node=capability%3Atopology-analysis-modes",
    );
    expect(formatPathBuilderHref("capability:topology-analysis-modes")).toBe(
      "/ontology/edit/?node=capabilities%2Ftopology-analysis-modes",
    );
    expect(formatPathBuilderHref("domains/views")).toBe(
      "/ontology/edit/?node=domains%2Fviews",
    );
  });
});

describe("buildPathRelationSteps", () => {
  it("keeps relation labels between each visible path hop", () => {
    expect(
      buildPathRelationSteps({
        slugs: ["a", "b", "c"],
        getRelation: (from, to) => `${from}->${to}`,
      }),
    ).toEqual([
      { from: "a", to: "b", relation: "a->b" },
      { from: "b", to: "c", relation: "b->c" },
    ]);
  });

  it("falls back when a highlighted edge has no readable relation", () => {
    expect(
      buildPathRelationSteps({
        slugs: ["a", "b"],
        getRelation: () => null,
      }),
    ).toEqual([{ from: "a", to: "b", relation: "related" }]);
  });
});
