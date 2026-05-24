import type { KnowledgeGraphEdge, KnowledgeGraphNode } from "@/entities/knowledge-graph";
import type { OntologyTreeBuildResult } from "./types";

export type AgentReadinessStatus = "ready" | "needs-links" | "needs-shape";
export type AgentReadinessActionKey =
  | "resolveUnknown"
  | "addConcepts"
  | "linkOrphans"
  | "addRelations"
  | "inspectHubs"
  | "syncAfterChanges";

export interface AgentReadinessSummary {
  status: AgentReadinessStatus;
  score: number;
  meaningfulNodes: number;
  relationCount: number;
  unknownNodes: number;
  orphanCount: number;
  hubCount: number;
  averageDegree: number;
  actionKeys: AgentReadinessActionKey[];
}

export interface AgentReadinessToolCall {
  tool: string;
  arguments: Record<string, unknown>;
}

export interface AgentReadinessCliCommand {
  key: string;
  command: string;
}

const AGENT_READINESS_TOOLS = new Set([
  "analyze_repo_structure",
  "find_evidence",
  "find_orphans",
  "infer_imports",
  "query_ontology",
  "validate_vault",
]);

const AGENT_READINESS_QUERY_OPERATIONS = new Set([
  "agent_brief",
  "blast_radius",
  "cycles",
  "growth_plan",
  "health",
  "maintenance_plan",
  "match_nodes",
  "node_profile",
  "recommend_relations",
  "relation_check",
  "workspace_brief",
]);

const ACTION_GUIDANCE: Record<AgentReadinessActionKey, string> = {
  resolveUnknown:
    "Resolve unknown/stub nodes: inspect get_concept and find_evidence, then patch_concept or merge_concepts.",
  addConcepts:
    "Add missing shape: create at least one domain, capability, and element before relying on graph answers.",
  linkOrphans:
    "Attach orphan nodes with contains/domain/capabilities/elements relations so traversal has a spine.",
  addRelations:
    "Add semantic edges such as depends_on, relates, or describes; sparse graphs weaken path and impact queries.",
  inspectHubs:
    "Inspect suggested hubs with workspace_brief, node_profile, path, and blast_radius before editing.",
  syncAfterChanges:
    "After code changes, run health, cycles, growth_plan, maintenance_plan, and validate_vault so Claude Code and Codex share a clean graph memory.",
};

const ACTION_PAYLOADS: Record<AgentReadinessActionKey, AgentReadinessToolCall[]> = {
  resolveUnknown: [
    { tool: "query_ontology", arguments: { operation: "match_nodes", kind: "unknown", limit: 20 } },
    { tool: "find_evidence", arguments: { query: "<unknown-title-or-slug>" } },
  ],
  addConcepts: [
    { tool: "analyze_repo_structure", arguments: {} },
    { tool: "query_ontology", arguments: { operation: "recommend_relations", kind: "domain", limit: 20 } },
  ],
  linkOrphans: [
    { tool: "find_orphans", arguments: { excludeKinds: ["project", "vault-readme"] } },
    { tool: "query_ontology", arguments: { operation: "recommend_relations", limit: 20 } },
  ],
  addRelations: [
    { tool: "infer_imports", arguments: { maxFiles: 5000 } },
    { tool: "query_ontology", arguments: { operation: "relation_check", from: "<from-slug>", to: "<to-slug>", type: "depends_on" } },
  ],
  inspectHubs: [
    { tool: "query_ontology", arguments: { operation: "workspace_brief" } },
    { tool: "query_ontology", arguments: { operation: "node_profile", slug: "<hub-slug>", depth: 2, limit: 12 } },
    { tool: "query_ontology", arguments: { operation: "blast_radius", slug: "<hub-slug>", depth: 2, direction: "incoming" } },
  ],
  syncAfterChanges: [
    { tool: "query_ontology", arguments: { operation: "health" } },
    { tool: "query_ontology", arguments: { operation: "cycles", maxHops: 8 } },
    { tool: "query_ontology", arguments: { operation: "growth_plan", limit: 20 } },
    { tool: "query_ontology", arguments: { operation: "maintenance_plan", limit: 20 } },
    { tool: "validate_vault", arguments: {} },
  ],
};

const BASELINE_CLI_COMMANDS: AgentReadinessCliCommand[] = [
  { key: "agent_brief", command: "oh-my-ontology agent-brief [vault]" },
  { key: "graph_db_pack", command: "oh-my-ontology agent-brief [vault] --graph-db-pack" },
  {
    key: "setup_gate",
    command:
      "oh-my-ontology agent-brief [vault] --verify-fallbacks --json --fallback-timeout-ms 15000 --fallback-slow-ms 5000 --fallback-concurrency 4",
  },
  { key: "workspace_brief", command: "oh-my-ontology workspace-brief [vault]" },
  { key: "health", command: "oh-my-ontology health [vault]" },
  { key: "cycles", command: "oh-my-ontology cycles [vault] --max-hops 8" },
  { key: "growth", command: "oh-my-ontology growth [vault] --limit 20" },
  { key: "maintenance", command: "oh-my-ontology maintenance [vault] --limit 20" },
];

