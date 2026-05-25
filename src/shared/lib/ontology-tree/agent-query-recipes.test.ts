import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { KnowledgeGraphEdge, KnowledgeGraphNode } from "@/entities/knowledge-graph";
import {
  buildAgentHandoffPrompt,
  buildAgentGraphDbQueryPack,
  buildAgentInvestigationPlaybooks,
  buildAgentQueryRecipes,
  buildAgentTraversalStrategies,
  buildAgentWriteGuardrails,
  countAgentGraphDbCliPackCommands,
  formatAgentGraphDbCliPack,
  formatAgentGraphDbQueryPack,
  formatAgentGraphDbQueryPackItemPrompt,
  formatAgentGuardrailPrompt,
  formatAgentPlaybookPrompt,
  formatAgentQueryCallCliCommand,
  formatAgentRecipeCliCommand,
  formatAgentRecipePayload,
  formatAgentRunOrderPrompt,
  formatAgentTraversalPacket,
  formatAgentTraversalStrategyPrompt,
  selectAgentProjectEntrypoint,
  selectAgentQueryEntrypoints,
  validateAgentMcpQueryCall,
  validateAgentMcpToolCall,
} from "./agent-query-recipes";

function readMcpOperationEnum(name: string): string[] {
  const source = readFileSync(join(process.cwd(), "mcp/src/ontology-engine.mjs"), "utf-8");
  const match = source.match(
    new RegExp(`export const ${name} = Object\\.freeze\\(\\[([\\s\\S]*?)\\]\\);`),
  );
  if (!match) throw new Error(`Unable to read ${name} from ontology-engine.mjs`);
  return Array.from(match[1]!.matchAll(/'([^']+)'/g), (row) => row[1]!);
}

function readMcpPlanTargetEnum(): string[] {
  return readMcpOperationEnum("QUERY_ONTOLOGY_OPERATIONS").filter(
    (operation) => operation !== "query_plan",
  );
}

function node(id: string, kind: string): KnowledgeGraphNode {
  return {
    id,
    title: id,
    kind,
    projectIds: [],
    evidenceIds: [],
    lastApprovedAt: new Date(0),
    lastApprovedBy: "test",
  };
}

function edge(id: string, from: string, to: string): KnowledgeGraphEdge {
  return {
    id,
    from,
    to,
    type: "contains",
    projectIds: [],
    evidenceIds: [],
    lastApprovedAt: new Date(0),
    lastApprovedBy: "test",
  };
}

