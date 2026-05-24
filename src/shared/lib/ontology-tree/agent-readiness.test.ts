import { describe, expect, it } from "vitest";
import type { KnowledgeGraphEdge, KnowledgeGraphNode } from "@/entities/knowledge-graph";
import {
  buildAgentReadinessCliCommands,
  buildAgentReadinessPrompt,
  buildAgentReadinessSummary,
  formatAgentReadinessCliCommands,
  validateAgentReadinessToolCall,
} from "./agent-readiness";

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

describe("buildAgentReadinessSummary", () => {
  it("marks a shaped and connected ontology as ready", () => {
    const nodes = [
      node("project:app", "project"),
      node("domain:core", "domain"),
      node("capability:mcp", "capability"),
      node("element:sdk", "element"),
    ];
    const edges = [
      edge("e1", "project:app", "domain:core"),
      edge("e2", "domain:core", "capability:mcp"),
      edge("e3", "capability:mcp", "element:sdk"),
      edge("e4", "domain:core", "element:sdk"),
    ];

    const summary = buildAgentReadinessSummary(nodes, edges, { orphans: [] });

    expect(summary.status).toBe("ready");
    expect(summary.score).toBe(100);
    expect(summary.averageDegree).toBe(2);
    expect(summary.actionKeys).toEqual(["inspectHubs", "syncAfterChanges"]);
  });

  it("prioritizes unknown/stub shape problems over link problems", () => {
    const nodes = [node("domain:core", "domain"), node("unknown:ghost", "unknown")];
    const edges: KnowledgeGraphEdge[] = [];

    const summary = buildAgentReadinessSummary(nodes, edges, { orphans: [nodes[1]!] });

    expect(summary.status).toBe("needs-shape");
    expect(summary.unknownNodes).toBe(1);
    expect(summary.orphanCount).toBe(1);
    expect(summary.actionKeys).toEqual([
      "resolveUnknown",
      "addConcepts",
      "linkOrphans",
      "addRelations",
    ]);
  });

  it("marks known nodes without enough containment as needing links", () => {
    const nodes = [
      node("domain:core", "domain"),
      node("capability:mcp", "capability"),
      node("element:sdk", "element"),
    ];

    const summary = buildAgentReadinessSummary(nodes, [], { orphans: [nodes[2]!] });

    expect(summary.status).toBe("needs-links");
    expect(summary.score).toBe(40);
    expect(summary.actionKeys).toEqual(["linkOrphans", "addRelations"]);
  });

  it("builds a copyable readiness repair prompt for agents", () => {
    const summary = buildAgentReadinessSummary(
      [node("domain:core", "domain"), node("unknown:ghost", "unknown")],
      [],
      { orphans: [node("unknown:ghost", "unknown")] },
    );

    const prompt = buildAgentReadinessPrompt(summary);

    expect(prompt).toContain("Current agent graph readiness: needs-shape (0/100).");
    expect(prompt).toContain("workspace_brief, health, get_concept");
    expect(prompt).toContain("Resolve unknown/stub nodes");
    expect(prompt).toContain('"tool": "query_ontology"');
    expect(prompt).toContain('"operation": "workspace_brief"');
    expect(prompt).toContain('"operation": "cycles"');
    expect(prompt).toContain('"operation": "growth_plan"');
    expect(prompt).toContain('"operation": "maintenance_plan"');
    expect(prompt).toContain('"tool": "find_orphans"');
    expect(prompt).toContain('"excludeKinds"');
    expect(prompt).not.toContain('"kinds"');
    expect(prompt).toContain("If the MCP connector is unavailable");
    expect(prompt).toContain("oh-my-ontology agent-brief [vault]");
    expect(prompt).toContain("oh-my-ontology agent-brief [vault] --graph-db-pack");
    expect(prompt).toContain(
      "oh-my-ontology agent-brief [vault] --verify-fallbacks --json --fallback-timeout-ms 15000 --fallback-slow-ms 5000",
    );
    expect(prompt).toContain("oh-my-ontology match-nodes [vault] --kind unknown --limit 20");
    expect(prompt).toContain("oh-my-ontology infer-imports [repo] --vault [vault] --max-files 5000");
    expect(prompt).toContain("Only write after confirming");
  });

  it("builds de-duplicated terminal fallbacks for connector-less sessions", () => {
    const readySummary = buildAgentReadinessSummary(
      [
        node("project:app", "project"),
        node("domain:core", "domain"),
        node("capability:mcp", "capability"),
        node("element:sdk", "element"),
      ],
      [
        edge("e1", "project:app", "domain:core"),
        edge("e2", "domain:core", "capability:mcp"),
        edge("e3", "capability:mcp", "element:sdk"),
      ],
      { orphans: [] },
    );

    const commands = buildAgentReadinessCliCommands(readySummary);
    const formatted = formatAgentReadinessCliCommands(readySummary);

    expect(commands.map((item) => item.command)).toEqual([
      "oh-my-ontology agent-brief [vault]",
      "oh-my-ontology agent-brief [vault] --graph-db-pack",
      "oh-my-ontology agent-brief [vault] --verify-fallbacks --json --fallback-timeout-ms 15000 --fallback-slow-ms 5000",
      "oh-my-ontology workspace-brief [vault]",
      "oh-my-ontology health [vault]",
      "oh-my-ontology cycles [vault] --max-hops 8",
      "oh-my-ontology growth [vault] --limit 20",
      "oh-my-ontology maintenance [vault] --limit 20",
      "oh-my-ontology node <hub-slug> [vault] --limit 12",
      "oh-my-ontology blast-radius <hub-slug> [vault] --depth 2 --direction incoming",
      "oh-my-ontology validate [vault]",
    ]);
    expect(new Set(commands.map((item) => item.command)).size).toBe(commands.length);
    expect(formatted).toContain("1. oh-my-ontology agent-brief [vault]");
    expect(formatted).toContain("2. oh-my-ontology agent-brief [vault] --graph-db-pack");
    expect(formatted).toContain(
      "3. oh-my-ontology agent-brief [vault] --verify-fallbacks --json --fallback-timeout-ms 15000 --fallback-slow-ms 5000",
    );
    expect(formatted).toContain("8. oh-my-ontology maintenance [vault] --limit 20");
    expect(formatted).toContain("11. oh-my-ontology validate [vault]");
  });

  it("validates readiness repair MCP payloads before they are copied", () => {
    expect(
      validateAgentReadinessToolCall({
        tool: "query_ontology",
        arguments: { operation: "relation_check", from: "<from-slug>", to: "<to-slug>", type: "depends_on" },
      }),
    ).toEqual([]);
    expect(
      validateAgentReadinessToolCall({
        tool: "query_ontology",
        arguments: { operation: "maintenance_plan", limit: 20 },
      }),
    ).toEqual([]);
    expect(
      validateAgentReadinessToolCall({
        tool: "find_orphans",
        arguments: { excludeKinds: ["project", "vault-readme"] },
      }),
    ).toEqual([]);
  });

  it("rejects readiness repair payload drift", () => {
    expect(
      validateAgentReadinessToolCall({
        tool: "find_orphans",
        arguments: { kinds: ["domain"] },
      }),
    ).toEqual(["find_orphans uses excludeKinds or kind; kinds is not a supported argument"]);
    expect(
      validateAgentReadinessToolCall({
        tool: "query_ontology",
        arguments: { operation: "overveiw" },
      }),
    ).toEqual(["unsupported readiness query_ontology operation: overveiw"]);
    expect(
      validateAgentReadinessToolCall({
        tool: "unknown_tool",
        arguments: {},
      }),
    ).toEqual(["unsupported readiness MCP tool: unknown_tool"]);
  });
});