const ACTION_CLI_COMMANDS: Record<AgentReadinessActionKey, AgentReadinessCliCommand[]> = {
  resolveUnknown: [
    {
      key: "match_unknown_nodes",
      command: "oh-my-ontology match-nodes [vault] --kind unknown --limit 20",
    },
    {
      key: "find_unknown_evidence",
      command: "oh-my-ontology find <unknown-title-or-slug> [vault]",
    },
  ],
  addConcepts: [
    {
      key: "analyze_repo",
      command: "oh-my-ontology analyze [repo] --vault [vault]",
    },
  ],
  linkOrphans: [
    {
      key: "find_orphans",
      command: "oh-my-ontology orphans [vault] --exclude-kinds project,vault-readme",
    },
  ],
  addRelations: [
    {
      key: "infer_imports",
      command: "oh-my-ontology infer-imports [repo] --vault [vault] --max-files 5000",
    },
    {
      key: "relation_check",
      command: "oh-my-ontology relation-check <from-slug> <to-slug> depends_on [vault]",
    },
  ],
  inspectHubs: [
    {
      key: "node_profile",
      command: "oh-my-ontology node <hub-slug> [vault] --limit 12",
    },
    {
      key: "blast_radius",
      command: "oh-my-ontology blast-radius <hub-slug> [vault] --depth 2 --direction incoming",
    },
  ],
  syncAfterChanges: [
    {
      key: "validate_vault",
      command: "oh-my-ontology validate [vault]",
    },
  ],
};

export function buildAgentReadinessCliCommands(
  summary: Pick<AgentReadinessSummary, "actionKeys">,
): AgentReadinessCliCommand[] {
  const commands = [...BASELINE_CLI_COMMANDS];
  const seen = new Set(commands.map((item) => item.command));

  for (const key of summary.actionKeys) {
    for (const item of ACTION_CLI_COMMANDS[key]) {
      if (seen.has(item.command)) continue;
      commands.push(item);
      seen.add(item.command);
    }
  }

  return commands;
}

export function formatAgentReadinessCliCommands(
  summary: Pick<AgentReadinessSummary, "actionKeys">,
): string {
  return buildAgentReadinessCliCommands(summary)
    .map((item, index) => `${index + 1}. ${item.command}`)
    .join("\n");
}

export function validateAgentReadinessToolCall(payload: AgentReadinessToolCall): string[] {
  const issues: string[] = [];
  if (!AGENT_READINESS_TOOLS.has(payload.tool)) {
    issues.push(`unsupported readiness MCP tool: ${payload.tool}`);
  }
  if (payload.tool === "query_ontology") {
    const operation = payload.arguments.operation;
    if (typeof operation !== "string" || !AGENT_READINESS_QUERY_OPERATIONS.has(operation)) {
      issues.push(`unsupported readiness query_ontology operation: ${String(operation)}`);
    }
  }
  if (payload.tool === "find_orphans") {
    if ("kinds" in payload.arguments) {
      issues.push("find_orphans uses excludeKinds or kind; kinds is not a supported argument");
    }
    const excludeKinds = payload.arguments.excludeKinds;
    if (
      excludeKinds !== undefined &&
      (!Array.isArray(excludeKinds) ||
        excludeKinds.some((kind) => typeof kind !== "string" || kind.trim() === ""))
    ) {
      issues.push("find_orphans.excludeKinds must be an array of non-empty strings");
    }
  }
  return issues;
}

function formatPayload(payload: AgentReadinessToolCall): string {
  const issues = validateAgentReadinessToolCall(payload);
  if (issues.length > 0) {
    throw new Error(`Invalid agent readiness MCP payload: ${issues.join("; ")}`);
  }
  return JSON.stringify(payload, null, 2);
}