describe("buildAgentQueryRecipes", () => {
  it("starts ready ontologies with the agent handoff brief", () => {
    const recipes = buildAgentQueryRecipes("ready");

    expect(recipes.map((recipe) => recipe.id)).toEqual([
      "agent_brief",
      "workspace_brief",
      "query_plan",
      "health",
      "node_profile",
      "components",
      "path",
      "explain_relation",
      "similar_nodes",
      "relation_check",
      "blast_radius",
      "domain_matrix",
      "all_paths",
      "pattern_walk",
      "cycles",
      "topological_order",
      "growth_plan",
      "maintenance_plan",
    ]);
    expect(recipes[0]?.priority).toBe("primary");
  });

  it("promotes health when the graph needs shape or links", () => {
    const shape = buildAgentQueryRecipes("needs-shape");
    const links = buildAgentQueryRecipes("needs-links");

    expect(shape.slice(0, 3).map((recipe) => recipe.id)).toEqual([
      "agent_brief",
      "workspace_brief",
      "health",
    ]);
    expect(links.find((recipe) => recipe.id === "health")?.priority).toBe("primary");
  });

  it("keeps recipes on query_ontology operations", () => {
    for (const recipe of buildAgentQueryRecipes("ready")) {
      expect(recipe.operation).toMatch(/^query_ontology\./);
      expect(recipe.tool).toBe("query_ontology");
      expect(recipe.arguments.operation).toBe(recipe.id);
    }
  });

  it("includes executable planning arguments before impact recipes", () => {
    const recipes = buildAgentQueryRecipes("ready");
    const plan = recipes.find((recipe) => recipe.id === "query_plan");

    expect(plan?.arguments).toEqual({
      operation: "query_plan",
      targetOperation: "blast_radius",
      slug: "<slug>",
      depth: 2,
    });
  });

  it("uses a suggested entrypoint slug for impact recipes", () => {
    const recipes = buildAgentQueryRecipes("ready", [
      {
        slug: "capabilities/mcp-server",
        title: "MCP Server",
        kind: "capability",
        degree: 7,
      },
      {
        slug: "domains/views",
        title: "Views",
        kind: "domain",
        degree: 6,
      },
    ]);

    expect(recipes.find((recipe) => recipe.id === "query_plan")?.arguments.slug).toBe(
      "capabilities/mcp-server",
    );
    expect(recipes.find((recipe) => recipe.id === "node_profile")?.arguments.slug).toBe(
      "capabilities/mcp-server",
    );
    expect(recipes.find((recipe) => recipe.id === "path")?.arguments).toMatchObject({
      operation: "path",
      from: "capabilities/mcp-server",
      to: "domains/views",
    });
    expect(recipes.find((recipe) => recipe.id === "explain_relation")?.arguments).toMatchObject({
      operation: "explain_relation",
      from: "capabilities/mcp-server",
      to: "domains/views",
      direction: "undirected",
      types: ["depends_on", "relates"],
    });
    expect(recipes.find((recipe) => recipe.id === "similar_nodes")?.arguments).toEqual({
      operation: "similar_nodes",
      title: "MCP Server",
      candidateSlug: "capabilities/mcp-server",
      kind: "capability",
      limit: 10,
    });
    expect(recipes.find((recipe) => recipe.id === "relation_check")?.arguments).toEqual({
      operation: "relation_check",
      from: "capabilities/mcp-server",
      to: "domains/views",
      type: "depends_on",
    });
    expect(recipes.find((recipe) => recipe.id === "all_paths")?.arguments).toMatchObject({
      operation: "all_paths",
      from: "capabilities/mcp-server",
      to: "domains/views",
      searchBudget: 1000,
    });
    expect(recipes.find((recipe) => recipe.id === "blast_radius")?.arguments.slug).toBe(
      "capabilities/mcp-server",
    );
  });

  it("formats recipe payloads as copyable MCP tool calls", () => {
    const [recipe] = buildAgentQueryRecipes("ready");

    expect(formatAgentRecipePayload(recipe)).toBe(`{
  "tool": "query_ontology",
  "arguments": {
    "operation": "agent_brief"
  }
}`);
  });

  it("formats supported recipes as copyable CLI commands", () => {
    const recipes = buildAgentQueryRecipes("ready", [
      {
        slug: "capabilities/mcp-server",
        title: "MCP Server",
        kind: "capability",
        degree: 7,
      },
      {
        slug: "domains/views",
        title: "Views",
        kind: "domain",
        degree: 6,
      },
    ]);

    expect(formatAgentRecipeCliCommand(recipes.find((recipe) => recipe.id === "agent_brief")!)).toBe(
      "oh-my-ontology agent-brief [vault]",
    );
    expect(formatAgentRecipeCliCommand(recipes.find((recipe) => recipe.id === "query_plan")!)).toBe(
      "oh-my-ontology blast-radius capabilities/mcp-server [vault] --plan --depth 2",
    );
    expect(formatAgentRecipeCliCommand(recipes.find((recipe) => recipe.id === "node_profile")!)).toBe(
      "oh-my-ontology node capabilities/mcp-server [vault] --limit 12",
    );
    expect(formatAgentRecipeCliCommand(recipes.find((recipe) => recipe.id === "path")!)).toBe(
      "oh-my-ontology path capabilities/mcp-server domains/views [vault] --max-hops 5",
    );
    expect(formatAgentRecipeCliCommand(recipes.find((recipe) => recipe.id === "explain_relation")!)).toBe(
      "oh-my-ontology explain capabilities/mcp-server domains/views [vault] --direction undirected --max-hops 5 --types depends_on,relates --limit 10",
    );
    expect(formatAgentRecipeCliCommand(recipes.find((recipe) => recipe.id === "similar_nodes")!)).toBe(
      "oh-my-ontology similar 'MCP Server' [vault] --slug capabilities/mcp-server --kind capability --limit 10",
    );
    expect(formatAgentRecipeCliCommand(recipes.find((recipe) => recipe.id === "relation_check")!)).toBe(
      "oh-my-ontology relation-check capabilities/mcp-server domains/views depends_on [vault]",
    );
    expect(formatAgentRecipeCliCommand(recipes.find((recipe) => recipe.id === "all_paths")!)).toBe(
      "oh-my-ontology all-paths capabilities/mcp-server domains/views [vault] --plan --force --max-hops 3 --types depends_on,relates --search-budget 1000 --limit 10",
    );
    expect(
      formatAgentRecipeCliCommand({
        id: "query_plan",
        operation: "query_ontology.query_plan",
        promptKey: "agentRecipePromptQueryPlan",
        tool: "query_ontology",
        arguments: {
          operation: "query_plan",
          targetOperation: "centrality",
          types: ["depends_on", "relates"],
          limit: 10,
        },
        priority: "secondary",
      }),
    ).toBe("oh-my-ontology hubs [vault] --plan --limit 10 --types depends_on,relates");
    expect(
      formatAgentQueryCallCliCommand({
        operation: "query_ontology.explain_relation",
        tool: "query_ontology",
        arguments: {
          operation: "explain_relation",
          from: "capabilities/mcp-server",
          to: "domains/views",
          direction: "undirected",
          types: ["depends_on", "relates"],
          limit: 10,
        },
      }),
    ).toBe(
      "oh-my-ontology explain capabilities/mcp-server domains/views [vault] --direction undirected --types depends_on,relates --limit 10",
    );
    expect(
      formatAgentQueryCallCliCommand({
        operation: "query_ontology.match_edges",
        tool: "query_ontology",
        arguments: {
          operation: "match_edges",
          types: ["depends_on"],
          fromKind: "capability",
          toKind: "external",
          includeExternal: true,
          limit: 20,
        },
      }),
    ).toBe(
      "oh-my-ontology match-edges [vault] --from-kind capability --to-kind external --types depends_on --include-external --limit 20",
    );
    expect(
      formatAgentQueryCallCliCommand({
        operation: "query_ontology.query_plan",
        tool: "query_ontology",
        arguments: {
          operation: "query_plan",
          targetOperation: "match_edges",
          types: ["depends_on"],
          limit: 20,
        },
      }),
    ).toBe("oh-my-ontology match-edges [vault] --plan --types depends_on --limit 20");
    expect(
      formatAgentQueryCallCliCommand({
        operation: "query_ontology.match_nodes",
        tool: "query_ontology",
        arguments: {
          operation: "match_nodes",
          kind: "capability",
          minDegree: 2,
          hasIncoming: true,
          sort: "degree",
          limit: 20,
        },
      }),
    ).toBe(
      "oh-my-ontology match-nodes [vault] --kind capability --min-degree 2 --has-incoming --sort degree --limit 20",
    );
    expect(formatAgentRecipeCliCommand(recipes.find((recipe) => recipe.id === "domain_matrix")!)).toBe(
      "oh-my-ontology domain-matrix [vault]",
    );
    expect(formatAgentRecipeCliCommand(recipes.find((recipe) => recipe.id === "cycles")!)).toBe(
      "oh-my-ontology cycles [vault] --max-hops 8",
    );
    expect(formatAgentRecipeCliCommand(recipes.find((recipe) => recipe.id === "components")!)).toBe(
      "oh-my-ontology components [vault] --limit 20",
    );
    expect(formatAgentRecipeCliCommand(recipes.find((recipe) => recipe.id === "topological_order")!)).toBe(
      "oh-my-ontology topological-order [vault] --limit 20",
    );
    expect(formatAgentRecipeCliCommand(recipes.find((recipe) => recipe.id === "growth_plan")!)).toBe(
      "oh-my-ontology growth [vault] --limit 20",
    );
    expect(formatAgentRecipeCliCommand(recipes.find((recipe) => recipe.id === "maintenance_plan")!)).toBe(
      "oh-my-ontology maintenance [vault] --limit 20",
    );
    expect(
      formatAgentQueryCallCliCommand({
        operation: "query_ontology.domain_matrix",
        tool: "query_ontology",
        arguments: {
          operation: "domain_matrix",
          types: ["depends_on", "relates"],
          limit: 6,
        },
      }),
    ).toBe("oh-my-ontology domain-matrix [vault] --limit 6 --types depends_on,relates");
  });

  it("formats the first-contact run order as one copyable prompt", () => {
    const recipes = buildAgentQueryRecipes("ready", [
      {
        slug: "capabilities/mcp-server",
        title: "MCP Server",
        kind: "capability",
        degree: 7,
      },
      {
        slug: "domains/views",
        title: "Views",
        kind: "domain",
        degree: 6,
      },
    ]).slice(0, 5);

    const prompt = formatAgentRunOrderPrompt(recipes);

    expect(prompt).toContain("Use this oh-my-ontology first-contact run order");
    expect(prompt).toContain("1. query_ontology.agent_brief");
    expect(prompt).toContain('"operation": "query_plan"');
    expect(prompt).toContain("CLI fallback commands when the MCP connector is unavailable:");
    expect(prompt).toContain("oh-my-ontology blast-radius capabilities/mcp-server [vault] --plan --depth 2");
    expect(prompt).toContain("evidence.pathsComplete");
    expect(prompt).toContain("For match_nodes and match_edges, report totalMatches");
    expect(prompt).toContain("followUp details");
    expect(prompt).toContain("explain_relation, path, and relation_check");
  });

  it("builds a handoff prompt with first-contact and sync guidance", () => {
    const entrypoints = [
      {
        slug: "domains/views",
        title: "Views",
        kind: "domain",
        degree: 9,
      },
    ];
    const projectEntrypoint = {
      slug: "project",
      title: "oh-my-ontology",
      degree: 6,
    };
    const prompt = buildAgentHandoffPrompt(
      buildAgentQueryRecipes("ready", entrypoints, projectEntrypoint),
      entrypoints,
      projectEntrypoint,
      buildAgentTraversalStrategies(entrypoints, projectEntrypoint),
      buildAgentGraphDbQueryPack(entrypoints),
      buildAgentWriteGuardrails(entrypoints),
    );

    expect(prompt).toContain("Use the oh-my-ontology MCP server");
    expect(prompt).toContain("inspect health before writes");
    expect(prompt).toContain("recommendation.decision");
    expect(prompt).toContain("review_inverse");
    expect(prompt).toContain("review_new_schema");
    expect(prompt).toContain("Traversal strategy");
    expect(prompt).toContain("plan_before_enumeration");
    expect(prompt).toContain("bounded_path_evidence");
    expect(prompt).toContain("containment_cross_check");
    expect(prompt).toContain("limit, searchBudget, expandedStates, exhaustive");
    expect(prompt).toContain("evidence.status");
    expect(prompt).toContain("evidence.pathsComplete");
    expect(prompt).toContain("follow evidence.suggestedQuery or evidence.saferQuery");
    expect(prompt).toContain("budget-truncated");
    expect(prompt).toContain("run the returned followUp calls");
    expect(prompt).toContain("For match_nodes and match_edges, report totalMatches");
    expect(prompt).toContain("Graph DB query pack for local markdown graph scans");
    expect(prompt).toContain("Use this oh-my-ontology graph DB query pack");
    expect(prompt).toContain("MATCH (n:capability)");
    expect(prompt).toContain("query_ontology.match_nodes");
    expect(prompt).toContain("query_ontology.match_edges");
    expect(prompt).toContain("oh-my-ontology match-nodes [vault] --plan");
    expect(prompt).toContain("oh-my-ontology match-edges [vault] --plan");
    expect(prompt).toContain("sync the docs/ontology vault");
    expect(prompt).toContain("query_ontology.query_plan");
    expect(prompt).toContain("query_ontology.node_profile");
    expect(prompt).toContain("query_ontology.path");
    expect(prompt).toContain("query_ontology.explain_relation");
    expect(prompt).toContain("query_ontology.relation_check");
    expect(prompt).toContain("query_ontology.all_paths");
    expect(prompt).toContain("query_ontology.pattern_walk");
    expect(prompt).toContain('"targetOperation": "blast_radius"');
    expect(prompt).toContain("CLI fallback commands when the MCP connector is unavailable");
    expect(prompt).toContain("oh-my-ontology agent-brief [vault]");
    expect(prompt).toContain("oh-my-ontology blast-radius domains/views [vault] --plan --depth 2");
    expect(prompt).toContain("oh-my-ontology all-paths");
    expect(prompt).toContain("oh-my-ontology explain domains/views '<other-slug>' [vault]");
    expect(prompt).toContain("--plan --force --max-hops 3");
    expect(prompt).toContain("Write guardrails before changing the markdown vault");
    expect(prompt).toContain("skip_existing means do not add");
    expect(prompt).toContain("safe_to_add still requires citing relation_check evidence");
    expect(prompt).toContain("## Guardrail 1. preflight_relation");
    expect(prompt).toContain("## Guardrail 2. preflight_rename");
    expect(prompt).toContain("## Guardrail 3. post_change_sync");
    expect(prompt).toContain('"tool": "find_backlinks"');
    expect(prompt).toContain('"tool": "validate_vault"');
    expect(prompt).toContain("Suggested starting slugs");
    expect(prompt).toContain("project (project, degree 6)");
    expect(prompt).toContain("domains/views");
  });

  it("builds intent-first playbooks with ordered MCP graph calls", () => {
    const playbooks = buildAgentInvestigationPlaybooks(
      [
        {
          slug: "capabilities/mcp-server",
          title: "MCP Server",
          kind: "capability",
          degree: 7,
        },
        {
          slug: "domains/views",
          title: "Views",
          kind: "domain",
          degree: 6,
        },
      ],
      {
        slug: "project",
        title: "oh-my-ontology",
        degree: 5,
      },
    );

    expect(playbooks.map((playbook) => playbook.id)).toEqual([
      "refactor_impact",
      "onboarding_map",
      "coupling_audit",
      "graph_traversal",
    ]);
    expect(playbooks[0]?.payloads.map((payload) => payload.arguments.operation)).toEqual([
      "workspace_brief",
      "query_plan",
      "node_profile",
      "blast_radius",
      "path",
      "explain_relation",
      "relation_check",
    ]);
    expect(playbooks[0]?.payloads[1]?.arguments).toMatchObject({
      targetOperation: "blast_radius",
      slug: "capabilities/mcp-server",
    });
    expect(playbooks[0]?.payloads[4]?.arguments).toMatchObject({
      from: "capabilities/mcp-server",
      to: "domains/views",
    });
    expect(playbooks[0]?.payloads[5]?.arguments).toMatchObject({
      operation: "explain_relation",
      from: "capabilities/mcp-server",
      to: "domains/views",
      direction: "undirected",
    });
    expect(playbooks[0]?.payloads[6]?.arguments).toEqual({
      operation: "relation_check",
      from: "capabilities/mcp-server",
      to: "domains/views",
      type: "depends_on",
    });
    expect(playbooks[0]?.evidence.join(" ")).toContain("blast radius");
    expect(playbooks[0]?.stopWhen.join(" ")).toContain("relation_check");
    expect(playbooks[1]?.payloads.map((payload) => payload.arguments.operation)).toEqual([
      "workspace_brief",
      "domain_matrix",
      "query_plan",
      "match_nodes",
      "node_profile",
    ]);
    expect(playbooks[1]?.payloads[2]).toEqual({
      operation: "query_ontology.query_plan",
      tool: "query_ontology",
      arguments: {
        operation: "query_plan",
        targetOperation: "match_nodes",
        kind: "capability",
        minDegree: 2,
        sort: "degree",
        limit: 10,
      },
    });
    expect(formatAgentQueryCallCliCommand(playbooks[1]!.payloads[2]!)).toBe(
      "oh-my-ontology match-nodes [vault] --plan --kind capability --min-degree 2 --sort degree --limit 10",
    );
    expect(formatAgentQueryCallCliCommand(playbooks[1]!.payloads[3]!)).toBe(
      "oh-my-ontology match-nodes [vault] --kind capability --min-degree 2 --sort degree --limit 10",
    );
    expect(playbooks[1]?.evidence.join(" ")).toContain("Graph DB-style node scan");
    expect(playbooks[1]?.stopWhen.join(" ")).toContain("query_plan(match_nodes)");
    expect(playbooks[2]?.payloads.map((payload) => payload.arguments.operation)).toEqual([
      "health",
      "domain_matrix",
      "query_plan",
      "centrality",
      "query_plan",
      "match_edges",
    ]);
    expect(playbooks[2]?.payloads[2]).toEqual({
      operation: "query_ontology.query_plan",
      tool: "query_ontology",
      arguments: {
        operation: "query_plan",
        targetOperation: "centrality",
        types: ["depends_on", "relates"],
        limit: 10,
      },
    });
    expect(formatAgentQueryCallCliCommand(playbooks[2]!.payloads[2]!)).toBe(
      "oh-my-ontology hubs [vault] --plan --limit 10 --types depends_on,relates",
    );
    expect(playbooks[2]?.payloads[3]).toEqual({
      operation: "query_ontology.centrality",
      tool: "query_ontology",
      arguments: {
        operation: "centrality",
        types: ["depends_on", "relates"],
        limit: 10,
      },
    });
    expect(playbooks[2]?.payloads[4]).toEqual({
      operation: "query_ontology.query_plan",
      tool: "query_ontology",
      arguments: {
        operation: "query_plan",
        targetOperation: "match_edges",
        types: ["depends_on"],
        limit: 20,
      },
    });
    expect(formatAgentQueryCallCliCommand(playbooks[2]!.payloads[4]!)).toBe(
      "oh-my-ontology match-edges [vault] --plan --types depends_on --limit 20",
    );
    expect(playbooks[3]?.payloads.map((payload) => payload.arguments.operation)).toEqual([
      "schema",
      "query_plan",
      "all_paths",
      "pattern_walk",
      "project_map",
    ]);
    expect(formatAgentQueryCallCliCommand(playbooks[3]!.payloads[0]!)).toBe(
      "oh-my-ontology schema [vault] --limit 20",
    );
    expect(playbooks[3]?.payloads[1]?.arguments).toMatchObject({
      operation: "query_plan",
      targetOperation: "all_paths",
      from: "capabilities/mcp-server",
      to: "domains/views",
      searchBudget: 1000,
    });
    expect(playbooks[3]?.payloads[2]?.arguments).toMatchObject({
      operation: "all_paths",
      searchBudget: 1000,
    });
    expect(playbooks[3]?.payloads[3]?.arguments).toEqual({
      operation: "pattern_walk",
      slug: "project",
      pattern: ["domains", "capabilities"],
      direction: "outgoing",
      limit: 20,
    });
    expect(formatAgentQueryCallCliCommand(playbooks[3]!.payloads[3]!)).toBe(
      "oh-my-ontology pattern-walk project [vault] --pattern domains,capabilities --direction outgoing --limit 20",
    );
    expect(playbooks[3]?.payloads[4]?.arguments).toMatchObject({
      operation: "project_map",
      project: "project",
    });
    expect(formatAgentQueryCallCliCommand(playbooks[3]!.payloads[4]!)).toBe(
      "oh-my-ontology project-map project [vault] --limit 10 --item-limit 20",
    );
    expect(playbooks[3]?.evidence.join(" ")).toContain("evidence.status");
    expect(playbooks[3]?.evidence.join(" ")).toContain("evidence.pathsComplete");
    expect(playbooks[3]?.stopWhen.join(" ")).toContain("query_plan");
    expect(playbooks[3]?.stopWhen.join(" ")).toContain("evidence.suggestedQuery");
  });

  it("builds a graph DB-style query pack with plan-first scans and bounded evidence", () => {
    const pack = buildAgentGraphDbQueryPack([
      {
        slug: "capabilities/mcp-server",
        title: "MCP Server",
        kind: "capability",
        degree: 7,
      },
      {
        slug: "domains/views",
        title: "Views",
        kind: "domain",
        degree: 6,
      },
    ]);

    expect(pack.map((item) => item.id)).toEqual([
      "graph_facets",
      "node_scan",
      "edge_scan",
      "domain_coupling",
      "path_evidence",
    ]);
    expect(pack[0]?.intent).toContain("MATCH graph");
    expect(pack[0]?.payloads.map((payload) => payload.arguments.operation)).toEqual([
      "facets",
      "schema",
    ]);
    expect(pack[0]?.payloads[0]?.arguments).toEqual({
      operation: "facets",
      limit: 10,
    });
    expect(formatAgentQueryCallCliCommand(pack[0]!.payloads[0]!)).toBe(
      "oh-my-ontology facets [vault] --limit 10",
    );
    expect(formatAgentQueryCallCliCommand(pack[0]!.payloads[1]!)).toBe(
      "oh-my-ontology schema [vault] --limit 20",
    );
    expect(pack[1]?.intent).toContain("MATCH (n:capability)");
    expect(pack[1]?.payloads.map((payload) => payload.arguments.operation)).toEqual([
      "query_plan",
      "match_nodes",
    ]);
    expect(pack[1]?.payloads[0]?.arguments).toEqual({
      operation: "query_plan",
      targetOperation: "match_nodes",
      kind: "capability",
      minDegree: 2,
      sort: "degree",
      limit: 10,
    });
    expect(formatAgentQueryCallCliCommand(pack[1]!.payloads[0]!)).toBe(
      "oh-my-ontology match-nodes [vault] --plan --kind capability --min-degree 2 --sort degree --limit 10",
    );
    expect(pack[2]?.payloads.map((payload) => payload.arguments.operation)).toEqual([
      "query_plan",
      "match_edges",
    ]);
    expect(formatAgentQueryCallCliCommand(pack[2]!.payloads[1]!)).toBe(
      "oh-my-ontology match-edges [vault] --types depends_on --limit 20",
    );
    expect(pack[3]?.payloads.map((payload) => payload.arguments.operation)).toEqual([
      "domain_matrix",
      "query_plan",
      "centrality",
    ]);
    expect(formatAgentQueryCallCliCommand(pack[3]!.payloads[0]!)).toBe(
      "oh-my-ontology domain-matrix [vault] --limit 6 --types depends_on,relates",
    );
    expect(pack[4]?.payloads[0]?.arguments).toEqual({
      operation: "query_plan",
      targetOperation: "all_paths",
      from: "capabilities/mcp-server",
      to: "domains/views",
      maxHops: 3,
      types: ["depends_on", "relates"],
      searchBudget: 1000,
      limit: 10,
    });
    expect(formatAgentQueryCallCliCommand(pack[4]!.payloads[0]!)).toBe(
      "oh-my-ontology all-paths capabilities/mcp-server domains/views [vault] --plan --force --max-hops 3 --types depends_on,relates --search-budget 1000 --limit 10",
    );
  });

  it("formats the graph DB query pack as copyable MCP plus CLI fallback evidence", () => {
    const pack = buildAgentGraphDbQueryPack([
      {
        slug: "capabilities/mcp-server",
        title: "MCP Server",
        kind: "capability",
        degree: 7,
      },
      {
        slug: "domains/views",
        title: "Views",
        kind: "domain",
        degree: 6,
      },
    ]);
    const itemPrompt = formatAgentGraphDbQueryPackItemPrompt(pack[0]!);
    const prompt = formatAgentGraphDbQueryPack(pack);

    expect(itemPrompt).toContain("graph DB-style query pack");
    expect(itemPrompt).toContain("Intent: MATCH graph");
    expect(itemPrompt).toContain("MCP calls:");
    expect(itemPrompt).toContain("query_ontology.facets");
    expect(itemPrompt).toContain("query_ontology.schema");
    expect(itemPrompt).toContain("CLI fallback commands when the MCP connector is unavailable:");
    expect(itemPrompt).toContain("oh-my-ontology facets [vault] --limit 10");
    expect(itemPrompt).toContain("For match_nodes and match_edges, report totalMatches");

    expect(prompt).toContain("scan the local markdown vault like a graph database");
    expect(prompt).toContain("## 1. graph_facets");
    expect(prompt).toContain("## 5. path_evidence");
    expect(prompt).toContain("MATCH p=(from)-[:depends_on|relates*..3]-(to)");
    expect(prompt).toContain("oh-my-ontology all-paths capabilities/mcp-server domains/views [vault] --plan --force --max-hops 3");
    expect(prompt).toContain("evidence.pathsComplete");
  });

  it("formats a CLI-only graph DB pack for connector-less sessions", () => {
    const graphDbQueryPack = buildAgentGraphDbQueryPack([
      {
        slug: "capabilities/mcp-server",
        title: "MCP Server",
        kind: "capability",
        degree: 7,
      },
      {
        slug: "domains/views",
        title: "Views",
        kind: "domain",
        degree: 6,
      },
    ]);
    const cliPack = formatAgentGraphDbCliPack(graphDbQueryPack);

    expect(cliPack).toContain("when the MCP connector is unavailable");
    expect(cliPack).toContain("Mode guide:");
    expect(cliPack).toContain("CLI-only: validate, workspace-brief, graph scans, graph DB pack");
    expect(cliPack).toContain("MCP-connected: Claude Code, Codex, or Cursor can call local read/write tools");
    expect(cliPack).toContain("Setup gate: run the JSON fallback check before edits");
    expect(cliPack).toContain("Self-check first: Claude Code/Codex automation can parse ok, performanceOk, failed, timeoutMs");
    expect(cliPack).toContain("[self_check] oh-my-ontology agent-brief [vault] --verify-fallbacks --json --fallback-timeout-ms 15000 --fallback-slow-ms 5000 --fallback-concurrency 4");
    expect(countAgentGraphDbCliPackCommands(graphDbQueryPack)).toBe(
      cliPack.split("\n").filter((row) => /^\d+\. /.test(row)).length,
    );
    expect(cliPack).toContain("Evidence rule: scan rows are candidates, not proof");
    expect(cliPack).toContain("Proof checklist: report totalMatches/limited/row count");
    expect(cliPack).toContain("run explain/path/relation-check for edge rows");
    expect(cliPack).toContain("report evidence.pathsComplete for paths");
    expect(cliPack).toContain("intent: MATCH graph RETURN kind/domain/degree/relation facets");
    expect(cliPack).toContain("[graph_facets] oh-my-ontology facets [vault] --limit 10");
    expect(cliPack).toContain("[graph_facets] oh-my-ontology schema [vault] --limit 20");
    expect(cliPack).toContain("intent: MATCH (n:capability) WHERE degree(n) >= 2 RETURN n");
    expect(cliPack).toContain("[node_scan] oh-my-ontology match-nodes [vault] --plan");
    expect(cliPack).toContain("[edge_scan] oh-my-ontology match-edges [vault] --plan");
    expect(cliPack).toContain("[domain_coupling] oh-my-ontology domain-matrix [vault]");
    expect(cliPack).toContain("[path_evidence] oh-my-ontology all-paths capabilities/mcp-server domains/views [vault] --plan --force --max-hops 3");
    expect(cliPack).toContain("[path_evidence] oh-my-ontology explain capabilities/mcp-server domains/views [vault]");
  });

  it("builds plan-first traversal strategies with bounded evidence and containment checks", () => {
    const strategies = buildAgentTraversalStrategies(
      [
        {
          slug: "capabilities/mcp-server",
          title: "MCP Server",
          kind: "capability",
          degree: 7,
        },
        {
          slug: "domains/views",
          title: "Views",
          kind: "domain",
          degree: 6,
        },
      ],
      {
        slug: "project",
        title: "oh-my-ontology",
        degree: 5,
      },
    );

    expect(strategies.map((strategy) => strategy.id)).toEqual([
      "plan_before_enumeration",
      "bounded_path_evidence",
      "containment_cross_check",
    ]);
    expect(strategies[0]?.payloads[0]?.arguments).toEqual({
      operation: "query_plan",
      targetOperation: "all_paths",
      from: "capabilities/mcp-server",
      to: "domains/views",
      maxHops: 3,
      limit: 10,
      searchBudget: 1000,
      types: ["depends_on", "relates"],
    });
    expect(strategies[1]?.payloads[0]?.arguments).toEqual({
      operation: "all_paths",
      from: "capabilities/mcp-server",
      to: "domains/views",
      maxHops: 3,
      limit: 10,
      searchBudget: 1000,
      types: ["depends_on", "relates"],
    });
    expect(strategies[1]?.evidence.join(" ")).toContain("evidence.pathsComplete");
    expect(strategies[1]?.stopWhen.join(" ")).toContain("evidence.saferQuery");
    expect(strategies[2]?.payloads.map((payload) => payload.arguments.operation)).toEqual([
      "pattern_walk",
      "project_map",
    ]);
    expect(strategies[2]?.payloads[0]?.arguments).toMatchObject({
      slug: "project",
      pattern: ["domains", "capabilities"],
    });
  });

  it("formats traversal strategies as copyable ordered prompts", () => {
    const [strategy] = buildAgentTraversalStrategies([
      {
        slug: "domains/views",
        title: "Views",
        kind: "domain",
        degree: 9,
      },
    ]);

    const prompt = formatAgentTraversalStrategyPrompt(strategy);

    expect(prompt).toContain("traversal strategy");
    expect(prompt).toContain("Plan first");
    expect(prompt).toContain("Evidence to report:");
    expect(prompt).toContain("Stop and narrow before writing if:");
    expect(prompt).toContain("totalPathsExact");
    expect(prompt).toContain("evidence.pathsComplete");
    expect(prompt).toContain("query_ontology.query_plan");
    expect(prompt).toContain('"targetOperation": "all_paths"');
  });

  it("formats the full traversal packet with MCP calls and CLI fallbacks", () => {
    const strategies = buildAgentTraversalStrategies(
      [
        {
          slug: "capabilities/mcp-server",
          title: "MCP Server",
          kind: "capability",
          degree: 7,
        },
        {
          slug: "domains/views",
          title: "Views",
          kind: "domain",
          degree: 6,
        },
      ],
      {
        slug: "project",
        title: "oh-my-ontology",
        degree: 5,
      },
    );

    const packet = formatAgentTraversalPacket(strategies);

    expect(packet).toContain("graph traversal packet");
    expect(packet).toContain("query_plan before all_paths");
    expect(packet).toContain("Execution gates:");
    expect(packet).toContain("1. plan_before_enumeration (first)");
    expect(packet).toContain("2. bounded_path_evidence (evidence)");
    expect(packet).toContain("3. containment_cross_check (confirm)");
    expect(packet).toContain("Evidence to report:");
    expect(packet).toContain("Stop and narrow before writing if:");
    expect(packet).toContain("query_plan.execution.nextStep");
    expect(packet).toContain("all_paths.totalPathsExact");
    expect(packet).toContain("pattern_walk and project_map disagree");
    expect(packet).toContain("MCP calls:");
    expect(packet).toContain("1. plan_before_enumeration / query_ontology.query_plan");
    expect(packet).toContain("2. bounded_path_evidence / query_ontology.all_paths");
    expect(packet).toContain("3. containment_cross_check / query_ontology.pattern_walk");
    expect(packet).toContain("4. containment_cross_check / query_ontology.project_map");
    expect(packet).toContain('"targetOperation": "all_paths"');
    expect(packet).toContain('"operation": "all_paths"');
    expect(packet).toContain("evidence.pathsComplete");
    expect(packet).toContain("CLI fallback commands when the MCP connector is unavailable:");
    expect(packet).toContain(
      "oh-my-ontology all-paths capabilities/mcp-server domains/views [vault] --plan --force --max-hops 3 --types depends_on,relates --search-budget 1000 --limit 10",
    );
  });

  it("formats playbooks as copyable ordered investigation prompts", () => {
    const [playbook] = buildAgentInvestigationPlaybooks([
      {
        slug: "domains/views",
        title: "Views",
        kind: "domain",
        degree: 9,
      },
    ]);

    const prompt = formatAgentPlaybookPrompt(playbook);

    expect(prompt).toContain("answer this investigation intent");
    expect(prompt).toContain("Evidence to report:");
    expect(prompt).toContain("Stop and explain before writing if:");
    expect(prompt).toContain("totalPathsExact");
    expect(prompt).toContain("evidence.pathsComplete");
    expect(prompt).toContain("evidence.saferQuery");
    expect(prompt).toContain("For match_nodes and match_edges, report totalMatches");
    expect(prompt).toContain("node_profile, match_edges, and blast_radius");
    expect(prompt).toContain("query_ontology.workspace_brief");
    expect(prompt).toContain("query_ontology.blast_radius");
    expect(prompt).toContain("query_ontology.explain_relation");
    expect(prompt).toContain('"slug": "domains/views"');
    expect(prompt).toContain("CLI fallback commands when the MCP connector is unavailable:");
    expect(prompt).toContain("oh-my-ontology workspace-brief [vault]");
    expect(prompt).toContain("oh-my-ontology blast-radius domains/views [vault] --depth 2 --direction incoming");
    expect(prompt).toContain("oh-my-ontology explain domains/views '<other-slug>' [vault]");
  });

  it("includes graph scan CLI fallbacks in coupling audit playbooks", () => {
    const playbooks = buildAgentInvestigationPlaybooks([
      {
        slug: "capabilities/mcp-server",
        title: "MCP Server",
        kind: "capability",
        degree: 7,
      },
    ]);
    const couplingAudit = playbooks.find((playbook) => playbook.id === "coupling_audit")!;

    const prompt = formatAgentPlaybookPrompt(couplingAudit);

    expect(prompt).toContain("oh-my-ontology hubs [vault] --plan --limit 10 --types depends_on,relates");
    expect(prompt).toContain("oh-my-ontology hubs [vault] --limit 10 --types depends_on,relates");
    expect(prompt).toContain("oh-my-ontology domain-matrix [vault]");
    expect(prompt).toContain("oh-my-ontology match-edges [vault] --plan --types depends_on --limit 20");
    expect(prompt).toContain("oh-my-ontology match-edges [vault] --types depends_on --limit 20");
  });

  it("includes plan-first node scan fallbacks in onboarding playbooks", () => {
    const playbooks = buildAgentInvestigationPlaybooks([
      {
        slug: "capabilities/mcp-server",
        title: "MCP Server",
        kind: "capability",
        degree: 7,
      },
    ]);
    const onboardingMap = playbooks.find((playbook) => playbook.id === "onboarding_map")!;

    const prompt = formatAgentPlaybookPrompt(onboardingMap);

    expect(prompt).toContain("query_ontology.match_nodes");
    expect(prompt).toContain("Graph DB-style node scan");
    expect(prompt).toContain("match_nodes followUp calls");
    expect(prompt).toContain(
      "oh-my-ontology match-nodes [vault] --plan --kind capability --min-degree 2 --sort degree --limit 10",
    );
    expect(prompt).toContain(
      "oh-my-ontology match-nodes [vault] --kind capability --min-degree 2 --sort degree --limit 10",
    );
  });

  it("builds write guardrails for relation, rename, and post-change sync gates", () => {
    const guardrails = buildAgentWriteGuardrails([
      {
        slug: "capabilities/mcp-server",
        title: "MCP Server",
        kind: "capability",
        degree: 7,
      },
      {
        slug: "domains/views",
        title: "Views",
        kind: "domain",
        degree: 6,
      },
    ]);

    expect(guardrails.map((guardrail) => guardrail.id)).toEqual([
      "preflight_relation",
      "preflight_rename",
      "post_change_sync",
    ]);
    expect(guardrails[0]?.payloads.map((payload) => payload.operation)).toEqual([
      "query_ontology.relation_check",
      "query_ontology.explain_relation",
      "query_ontology.path",
    ]);
    expect(guardrails[0]?.payloads[0]?.arguments).toEqual({
      operation: "relation_check",
      from: "capabilities/mcp-server",
      to: "domains/views",
      type: "depends_on",
    });
    expect(guardrails[1]?.payloads).toContainEqual({
      operation: "find_backlinks",
      tool: "find_backlinks",
      arguments: { slug: "capabilities/mcp-server" },
    });
    expect(guardrails[2]?.payloads).toContainEqual({
      operation: "validate_vault",
      tool: "validate_vault",
      arguments: {},
    });
    expect(guardrails[2]?.payloads.map((payload) => payload.operation)).toEqual([
      "query_ontology.health",
      "query_ontology.cycles",
      "query_ontology.growth_plan",
      "query_ontology.maintenance_plan",
      "validate_vault",
    ]);
    expect(guardrails[2]?.cliFallbackCommands).toEqual([
      "oh-my-ontology health [vault]",
      "oh-my-ontology cycles [vault] --max-hops 8",
      "oh-my-ontology growth [vault] --limit 20",
      "oh-my-ontology maintenance [vault] --limit 20",
      "oh-my-ontology validate [vault]",
    ]);
  });

  it("formats write guardrails as copyable preflight prompts", () => {
    const [guardrail] = buildAgentWriteGuardrails([
      {
        slug: "domains/views",
        title: "Views",
        kind: "domain",
        degree: 9,
      },
    ]);

    const prompt = formatAgentGuardrailPrompt(guardrail);

    expect(prompt).toContain("MCP write gate");
    expect(prompt).toContain("recommendation.decision");
    expect(prompt).toContain("review_inverse");
    expect(prompt).toContain("review_new_schema");
    expect(prompt).toContain("query_ontology.relation_check");
    expect(prompt).toContain("query_ontology.explain_relation");
    expect(prompt).toContain('"from": "domains/views"');
  });

  it("formats post-change sync guardrails with MCP and CLI fallback gates", () => {
    const syncGuardrail = buildAgentWriteGuardrails([
      {
        slug: "domains/views",
        title: "Views",
        kind: "domain",
        degree: 9,
      },
    ]).find((guardrail) => guardrail.id === "post_change_sync")!;

    const prompt = formatAgentGuardrailPrompt(syncGuardrail);

    expect(prompt).toContain("query_ontology.health");
    expect(prompt).toContain("query_ontology.cycles");
    expect(prompt).toContain("query_ontology.growth_plan");
    expect(prompt).toContain("query_ontology.maintenance_plan");
    expect(prompt).toContain("validate_vault");
    expect(prompt).toContain("CLI fallback:");
    expect(prompt).toContain("oh-my-ontology cycles [vault] --max-hops 8");
    expect(prompt).toContain("oh-my-ontology maintenance [vault] --limit 20");
  });

  it("validates non-query MCP tool calls used by write guardrails", () => {
    expect(
      validateAgentMcpToolCall({
        operation: "find_backlinks",
        tool: "find_backlinks",
        arguments: { slug: "domains/views" },
      }),
    ).toEqual([]);
    expect(
      validateAgentMcpToolCall({
        operation: "validate_vault",
        tool: "validate_vault",
        arguments: {},
      }),
    ).toEqual([]);
    expect(
      validateAgentMcpToolCall({
        operation: "find_neighbors",
        tool: "find_backlinks",
        arguments: { slug: "" },
      }),
    ).toEqual([
      "operation label must be find_backlinks, received find_neighbors",
      "find_backlinks.slug must be a non-empty string",
    ]);
  });

  it("keeps every generated MCP payload aligned with the supported query surface", () => {
    const entrypoints = [
      {
        slug: "capabilities/mcp-server",
        title: "MCP Server",
        kind: "capability",
        degree: 7,
      },
      {
        slug: "domains/views",
        title: "Views",
        kind: "domain",
        degree: 6,
      },
    ];
    const recipeCalls = buildAgentQueryRecipes("ready", entrypoints);
    const playbookCalls = buildAgentInvestigationPlaybooks(entrypoints).flatMap(
      (playbook) => playbook.payloads,
    );
    const traversalStrategyCalls = buildAgentTraversalStrategies(entrypoints).flatMap(
      (strategy) => strategy.payloads,
    );
    const guardrailCalls = buildAgentWriteGuardrails(entrypoints).flatMap(
      (guardrail) => guardrail.payloads,
    );

    for (const payload of [...recipeCalls, ...playbookCalls, ...traversalStrategyCalls]) {
      expect(validateAgentMcpQueryCall(payload), payload.operation).toEqual([]);
      expect(readMcpOperationEnum("QUERY_ONTOLOGY_OPERATIONS"), payload.operation).toContain(
        payload.arguments.operation,
      );
      if (payload.arguments.operation === "query_plan") {
        expect(readMcpPlanTargetEnum(), payload.operation).toContain(
          payload.arguments.targetOperation,
        );
      }
    }

    for (const payload of guardrailCalls) {
      expect(validateAgentMcpToolCall(payload), payload.operation).toEqual([]);
      if (payload.tool === "query_ontology") {
        expect(readMcpOperationEnum("QUERY_ONTOLOGY_OPERATIONS"), payload.operation).toContain(
          payload.arguments.operation,
        );
      }
    }
  });

  it("reports invalid generated payload drift before users copy it", () => {
    expect(
      validateAgentMcpQueryCall({
        operation: "query_ontology.query_plan",
        tool: "query_ontology",
        arguments: {
          operation: "query_plan",
          targetOperation: "not_real",
        },
      }),
    ).toEqual(["unsupported query_plan targetOperation: not_real"]);

    expect(
      validateAgentMcpQueryCall({
        operation: "query_ontology.health",
        tool: "query_ontology",
        arguments: {
          operation: "workspace_brief",
        },
      }),
    ).toEqual([
      "operation label must be query_ontology.workspace_brief, received query_ontology.health",
    ]);
  });

  it("refuses to format invalid MCP payloads", () => {
    expect(() =>
      formatAgentRecipePayload({
        id: "query_plan",
        operation: "query_ontology.query_plan",
        promptKey: "agentRecipePromptQueryPlan",
        tool: "query_ontology",
        arguments: {
          operation: "query_plan",
          targetOperation: "not_real",
        },
        priority: "secondary",
      }),
    ).toThrow(/Invalid agent MCP query payload/);
  });
});