export function buildAgentReadinessPrompt(summary: AgentReadinessSummary): string {
  const actions = summary.actionKeys
    .map((key, index) => `${index + 1}. ${ACTION_GUIDANCE[key]}`)
    .join("\n");
  const baselinePayloads = [
    { tool: "query_ontology", arguments: { operation: "agent_brief" } },
    { tool: "query_ontology", arguments: { operation: "workspace_brief" } },
    { tool: "query_ontology", arguments: { operation: "health" } },
    { tool: "query_ontology", arguments: { operation: "cycles", maxHops: 8 } },
    { tool: "query_ontology", arguments: { operation: "growth_plan", limit: 20 } },
    { tool: "query_ontology", arguments: { operation: "maintenance_plan", limit: 20 } },
  ];
  const actionPayloads = summary.actionKeys.flatMap((key) => ACTION_PAYLOADS[key]);
  const payloads = [...baselinePayloads, ...actionPayloads].filter((payload, index, all) => {
    const key = JSON.stringify(payload);
    return all.findIndex((item) => JSON.stringify(item) === key) === index;
  });
  const payloadLines = payloads
    .map((payload, index) => `${index + 1}. ${payload.tool}\n${formatPayload(payload)}`)
    .join("\n\n");
  const cliLines = formatAgentReadinessCliCommands(summary);

  return [
    "Use the oh-my-ontology MCP server to improve this vault before or during code work.",
    `Current agent graph readiness: ${summary.status} (${summary.score}/100).`,
    `Graph facts: ${summary.meaningfulNodes} shaped concepts, ${summary.relationCount} relations, ${summary.orphanCount} orphan nodes, ${summary.unknownNodes} unresolved stubs, ${summary.hubCount} hubs, average degree ${summary.averageDegree.toFixed(1)}.`,
    "",
    "Recommended next actions:",
    actions,
    "",
    "Run these MCP calls first:",
    payloadLines,
    "",
    "If the MCP connector is unavailable, run these terminal fallbacks:",
    cliLines,
    "",
    "Prefer read tools first (workspace_brief, health, get_concept, find_evidence, find_backlinks, node_profile).",
    "Only write after confirming the intended ontology change; use add_concept/add_relation/patch_concept/merge_concepts and keep docs/ontology synced.",
  ].join("\n");
}

const MEANINGFUL_KINDS = new Set(["domain", "capability", "element", "unknown"]);

/**
 * Agent-facing graph quality signal for the web insights surface.
 *
 * This deliberately mirrors the MCP/CLI "first-contact" idea without calling
 * the MCP server from the browser: use only the already-derived vault graph,
 * then summarize whether an agent has enough shaped nodes and relations to
 * navigate the ontology confidently.
 */
export function buildAgentReadinessSummary(
  nodes: readonly KnowledgeGraphNode[],
  edges: readonly KnowledgeGraphEdge[],
  tree: Pick<OntologyTreeBuildResult, "orphans">,
): AgentReadinessSummary {
  const meaningfulNodes = nodes.filter((node) => MEANINGFUL_KINDS.has(node.kind)).length;
  const unknownNodes = nodes.filter((node) => node.kind === "unknown").length;
  const orphanCount = tree.orphans.length;
  const relationCount = edges.length;
  const degreeByNode = new Map(nodes.map((node) => [node.id, 0]));

  for (const edge of edges) {
    if (edge.from === edge.to) {
      if (degreeByNode.has(edge.from)) {
        degreeByNode.set(edge.from, (degreeByNode.get(edge.from) ?? 0) + 1);
      }
      continue;
    }
    if (degreeByNode.has(edge.from)) {
      degreeByNode.set(edge.from, (degreeByNode.get(edge.from) ?? 0) + 1);
    }
    if (degreeByNode.has(edge.to)) {
      degreeByNode.set(edge.to, (degreeByNode.get(edge.to) ?? 0) + 1);
    }
  }

  const hubCount = [...degreeByNode.values()].filter((degree) => degree >= 3).length;
  const averageDegree =
    nodes.length > 0 ? Math.round((relationCount * 2 * 10) / nodes.length) / 10 : 0;

  let score = 0;
  if (meaningfulNodes >= 3) score += 25;
  if (relationCount >= Math.max(1, meaningfulNodes - 1)) score += 25;
  if (orphanCount === 0) score += 20;
  if (unknownNodes === 0) score += 15;
  if (hubCount > 0) score += 15;

  const status: AgentReadinessStatus =
    unknownNodes > 0 || meaningfulNodes < 3
      ? "needs-shape"
      : orphanCount > 0 || relationCount === 0
        ? "needs-links"
        : "ready";
  const actionKeys: AgentReadinessActionKey[] = [];
  if (unknownNodes > 0) actionKeys.push("resolveUnknown");
  if (meaningfulNodes < 3) actionKeys.push("addConcepts");
  if (orphanCount > 0) actionKeys.push("linkOrphans");
  if (relationCount < Math.max(1, meaningfulNodes - 1)) actionKeys.push("addRelations");
  if (actionKeys.length === 0) {
    actionKeys.push("inspectHubs", "syncAfterChanges");
  }

  return {
    status,
    score,
    meaningfulNodes,
    relationCount,
    unknownNodes,
    orphanCount,
    hubCount,
    averageDegree,
    actionKeys,
  };
}