describe("selectAgentQueryEntrypoints", () => {
  it("selects connected ontology hubs as concrete agent starting slugs", () => {
    const nodes = [
      node("project:app", "project"),
      node("domains/views", "domain"),
      node("capabilities/mcp-server", "capability"),
      node("elements/panel", "element"),
      node("docs/readme", "document"),
      node("domains/orphan", "domain"),
    ];
    const edges = [
      edge("e1", "project:app", "domains/views"),
      edge("e2", "domains/views", "capabilities/mcp-server"),
      edge("e3", "domains/views", "elements/panel"),
      edge("e4", "capabilities/mcp-server", "elements/panel"),
      edge("e5", "docs/readme", "domains/views"),
    ];

    const entrypoints = selectAgentQueryEntrypoints(nodes, edges, 3);

    expect(entrypoints).toEqual([
      {
        slug: "domains/views",
        title: "domains/views",
        kind: "domain",
        degree: 4,
      },
      {
        slug: "capabilities/mcp-server",
        title: "capabilities/mcp-server",
        kind: "capability",
        degree: 2,
      },
      {
        slug: "elements/panel",
        title: "elements/panel",
        kind: "element",
        degree: 2,
      },
    ]);
  });
});

describe("selectAgentProjectEntrypoint", () => {
  it("selects the highest-degree project root for copyable traversal recipes", () => {
    const nodes = [
      node("project:small", "project"),
      node("project:main", "project"),
      node("domains/views", "domain"),
      node("capabilities/mcp-server", "capability"),
    ];
    const edges = [
      edge("e1", "project:main", "domains/views"),
      edge("e2", "project:main", "capabilities/mcp-server"),
      edge("e3", "project:small", "domains/views"),
    ];

    expect(selectAgentProjectEntrypoint(nodes, edges)).toEqual({
      slug: "project:main",
      title: "project:main",
      degree: 2,
    });
  });

  it("keeps project traversal payloads concrete when a project root is known", () => {
    const recipes = buildAgentQueryRecipes(
      "ready",
      [
        {
          slug: "capabilities/mcp-server",
          title: "MCP Server",
          kind: "capability",
          degree: 7,
        },
      ],
      {
        slug: "project",
        title: "oh-my-ontology",
        degree: 5,
      },
    );

    expect(recipes.find((recipe) => recipe.id === "pattern_walk")?.arguments).toEqual({
      operation: "pattern_walk",
      slug: "project",
      pattern: ["domains", "capabilities"],
      direction: "outgoing",
      limit: 20,
    });
  });
});
