import {
  AGENT_GRAPH_DB_CLI_SELF_CHECK_COMMAND,
  AGENT_GRAPH_DB_RUNTIME_GATE_COMMAND,
  buildAgentPostChangeSyncCliCommands,
  type AgentReadinessStatus,
} from "./agent-readiness";
import type { KnowledgeGraphEdge, KnowledgeGraphNode } from "@/entities/knowledge-graph";

const AGENT_PRACTITIONER_RESEARCH_NODE = "documents/agent-practice-research";

const AGENT_QUERY_OPERATIONS = new Set([
  "all_paths",
  "agent_brief",
  "workspace_brief",
  "query_plan",
  "health",
  "components",
  "cycles",
  "topological_order",
  "growth_plan",
  "maintenance_plan",
  "node_profile",
  "path",
  "explain_relation",
  "similar_nodes",
  "relation_check",
  "blast_radius",
  "domain_matrix",
  "centrality",
  "match_nodes",
  "match_edges",
  "facets",
  "pattern_walk",
  "project_map",
  "schema",
]);

const AGENT_QUERY_PLAN_TARGETS = new Set([
  "all_paths",
  "blast_radius",
  "centrality",
  "match_edges",
  "match_nodes",
]);

export type AgentQueryRecipeId =
  | "all_paths"
  | "agent_brief"
  | "workspace_brief"
  | "query_plan"
  | "health"
  | "components"
  | "cycles"
  | "topological_order"
  | "growth_plan"
  | "maintenance_plan"
  | "node_profile"
  | "path"
  | "explain_relation"
  | "similar_nodes"
  | "relation_check"
  | "blast_radius"
  | "domain_matrix"
  | "pattern_walk";

export interface AgentQueryRecipe {
  id: AgentQueryRecipeId;
  operation: string;
  promptKey: string;
  tool: "query_ontology";
  arguments: Record<string, unknown>;
  priority: "primary" | "secondary";
}

export interface AgentMcpQueryCall {
  operation: string;
  tool: "query_ontology";
  arguments: Record<string, unknown>;
}

export interface AgentQueryEntrypoint {
  slug: string;
  title: string;
  kind: string;
  degree: number;
}

export interface AgentProjectEntrypoint {
  slug: string;
  title: string;
  degree: number;
}

export type AgentInvestigationPlaybookId =
  | "refactor_impact"
  | "onboarding_map"
  | "coupling_audit"
  | "graph_traversal";

export type AgentTraversalStrategyId =
  | "plan_before_enumeration"
  | "bounded_path_evidence"
  | "containment_cross_check";

export type AgentWriteGuardrailId =
  | "preflight_relation"
  | "preflight_rename"
  | "post_change_sync";

export type AgentGraphDbQueryPackId =
  | "graph_facets"
  | "node_scan"
  | "edge_scan"
  | "domain_coupling"
  | "path_evidence";

export type AgentPractitionerConcernId =
  | "context"
  | "tools"
  | "evidence"
  | "drift"
  | "workflow";

export interface AgentInvestigationPlaybook {
  id: AgentInvestigationPlaybookId;
  titleKey: string;
  promptKey: string;
  evidence: string[];
  stopWhen: string[];
  payloads: AgentMcpQueryCall[];
}

export interface AgentTraversalStrategy {
  id: AgentTraversalStrategyId;
  titleKey: string;
  promptKey: string;
  priority: "first" | "evidence" | "confirm";
  evidence: string[];
  stopWhen: string[];
  payloads: AgentMcpQueryCall[];
}

export interface AgentMcpToolCall {
  operation: string;
  tool: "query_ontology" | "find_backlinks" | "validate_vault";
  arguments: Record<string, unknown>;
}

export interface AgentWriteGuardrail {
  id: AgentWriteGuardrailId;
  titleKey: string;
  promptKey: string;
  payloads: AgentMcpToolCall[];
  cliFallbackCommands?: string[];
}

export interface AgentGraphDbQueryPackItem {
  id: AgentGraphDbQueryPackId;
  titleKey: string;
  promptKey: string;
  intent: string;
  payloads: AgentMcpQueryCall[];
}

export interface AgentPractitionerConcern {
  id: AgentPractitionerConcernId;
  title: string;
  body: string;
  gate: string;
  researchSignals: readonly string[];
  sourceUrls: readonly string[];
  productResponse: string;
}

export {
  AGENT_GRAPH_DB_CLI_SELF_CHECK_COMMAND,
  AGENT_GRAPH_DB_RUNTIME_GATE_CHECK_COUNT,
  AGENT_GRAPH_DB_RUNTIME_GATE_COMMAND,
} from "./agent-readiness";

const ALL_PATHS_RESULT_CONTRACT = [
  "For all_paths, report limit, searchBudget, expandedStates, exhaustive, truncatedByBudget, totalPathsExact, evidence.status, evidence.reason, and evidence.pathsComplete.",
  "Treat returned paths as partial evidence unless evidence.pathsComplete is true; when evidence.status is partial, follow evidence.suggestedQuery or evidence.saferQuery before writing.",
  "Do not use a single returned path as proof when all_paths is limited, budget-truncated, or evidence.pathsComplete is false.",
];

const SCAN_RESULT_CONTRACT = [
  "For match_nodes and match_edges, report totalMatches, limited, row count, and followUp details before treating scan rows as evidence.",
  "Run match_nodes followUp calls such as node_profile, match_edges, and blast_radius before using a node row for onboarding or refactor decisions.",
  "Run match_edges followUp calls such as explain_relation, path, and relation_check before using an edge row as write, refactor, or coupling evidence.",
];

const AGENT_MODE_GUIDE = [
  "Mode guide:",
  "- CLI-only: validate, workspace-brief, graph scans, graph DB pack, and fallback timing work from Terminal without MCP.",
  "- MCP-connected: Claude Code, Codex, or Cursor can call local read/write tools with structured repair fields and write guardrails.",
  "- Graph DB pack: bounded query plans, node/edge scans, domain matrix, paths, and relation explanations without a database server.",
  "- Setup gate: run the JSON fallback check before edits and read ok separately from performanceOk.",
];

export const AGENT_PRACTITIONER_CONCERNS: readonly AgentPractitionerConcern[] = [
  {
    id: "context",
    title: "Context reliability",
    body: "Cite AGENTS.md, CLAUDE.md, an ontology node, or an MCP result before the agent guesses.",
    gate: "agent_brief or workspace_brief names the entrypoint and current blockers.",
    researchSignals: [
      "Anthropic: simple workflows and explicit context beat broad autonomy when the task path is knowable.",
      "OpenAI Codex: AGENTS.md-style persistent repo guidance and issue-shaped prompts give agents stable workspace context.",
    ],
    sourceUrls: [
      "https://www.anthropic.com/engineering/building-effective-agents",
      "https://cdn.openai.com/pdf/6a2631dc-783e-479b-b1a4-af0cfbd38630/how-openai-uses-codex.pdf",
    ],
    productResponse:
      "Make ontology entrypoints, blockers, and project memory copyable before any long-running agent task starts.",
  },
  {
    id: "tools",
    title: "Tool boundary",
    body: "Show MCP setup, tool filtering, approval boundary, duplicate tool names, and connection failures before writes.",
    gate: "Claude Code /mcp or Codex codex mcp list confirms the live server.",
    researchSignals: [
      "OpenAI Agents SDK: MCP servers can be stdio, streamable HTTP, or hosted, and sensitive tool calls can require approval.",
      "MCP security guidance: use explicit consent and progressive least-privilege scopes.",
    ],
    sourceUrls: [
      "https://openai.github.io/openai-agents-js/guides/mcp/",
      "https://modelcontextprotocol.io/docs/tutorials/security/authorization",
    ],
    productResponse:
      "Expose MCP server status, first calls, approval boundary, and write guardrails before the user trusts agent actions.",
  },
  {
    id: "evidence",
    title: "Evidence loop",
    body: "Make health, graph DB pack, relation_check, and post-change sync runnable and comparable.",
    gate: "The UI offers a copyable proof command, not only an explanatory label.",
    researchSignals: [
      "Cognition: async agent work becomes unmanageable unless it returns end-to-end verification artifacts.",
      "Codex: real product verification includes native app evidence, not only code edits.",
    ],
    sourceUrls: [
      "https://cognition.ai/blog/testing-development",
      "https://cdn.openai.com/pdf/6a2631dc-783e-479b-b1a4-af0cfbd38630/how-openai-uses-codex.pdf",
    ],
    productResponse:
      "Turn graph DB checks, route smoke, desktop verification, and post-change sync into repeatable proof packets.",
  },
  {
    id: "drift",
    title: "Memory drift",
    body: "Reveal stale markdown memory, skills, hooks, duplicate ontology concepts, and unresolved graph references.",
    gate: "health or maintenance_plan names the drift, or the feature should not claim it fixed memory.",
    researchSignals: [
      "LangChain: semantic memory, episodic memory, and procedural skills need explicit storage and retrieval paths.",
      "MCP threat models call out stale permissions, broad scopes, and indirect context manipulation.",
    ],
    sourceUrls: [
      "https://docs.langchain.com/oss/python/deepagents/memory",
      "https://modelcontextprotocol.io/specification/2025-06-18/basic/security_best_practices",
    ],
    productResponse:
      "Surface stale ontology nodes, unresolved references, duplicate concepts, and risky MCP assumptions as named graph issues.",
  },
  {
    id: "workflow",
    title: "Workflow fit",
    body: "Keep the loop simple and composable before long autonomous runs or subagent handoff.",
    gate: "one small read-check-write-sync loop works before parallel or long-running agent work.",
    researchSignals: [
      "Anthropic: use workflows for predictable paths and agents for open-ended loops that need environmental feedback.",
      "OpenAI Agents SDK: MCP approval interruptions keep humans in the loop for sensitive actions.",
    ],
    sourceUrls: [
      "https://www.anthropic.com/engineering/building-effective-agents",
      "https://openai.github.io/openai-agents-js/guides/mcp/",
    ],
    productResponse:
      "Prefer one small ontology read-check-write-sync loop before exposing broader automation or multi-agent handoff.",
  },
];

export function formatAgentPractitionerConcernsChecklist(): string {
  return [
    "# Ontology Atlas agent feature decision checklist",
    "Use this before adding a Claude Code, Codex, or MCP-facing feature.",
    "",
    `Ontology research anchor: ${AGENT_PRACTITIONER_RESEARCH_NODE}`,
    `MCP read: get_concept({"slug":"${AGENT_PRACTITIONER_RESEARCH_NODE}"})`,
    "",
    ...AGENT_PRACTITIONER_CONCERNS.flatMap((concern, index) => [
      `${index + 1}. ${concern.title}: ${concern.body}`,
      `   Gate: ${concern.gate}`,
      `   Research signal: ${concern.researchSignals.join(" / ")}`,
      `   Sources: ${concern.sourceUrls.join(" / ")}`,
      `   Ontology Atlas response: ${concern.productResponse}`,
    ]),
    "",
    "Minimum proof before shipping:",
    '1. query_ontology({"operation":"health"})',
    '2. query_ontology({"operation":"agent_brief"})',
    `3. ${AGENT_GRAPH_DB_RUNTIME_GATE_COMMAND}`,
  ].join("\n");
}

export function validateAgentMcpQueryCall(payload: AgentMcpQueryCall): string[] {
  const issues: string[] = [];
  if (payload.tool !== "query_ontology") {
    issues.push(`tool must be query_ontology, received ${payload.tool}`);
  }
  const operation = payload.arguments.operation;
  if (typeof operation !== "string" || !AGENT_QUERY_OPERATIONS.has(operation)) {
    issues.push(`unsupported query_ontology operation: ${String(operation)}`);
  }
  if (operation === "query_plan") {
    const targetOperation = payload.arguments.targetOperation;
    if (
      typeof targetOperation !== "string" ||
      !AGENT_QUERY_PLAN_TARGETS.has(targetOperation)
    ) {
      issues.push(`unsupported query_plan targetOperation: ${String(targetOperation)}`);
    }
  }
  if (payload.operation !== `query_ontology.${String(operation)}`) {
    issues.push(
      `operation label must be query_ontology.${String(operation)}, received ${payload.operation}`,
    );
  }
  return issues;
}

export function validateAgentMcpToolCall(payload: AgentMcpToolCall): string[] {
  if (payload.tool === "query_ontology") {
    return validateAgentMcpQueryCall(payload as AgentMcpQueryCall);
  }

  const issues: string[] = [];
  if (payload.tool === "find_backlinks") {
    if (payload.operation !== "find_backlinks") {
      issues.push(`operation label must be find_backlinks, received ${payload.operation}`);
    }
    const slug = payload.arguments.slug;
    if (typeof slug !== "string" || slug.trim() === "") {
      issues.push("find_backlinks.slug must be a non-empty string");
    }
    return issues;
  }

  if (payload.tool === "validate_vault") {
    if (payload.operation !== "validate_vault") {
      issues.push(`operation label must be validate_vault, received ${payload.operation}`);
    }
    const keys = Object.keys(payload.arguments);
    if (keys.length > 0) {
      issues.push(`validate_vault takes no UI guardrail arguments, received ${keys.join(", ")}`);
    }
    return issues;
  }

  issues.push(`unsupported MCP tool: ${(payload as { tool: string }).tool}`);
  return issues;
}

export function formatAgentMcpQueryPayload(payload: AgentMcpQueryCall): string {
  const issues = validateAgentMcpQueryCall(payload);
  if (issues.length > 0) {
    throw new Error(`Invalid agent MCP query payload: ${issues.join("; ")}`);
  }
  return JSON.stringify({ tool: payload.tool, arguments: payload.arguments }, null, 2);
}

export function formatAgentMcpToolPayload(payload: AgentMcpToolCall): string {
  const issues = validateAgentMcpToolCall(payload);
  if (issues.length > 0) {
    throw new Error(`Invalid agent MCP tool payload: ${issues.join("; ")}`);
  }
  return JSON.stringify({ tool: payload.tool, arguments: payload.arguments }, null, 2);
}

export function formatAgentRecipePayload(recipe: AgentQueryRecipe): string {
  return formatAgentMcpQueryPayload(recipe);
}

export function formatAgentRunOrderPrompt(recipes: readonly AgentQueryRecipe[]): string {
  const payloads = recipes
    .map((recipe, index) => `${index + 1}. ${recipe.operation}\n${formatAgentRecipePayload(recipe)}`)
    .join("\n\n");
  const cliCommands = recipes
    .map(formatAgentRecipeCliCommand)
    .filter((command): command is string => command !== null)
    .filter(uniqueString);
  const cliFallback =
    cliCommands.length > 0
      ? [
          "",
          "CLI fallback commands when the MCP connector is unavailable:",
          ...cliCommands.map((command, index) => `${index + 1}. ${command}`),
        ]
      : [];

  return [
    "Use this ontology-atlas first-contact run order before answering from the codebase graph.",
    "Run the MCP calls in order. Report health, cite concrete slugs/edges, and run query_plan before heavier traversal or impact queries.",
    ...ALL_PATHS_RESULT_CONTRACT,
    ...SCAN_RESULT_CONTRACT,
    "",
    payloads,
    ...cliFallback,
  ].join("\n");
}

export function formatAgentRecipeCliCommand(recipe: AgentQueryRecipe): string | null {
  return formatAgentQueryArgumentsCliCommand(recipe.arguments);
}

export function formatAgentQueryCallCliCommand(payload: AgentMcpQueryCall): string | null {
  return formatAgentQueryArgumentsCliCommand(payload.arguments);
}

export function formatAgentQueryArgumentsCliCommand(args: Record<string, unknown>): string | null {
  switch (args.operation) {
    case "agent_brief":
      return "ontology-atlas agent-brief [vault]";
    case "workspace_brief":
      return "ontology-atlas workspace-brief [vault]";
    case "health":
      return "ontology-atlas health [vault]";
    case "facets":
      return withFlags("ontology-atlas facets [vault]", [
        positiveFlag("--limit", args.limit),
      ]);
    case "schema":
      return withFlags("ontology-atlas schema [vault]", [
        positiveFlag("--limit", args.limit),
      ]);
    case "components":
      return withFlags("ontology-atlas components [vault]", [
        positiveFlag("--limit", args.limit),
        positiveFlag("--node-limit", args.nodeLimit),
      ]);
    case "cycles":
      return withFlags("ontology-atlas cycles [vault]", [
        nonNegativeFlag("--max-hops", args.maxHops),
      ]);
    case "topological_order":
      return withFlags("ontology-atlas topological-order [vault]", [
        positiveFlag("--limit", args.limit),
      ]);
    case "growth_plan":
      return withFlags("ontology-atlas growth [vault]", [
        positiveFlag("--limit", args.limit),
      ]);
    case "maintenance_plan":
      return withFlags("ontology-atlas maintenance [vault]", [
        positiveFlag("--limit", args.limit),
      ]);
    case "query_plan": {
      if (args.targetOperation === "blast_radius") {
        const slug = stringArg(args.slug, "<slug>");
        return withFlags(`ontology-atlas blast-radius ${shellQuote(slug)} [vault]`, [
          "--plan",
          nonNegativeFlag("--depth", args.depth),
          stringFlag("--direction", args.direction),
        ]);
      }
      if (args.targetOperation === "centrality") {
        return withFlags("ontology-atlas hubs [vault]", [
          "--plan",
          positiveFlag("--limit", args.limit),
          csvFlag("--types", args.types),
        ]);
      }
      if (args.targetOperation === "match_edges") {
        return formatMatchEdgesCommand(args, { plan: true });
      }
      if (args.targetOperation === "match_nodes") {
        return formatMatchNodesCommand(args, { plan: true });
      }
      if (args.targetOperation === "all_paths") {
        const from = stringArg(args.from, "<from-slug>");
        const to = stringArg(args.to, "<to-slug>");
        return withFlags(`ontology-atlas all-paths ${shellQuote(from)} ${shellQuote(to)} [vault]`, [
          "--plan",
          allPathsPlanForceFlag(args),
          nonNegativeFlag("--max-hops", args.maxHops),
          csvFlag("--types", args.types),
          positiveFlag("--search-budget", args.searchBudget),
          positiveFlag("--limit", args.limit),
        ]);
      }
      return null;
    }
    case "node_profile": {
      const slug = stringArg(args.slug, "<slug>");
      return withFlags(`ontology-atlas node ${shellQuote(slug)} [vault]`, [
        positiveFlag("--limit", args.limit),
      ]);
    }
    case "path": {
      const from = stringArg(args.from, "<from-slug>");
      const to = stringArg(args.to, "<to-slug>");
      return withFlags(`ontology-atlas path ${shellQuote(from)} ${shellQuote(to)} [vault]`, [
        nonNegativeFlag("--max-hops", args.maxHops),
      ]);
    }
    case "explain_relation": {
      const from = stringArg(args.from, "<from-slug>");
      const to = stringArg(args.to, "<to-slug>");
      return withFlags(`ontology-atlas explain ${shellQuote(from)} ${shellQuote(to)} [vault]`, [
        stringFlag("--direction", args.direction),
        nonNegativeFlag("--max-hops", args.maxHops),
        csvFlag("--types", args.types),
        positiveFlag("--limit", args.limit),
      ]);
    }
    case "similar_nodes": {
      const title = stringArg(args.title, "<candidate-title>");
      return withFlags(`ontology-atlas similar ${shellQuote(title)} [vault]`, [
        stringFlag("--slug", args.candidateSlug),
        stringFlag("--kind", args.kind),
        positiveFlag("--limit", args.limit),
      ]);
    }
    case "relation_check": {
      const from = stringArg(args.from, "<from-slug>");
      const to = stringArg(args.to, "<to-slug>");
      const type = stringArg(args.type, "depends_on");
      return `ontology-atlas relation-check ${shellQuote(from)} ${shellQuote(to)} ${shellQuote(type)} [vault]`;
    }
    case "blast_radius": {
      const slug = stringArg(args.slug, "<slug>");
      return withFlags(`ontology-atlas blast-radius ${shellQuote(slug)} [vault]`, [
        nonNegativeFlag("--depth", args.depth),
        stringFlag("--direction", args.direction),
      ]);
    }
    case "all_paths": {
      const from = stringArg(args.from, "<from-slug>");
      const to = stringArg(args.to, "<to-slug>");
      return withFlags(`ontology-atlas all-paths ${shellQuote(from)} ${shellQuote(to)} [vault]`, [
        "--plan",
        allPathsPlanForceFlag(args),
        nonNegativeFlag("--max-hops", args.maxHops),
        csvFlag("--types", args.types),
        positiveFlag("--search-budget", args.searchBudget),
        positiveFlag("--limit", args.limit),
      ]);
    }
    case "centrality":
      return withFlags("ontology-atlas hubs [vault]", [
        positiveFlag("--limit", args.limit),
        csvFlag("--types", args.types),
      ]);
    case "match_edges":
      return formatMatchEdgesCommand(args);
    case "match_nodes":
      return formatMatchNodesCommand(args);
    case "domain_matrix":
      return withFlags("ontology-atlas domain-matrix [vault]", [
        stringFlag("--project", args.project),
        positiveFlag("--limit", args.limit),
        csvFlag("--types", args.types),
      ]);
    case "pattern_walk": {
      const slug = stringArg(args.slug, "<slug>");
      return withFlags(`ontology-atlas pattern-walk ${shellQuote(slug)} [vault]`, [
        csvFlag("--pattern", args.pattern),
        stringFlag("--direction", args.direction),
        positiveFlag("--limit", args.limit),
      ]);
    }
    case "project_map": {
      const project = stringArg(args.project ?? args.slug, "<project-slug>");
      return withFlags(`ontology-atlas project-map ${shellQuote(project)} [vault]`, [
        positiveFlag("--limit", args.limit),
        positiveFlag("--item-limit", args.itemLimit),
      ]);
    }
    default:
      return null;
  }
}

function formatMatchEdgesCommand(
  args: Record<string, unknown>,
  options: { plan?: boolean } = {},
): string {
  return withFlags("ontology-atlas match-edges [vault]", [
    options.plan ? "--plan" : null,
    stringFlag("--from", args.from),
    stringFlag("--to", args.to),
    stringFlag("--from-kind", args.fromKind),
    stringFlag("--to-kind", args.toKind),
    stringFlag("--type", args.type),
    csvFlag("--types", args.types),
    booleanFlag("--include-external", args.includeExternal),
    booleanFlag("--include-unresolved", args.includeUnresolved),
    positiveFlag("--limit", args.limit),
  ]);
}

function formatMatchNodesCommand(
  args: Record<string, unknown>,
  options: { plan?: boolean } = {},
): string {
  return withFlags("ontology-atlas match-nodes [vault]", [
    options.plan ? "--plan" : null,
    stringFlag("--kind", args.kind),
    stringFlag("--domain", args.domain),
    stringFlag("--slug-contains", args.slugContains),
    nonNegativeFlag("--min-degree", args.minDegree),
    nonNegativeFlag("--max-degree", args.maxDegree),
    nonNegativeFlag("--min-in-degree", args.minInDegree),
    nonNegativeFlag("--min-out-degree", args.minOutDegree),
    booleanFlag("--has-incoming", args.hasIncoming),
    booleanFlag("--has-outgoing", args.hasOutgoing),
    stringFlag("--sort", args.sort),
    positiveFlag("--limit", args.limit),
  ]);
}

function withFlags(command: string, flags: Array<string | null>): string {
  const parts = [command, ...flags.filter((flag): flag is string => Boolean(flag))];
  return parts.join(" ");
}

function stringArg(value: unknown, fallback: string): string {
  return typeof value === "string" && value.trim() ? value : fallback;
}

function stringFlag(name: string, value: unknown): string | null {
  return typeof value === "string" && value.trim() ? `${name} ${shellQuote(value)}` : null;
}

function positiveFlag(name: string, value: unknown): string | null {
  return typeof value === "number" && Number.isInteger(value) && value > 0
    ? `${name} ${value}`
    : null;
}

function nonNegativeFlag(name: string, value: unknown): string | null {
  return typeof value === "number" && Number.isInteger(value) && value >= 0
    ? `${name} ${value}`
    : null;
}

function allPathsPlanForceFlag(args: Record<string, unknown>): string | null {
  return typeof args.maxHops === "number" && Number.isInteger(args.maxHops) && args.maxHops > 1
    ? "--force"
    : null;
}

function csvFlag(name: string, value: unknown): string | null {
  if (!Array.isArray(value) || value.length === 0) return null;
  const values = value.filter((item): item is string => typeof item === "string" && item.trim().length > 0);
  return values.length > 0 ? `${name} ${values.map(shellQuote).join(",")}` : null;
}

function booleanFlag(name: string, value: unknown): string | null {
  return value === true ? name : null;
}

function uniqueString(value: string, index: number, values: string[]): boolean {
  return values.indexOf(value) === index;
}

function shellQuote(value: string): string {
  if (/^[A-Za-z0-9_/:=.,@%+-]+$/.test(value)) return value;
  return `'${value.replace(/'/g, "'\\''")}'`;
}

export function formatAgentPlaybookPrompt(playbook: AgentInvestigationPlaybook): string {
  const payloads = playbook.payloads
    .map((payload, index) => `${index + 1}. ${payload.operation}\n${formatAgentMcpQueryPayload(payload)}`)
    .join("\n\n");
  const cliCommands = playbook.payloads
    .map(formatAgentQueryCallCliCommand)
    .filter((command): command is string => command !== null)
    .filter(uniqueString);
  const cliFallback =
    cliCommands.length > 0
      ? [
          "",
          "CLI fallback commands when the MCP connector is unavailable:",
          ...cliCommands.map((command, index) => `${index + 1}. ${command}`),
        ]
      : [];
  const evidence = playbook.evidence.map((item) => `- ${item}`).join("\n");
  const stopWhen = playbook.stopWhen.map((item) => `- ${item}`).join("\n");

  return [
    "Use the ontology-atlas MCP server to answer this investigation intent before editing.",
    "Run the calls in order, cite the returned slugs/edges in your reasoning, and only write to the vault after the graph evidence is clear.",
    ...ALL_PATHS_RESULT_CONTRACT,
    ...SCAN_RESULT_CONTRACT,
    "",
    "Evidence to report:",
    evidence,
    "",
    "Stop and explain before writing if:",
    stopWhen,
    "",
    payloads,
    ...cliFallback,
  ].join("\n");
}

export function formatAgentTraversalStrategyPrompt(strategy: AgentTraversalStrategy): string {
  const payloads = strategy.payloads
    .map((payload, index) => `${index + 1}. ${payload.operation}\n${formatAgentMcpQueryPayload(payload)}`)
    .join("\n\n");
  const evidence = strategy.evidence.map((item) => `- ${item}`).join("\n");
  const stopWhen = strategy.stopWhen.map((item) => `- ${item}`).join("\n");

  return [
    "Use this ontology-atlas MCP traversal strategy before treating graph paths as evidence.",
    "Run the calls in order. Plan first, enumerate only with bounds, then cross-check containment when ownership or direction matters.",
    ...ALL_PATHS_RESULT_CONTRACT,
    "",
    "Evidence to report:",
    evidence,
    "",
    "Stop and narrow before writing if:",
    stopWhen,
    "",
    payloads,
  ].join("\n");
}

export function formatAgentTraversalPacket(
  strategies: readonly AgentTraversalStrategy[],
): string {
  const gates = strategies
    .map((strategy, index) => {
      const evidence = strategy.evidence.map((item) => `  - ${item}`).join("\n");
      const stopWhen = strategy.stopWhen.map((item) => `  - ${item}`).join("\n");
      return [
        `${index + 1}. ${strategy.id} (${strategy.priority})`,
        "Evidence to report:",
        evidence,
        "Stop and narrow before writing if:",
        stopWhen,
      ].join("\n");
    })
    .join("\n\n");
  const payloads = strategies
    .flatMap((strategy) =>
      strategy.payloads.map((payload) => ({
        strategyId: strategy.id,
        payload,
      })),
    )
    .map(
      ({ strategyId, payload }, index) =>
        `${index + 1}. ${strategyId} / ${payload.operation}\n${formatAgentMcpQueryPayload(payload)}`,
    )
    .join("\n\n");
  const cliCommands = strategies
    .flatMap((strategy) => strategy.payloads)
    .map(formatAgentQueryCallCliCommand)
    .filter((command): command is string => command !== null)
    .filter(uniqueString);
  const cliFallback =
    cliCommands.length > 0
      ? [
          "",
          "CLI fallback commands when the MCP connector is unavailable:",
          ...cliCommands.map((command, index) => `${index + 1}. ${command}`),
        ]
      : [];

  return [
    "Use this ontology-atlas graph traversal packet before treating graph paths as evidence.",
    "Run query_plan before all_paths, keep traversal bounded, and cross-check containment before changing ownership, domain boundaries, or relation direction.",
    ...ALL_PATHS_RESULT_CONTRACT,
    ...SCAN_RESULT_CONTRACT,
    "",
    "Execution gates:",
    gates,
    "",
    "MCP calls:",
    payloads,
    ...cliFallback,
  ].join("\n");
}

export function formatAgentGraphDbQueryPackItemPrompt(
  item: AgentGraphDbQueryPackItem,
): string {
  const payloads = item.payloads
    .map((payload, index) => `${index + 1}. ${payload.operation}\n${formatAgentMcpQueryPayload(payload)}`)
    .join("\n\n");
  const cliCommands = item.payloads
    .map(formatAgentQueryCallCliCommand)
    .filter((command): command is string => command !== null)
    .filter(uniqueString);
  const cliFallback =
    cliCommands.length > 0
      ? [
          "",
          "CLI fallback commands when the MCP connector is unavailable:",
          ...cliCommands.map((command, index) => `${index + 1}. ${command}`),
        ]
      : [];

  return [
    "Use this ontology-atlas graph DB-style query pack before treating graph scan rows as evidence.",
    `Intent: ${item.intent}`,
    ...ALL_PATHS_RESULT_CONTRACT,
    ...SCAN_RESULT_CONTRACT,
    "",
    "MCP calls:",
    payloads,
    ...cliFallback,
  ].join("\n");
}

export function formatAgentGraphDbQueryPack(
  items: readonly AgentGraphDbQueryPackItem[],
): string {
  const sections = items
    .map(
      (item, index) =>
        `## ${index + 1}. ${item.id}\n${formatAgentGraphDbQueryPackItemPrompt(item)}`,
    )
    .join("\n\n");

  return [
    "Use this ontology-atlas graph DB query pack to scan the local markdown vault like a graph database, but keep evidence bounded and follow-up driven.",
    "Run plan calls before scans when provided. Report totalMatches, limited, row count, followUp details, and traversal completeness before making claims or writes.",
    "",
    sections,
  ].join("\n");
}

export function formatAgentGraphDbCliPack(
  items: readonly AgentGraphDbQueryPackItem[],
): string {
  const commands = agentGraphDbCliPackCommands(items);

  return [
    "Run these ontology-atlas CLI commands when the MCP connector is unavailable.",
    "They mirror the Graph DB query pack: plan scans first, keep traversal bounded, and use follow-up evidence before writing.",
    ...AGENT_MODE_GUIDE,
    "Gate first: Claude Code/Codex automation can parse ok, performanceOk, failed, timeoutMs, slowThresholdMs, slow, commands[].timedOut, commands[].slow, and slowest.elapsedMs; then the runtime gate replays the graph DB pack against docs/ontology.",
    `0. [self_check] ${AGENT_GRAPH_DB_CLI_SELF_CHECK_COMMAND}`,
    `1. [runtime_gate] ${AGENT_GRAPH_DB_RUNTIME_GATE_COMMAND}`,
    "Runtime replay includes: health --json, focused_blast_radius, scan follow-ups, relation_name_parity, pattern_walk/project_map containment, bounded all_paths evidence, relation_check, and relation explanation.",
    "",
    "Evidence rule: scan rows are candidates, not proof; cite follow-up detail before writing or refactoring.",
    "Proof checklist: report totalMatches/limited/row count, run node_profile or blast_radius for node rows, run explain/path/relation-check for edge rows, and report evidence.pathsComplete for paths.",
    "",
    ...commands.map(({ itemId, command }, index) => {
      const item = items.find((candidate) => candidate.id === itemId);
      const intent = item?.intent ? `\n   intent: ${item.intent}` : "";
      return `${index + 2}. [${itemId}] ${command}${intent}`;
    }),
  ].join("\n");
}

export function countAgentGraphDbCliPackCommands(
  items: readonly AgentGraphDbQueryPackItem[],
): number {
  return 2 + agentGraphDbCliPackCommands(items).length;
}

function agentGraphDbCliPackCommands(items: readonly AgentGraphDbQueryPackItem[]) {
  return items
    .flatMap((item) =>
      item.payloads
        .map(formatAgentQueryCallCliCommand)
        .filter((command): command is string => command !== null)
        .map((command) => ({ itemId: item.id, command })),
    )
    .filter(({ command }, index, values) =>
      values.findIndex((value) => value.command === command) === index,
    );
}

export function formatAgentGuardrailPrompt(guardrail: AgentWriteGuardrail): string {
  const payloads = guardrail.payloads
    .map((payload, index) => `${index + 1}. ${payload.operation}\n${formatAgentMcpToolPayload(payload)}`)
    .join("\n\n");
  const cliFallback =
    guardrail.cliFallbackCommands && guardrail.cliFallbackCommands.length > 0
      ? [
          "",
          "CLI fallback:",
          ...guardrail.cliFallbackCommands.map((command, index) => `${index + 1}. ${command}`),
        ]
      : [];

  return [
    "Use this ontology-atlas MCP write gate before changing the vault.",
    "Run the reads/preflights in order, cite the evidence, then perform the write only when the target relation or rename is still justified.",
    "For relation_check, follow recommendation.decision first: skip_existing means do not add, review_inverse or review_new_schema means pause and explain before writing.",
    "",
    payloads,
    ...cliFallback,
  ].join("\n");
}

export function formatAgentKindClassificationGuidance(): string {
  return [
    "Kind classification contract before writing frontmatter:",
    "- Do not classify from the label alone. Treat kind as an evidence-backed role in the shared conceptualization.",
    "- project: product/system scope root; use sparingly, usually one per repo.",
    "- domain: shared vocabulary boundary or product/business area that owns capabilities.",
    "- capability: user-visible behavior, workflow, or coherent system ability.",
    "- element: concrete implementation part such as UI component, API, CLI command, script, module, schema, or file-level unit.",
    "- unknown: temporary review signal; use similar_nodes and relation_check evidence before leaving it permanent.",
    "- Decision questions: project asks 'is this the whole product/system scope?', domain asks 'does this own a vocabulary boundary?', capability asks 'what behavior or workflow does this enable?', element asks 'which concrete code artifact implements or supports it?'.",
    "- Common near-miss rule: if the evidence is only a file path, start as element; promote to capability only when behavior/workflow evidence exists, and promote to domain only when multiple capabilities share the boundary.",
    "- For capability and element nodes, set or verify domain before writing so browse/map/edit colors carry a meaningful ownership boundary.",
    "- Before writing, report source path, symbol, route, command, or MCP tool evidence; then state why not the nearest adjacent kind.",
    "If the resulting ontology color feels wrong in browse/map/edit surfaces, re-check the kind against evidence and patch the frontmatter instead of leaving a misleading category.",
  ].join("\n");
}

export function buildAgentHandoffPrompt(
  recipes: AgentQueryRecipe[],
  entrypoints: readonly AgentQueryEntrypoint[] = [],
  projectEntrypoint: AgentProjectEntrypoint | null = null,
  traversalStrategies: readonly AgentTraversalStrategy[] = [],
  graphDbQueryPack: readonly AgentGraphDbQueryPackItem[] = [],
  guardrails: readonly AgentWriteGuardrail[] = [],
): string {
  const runOrder = formatAgentRunOrderPrompt(recipes);
  const graphDbPackSection =
    graphDbQueryPack.length > 0
      ? [
          "",
          "Graph DB query pack for local markdown graph scans:",
          formatAgentGraphDbQueryPack(graphDbQueryPack),
        ]
      : [];
  const guardrailSection =
    guardrails.length > 0
      ? [
          "",
          "Write guardrails before changing the markdown vault:",
          "Relation decision guide: skip_existing means do not add; review_inverse and review_new_schema require explicit justification; safe_to_add still requires citing relation_check evidence.",
          ...guardrails.map(
            (guardrail, index) =>
              `## Guardrail ${index + 1}. ${guardrail.id}\n${formatAgentGuardrailPrompt(guardrail)}`,
          ),
        ]
      : [];
  const suggestedSlugs =
    entrypoints.length > 0 || projectEntrypoint
      ? [
          "",
          "Suggested starting slugs for impact/path queries:",
          ...(projectEntrypoint
            ? [
                `- ${projectEntrypoint.slug} (project, degree ${projectEntrypoint.degree})`,
              ]
            : []),
          ...entrypoints.map(
            (entrypoint) =>
              `- ${entrypoint.slug} (${entrypoint.kind}, degree ${entrypoint.degree})`,
          ),
        ]
      : [];

  return [
    "Use the ontology-atlas MCP server as the codebase graph memory before editing.",
    "Start with the first-contact calls below, inspect health before writes, and run query_plan before heavier impact queries.",
    "For relation_check results, follow recommendation.decision before using proposedAction; review_inverse and review_new_schema require an explicit human-readable justification before add_relation.",
    "For match_nodes and match_edges, run the returned followUp calls before treating scan rows as graph evidence.",
    traversalStrategies.length > 0
      ? `Traversal strategy: ${traversalStrategies.map((strategy) => strategy.id).join(" -> ")}.`
      : "Traversal strategy: plan_before_enumeration -> bounded_path_evidence -> containment_cross_check.",
    formatAgentKindClassificationGuidance(),
    "When code changes introduce or rename a domain, capability, element, or relation, sync the docs/ontology vault before finishing.",
    "",
    runOrder,
    ...graphDbPackSection,
    ...guardrailSection,
    ...suggestedSlugs,
  ].join("\n");
}

export function buildAgentTraversalStrategies(
  entrypoints: readonly AgentQueryEntrypoint[] = [],
  projectEntrypoint: AgentProjectEntrypoint | null = null,
): AgentTraversalStrategy[] {
  const impactSlug = entrypoints[0]?.slug ?? "<from-slug>";
  const pathTargetSlug =
    entrypoints.find((entrypoint) => entrypoint.slug !== impactSlug)?.slug ?? "<to-slug>";
  const projectSlug = projectEntrypoint?.slug ?? "<project-slug>";
  const traversalBudget = {
    maxHops: 3,
    limit: 10,
    searchBudget: 1000,
    types: ["depends_on", "relates"],
  };

  const query = (
    operation: string,
    argumentsPayload: Record<string, unknown>,
  ): AgentMcpQueryCall => ({
    operation: `query_ontology.${operation}`,
    tool: "query_ontology",
    arguments: argumentsPayload,
  });

  const traversalPlan = query("query_plan", {
    operation: "query_plan",
    targetOperation: "all_paths",
    from: impactSlug,
    to: pathTargetSlug,
    ...traversalBudget,
  });
  const boundedPaths = query("all_paths", {
    operation: "all_paths",
    from: impactSlug,
    to: pathTargetSlug,
    ...traversalBudget,
  });

  return [
    {
      id: "plan_before_enumeration",
      titleKey: "agentTraversalStrategyPlanTitle",
      promptKey: "agentTraversalStrategyPlanPrompt",
      priority: "first",
      evidence: [
        "query_plan.execution.nextStep",
        "query_plan.execution.suggestedQuery",
        "query_plan.execution.saferQuery when present",
      ],
      stopWhen: [
        "execution.nextStep is narrow or review and the saferQuery still lacks maxHops/types/searchBudget bounds.",
      ],
      payloads: [traversalPlan],
    },
    {
      id: "bounded_path_evidence",
      titleKey: "agentTraversalStrategyBoundedTitle",
      promptKey: "agentTraversalStrategyBoundedPrompt",
      priority: "evidence",
      evidence: [
        "all_paths.evidence.status",
        "all_paths.evidence.reason",
        "all_paths.evidence.pathsComplete",
        "all_paths.totalPathsExact",
      ],
      stopWhen: [
        "evidence.status is partial, evidence.pathsComplete is false, or totalPathsExact is false; follow evidence.suggestedQuery or evidence.saferQuery before writing.",
      ],
      payloads: [boundedPaths],
    },
    {
      id: "containment_cross_check",
      titleKey: "agentTraversalStrategyContainmentTitle",
      promptKey: "agentTraversalStrategyContainmentPrompt",
      priority: "confirm",
      evidence: [
        "pattern_walk rows for project -> domains -> capabilities",
        "project_map domain placement and boundary edges",
      ],
      stopWhen: [
        "pattern_walk and project_map disagree on project/domain placement.",
      ],
      payloads: [
        query("pattern_walk", {
          operation: "pattern_walk",
          slug: projectSlug,
          pattern: ["domains", "capabilities"],
          direction: "outgoing",
          limit: 20,
        }),
        query("project_map", {
          operation: "project_map",
          project: projectSlug,
          limit: 10,
          itemLimit: 20,
        }),
      ],
    },
  ];
}

export function buildAgentGraphDbQueryPack(
  entrypoints: readonly AgentQueryEntrypoint[] = [],
): AgentGraphDbQueryPackItem[] {
  const impactSlug = entrypoints[0]?.slug ?? "<from-slug>";
  const pathTargetSlug =
    entrypoints.find((entrypoint) => entrypoint.slug !== impactSlug)?.slug ?? "<to-slug>";

  const query = (
    operation: string,
    argumentsPayload: Record<string, unknown>,
  ): AgentMcpQueryCall => ({
    operation: `query_ontology.${operation}`,
    tool: "query_ontology",
    arguments: argumentsPayload,
  });

  return [
    {
      id: "graph_facets",
      titleKey: "agentGraphDbFacetsTitle",
      promptKey: "agentGraphDbFacetsPrompt",
      intent: "MATCH graph RETURN kind/domain/degree/relation facets LIMIT 10",
      payloads: [
        query("facets", {
          operation: "facets",
          limit: 10,
        }),
        query("schema", {
          operation: "schema",
          limit: 20,
        }),
      ],
    },
    {
      id: "node_scan",
      titleKey: "agentGraphDbNodeScanTitle",
      promptKey: "agentGraphDbNodeScanPrompt",
      intent: "MATCH (n:capability) WHERE degree(n) >= 2 RETURN n ORDER BY degree(n) DESC LIMIT 10",
      payloads: [
        query("query_plan", {
          operation: "query_plan",
          targetOperation: "match_nodes",
          kind: "capability",
          minDegree: 2,
          sort: "degree",
          limit: 10,
        }),
        query("match_nodes", {
          operation: "match_nodes",
          kind: "capability",
          minDegree: 2,
          sort: "degree",
          limit: 10,
        }),
      ],
    },
    {
      id: "edge_scan",
      titleKey: "agentGraphDbEdgeScanTitle",
      promptKey: "agentGraphDbEdgeScanPrompt",
      intent: "MATCH ()-[r:depends_on]->() RETURN r LIMIT 20",
      payloads: [
        query("query_plan", {
          operation: "query_plan",
          targetOperation: "match_edges",
          types: ["depends_on"],
          limit: 20,
        }),
        query("match_edges", {
          operation: "match_edges",
          types: ["depends_on"],
          limit: 20,
        }),
      ],
    },
    {
      id: "domain_coupling",
      titleKey: "agentGraphDbDomainCouplingTitle",
      promptKey: "agentGraphDbDomainCouplingPrompt",
      intent: "MATCH (domain)-[depends_on|relates]->(domain) RETURN coupling_matrix LIMIT 6",
      payloads: [
        query("domain_matrix", {
          operation: "domain_matrix",
          types: ["depends_on", "relates"],
          limit: 6,
        }),
        query("query_plan", {
          operation: "query_plan",
          targetOperation: "centrality",
          types: ["depends_on", "relates"],
          limit: 10,
        }),
        query("centrality", {
          operation: "centrality",
          types: ["depends_on", "relates"],
          limit: 10,
        }),
      ],
    },
    {
      id: "path_evidence",
      titleKey: "agentGraphDbPathEvidenceTitle",
      promptKey: "agentGraphDbPathEvidencePrompt",
      intent: "MATCH p=(from)-[:depends_on|relates*..3]-(to) RETURN p LIMIT 10",
      payloads: [
        query("query_plan", {
          operation: "query_plan",
          targetOperation: "all_paths",
          from: impactSlug,
          to: pathTargetSlug,
          maxHops: 3,
          types: ["depends_on", "relates"],
          searchBudget: 1000,
          limit: 10,
        }),
        query("all_paths", {
          operation: "all_paths",
          from: impactSlug,
          to: pathTargetSlug,
          maxHops: 3,
          types: ["depends_on", "relates"],
          searchBudget: 1000,
          limit: 10,
        }),
        query("explain_relation", {
          operation: "explain_relation",
          from: impactSlug,
          to: pathTargetSlug,
          direction: "undirected",
          maxHops: 5,
          types: ["depends_on", "relates"],
          limit: 10,
        }),
      ],
    },
  ];
}

export function buildAgentWriteGuardrails(
  entrypoints: readonly AgentQueryEntrypoint[] = [],
): AgentWriteGuardrail[] {
  const impactSlug = entrypoints[0]?.slug ?? "<from-slug>";
  const targetSlug =
    entrypoints.find((entrypoint) => entrypoint.slug !== impactSlug)?.slug ?? "<to-slug>";

  const query = (
    operation: string,
    argumentsPayload: Record<string, unknown>,
  ): AgentMcpToolCall => ({
    operation: `query_ontology.${operation}`,
    tool: "query_ontology",
    arguments: argumentsPayload,
  });

  return [
    {
      id: "preflight_relation",
      titleKey: "agentGuardrailRelationTitle",
      promptKey: "agentGuardrailRelationPrompt",
      payloads: [
        query("relation_check", {
          operation: "relation_check",
          from: impactSlug,
          to: targetSlug,
          type: "depends_on",
        }),
        query("explain_relation", {
          operation: "explain_relation",
          from: impactSlug,
          to: targetSlug,
          direction: "undirected",
          maxHops: 5,
          types: ["depends_on", "relates"],
          limit: 10,
        }),
        query("path", {
          operation: "path",
          from: impactSlug,
          to: targetSlug,
          maxHops: 5,
        }),
      ],
    },
    {
      id: "preflight_rename",
      titleKey: "agentGuardrailRenameTitle",
      promptKey: "agentGuardrailRenamePrompt",
      payloads: [
        {
          operation: "find_backlinks",
          tool: "find_backlinks",
          arguments: { slug: impactSlug },
        },
        query("node_profile", {
          operation: "node_profile",
          slug: impactSlug,
          depth: 1,
          limit: 12,
        }),
      ],
    },
    {
      id: "post_change_sync",
      titleKey: "agentGuardrailSyncTitle",
      promptKey: "agentGuardrailSyncPrompt",
      payloads: [
        query("health", { operation: "health" }),
        query("cycles", { operation: "cycles", maxHops: 8 }),
        query("growth_plan", { operation: "growth_plan", limit: 20 }),
        query("maintenance_plan", { operation: "maintenance_plan", limit: 20 }),
        {
          operation: "validate_vault",
          tool: "validate_vault",
          arguments: {},
        },
      ],
      cliFallbackCommands: buildAgentPostChangeSyncCliCommands().map((item) => item.command),
    },
  ];
}

/**
 * Pick concrete graph entrypoints an agent can use instead of stopping at
 * `<slug>` placeholders. Hubs are better first targets for `blast_radius`,
 * `path`, and `node_profile` because they usually expose real coupling faster
 * than leaf nodes.
 */
export function selectAgentQueryEntrypoints(
  nodes: readonly KnowledgeGraphNode[],
  edges: readonly KnowledgeGraphEdge[],
  limit = 4,
): AgentQueryEntrypoint[] {
  const degrees = new Map(nodes.map((node) => [node.id, 0]));
  for (const edge of edges) {
    if (degrees.has(edge.from)) {
      degrees.set(edge.from, (degrees.get(edge.from) ?? 0) + 1);
    }
    if (edge.to !== edge.from && degrees.has(edge.to)) {
      degrees.set(edge.to, (degrees.get(edge.to) ?? 0) + 1);
    }
  }

  return nodes
    .filter((node) => ["domain", "capability", "element"].includes(node.kind))
    .map((node) => ({
      slug: node.id,
      title: node.title,
      kind: node.kind,
      degree: degrees.get(node.id) ?? 0,
    }))
    .filter((entrypoint) => entrypoint.degree > 0)
    .sort((a, b) => {
      if (b.degree !== a.degree) return b.degree - a.degree;
      if (a.kind !== b.kind) return a.kind.localeCompare(b.kind);
      return a.slug.localeCompare(b.slug);
    })
    .slice(0, limit);
}

export function selectAgentProjectEntrypoint(
  nodes: readonly KnowledgeGraphNode[],
  edges: readonly KnowledgeGraphEdge[],
): AgentProjectEntrypoint | null {
  const degrees = new Map(nodes.map((node) => [node.id, 0]));
  for (const edge of edges) {
    if (degrees.has(edge.from)) {
      degrees.set(edge.from, (degrees.get(edge.from) ?? 0) + 1);
    }
    if (edge.to !== edge.from && degrees.has(edge.to)) {
      degrees.set(edge.to, (degrees.get(edge.to) ?? 0) + 1);
    }
  }

  const [project] = nodes
    .filter((node) => node.kind === "project")
    .map((node) => ({
      slug: node.id,
      title: node.title,
      degree: degrees.get(node.id) ?? 0,
    }))
    .sort((a, b) => {
      if (b.degree !== a.degree) return b.degree - a.degree;
      return a.slug.localeCompare(b.slug);
    });

  return project ?? null;
}

/**
 * Curated graph-query entry points for AI agents.
 *
 * The MCP surface is intentionally broad; this keeps the first visible UI
 * bridge narrow and status-aware so users do not need to discover the 30+
 * `query_ontology` operations before getting useful graph answers.
 */
export function buildAgentQueryRecipes(
  status: AgentReadinessStatus,
  entrypoints: readonly AgentQueryEntrypoint[] = [],
  projectEntrypoint: AgentProjectEntrypoint | null = null,
): AgentQueryRecipe[] {
  const impactSlug = entrypoints[0]?.slug ?? "<slug>";
  const impactTitle = entrypoints[0]?.title ?? "<candidate-title>";
  const impactKind = entrypoints[0]?.kind ?? "capability";
  const pathTargetSlug = entrypoints.find((entrypoint) => entrypoint.slug !== impactSlug)?.slug ?? "<other-slug>";
  const projectSlug = projectEntrypoint?.slug ?? "<project-slug>";
  const common: AgentQueryRecipe[] = [
    {
      id: "agent_brief",
      operation: "query_ontology.agent_brief",
      promptKey: "agentRecipePromptAgentBrief",
      tool: "query_ontology",
      arguments: { operation: "agent_brief" },
      priority: "primary",
    },
    {
      id: "workspace_brief",
      operation: "query_ontology.workspace_brief",
      promptKey: "agentRecipePromptWorkspaceBrief",
      tool: "query_ontology",
      arguments: { operation: "workspace_brief" },
      priority: "primary",
    },
    {
      id: "query_plan",
      operation: "query_ontology.query_plan",
      promptKey: "agentRecipePromptQueryPlan",
      tool: "query_ontology",
      arguments: {
        operation: "query_plan",
        targetOperation: "blast_radius",
        slug: impactSlug,
        depth: 2,
      },
      priority: "secondary",
    },
    {
      id: "health",
      operation: "query_ontology.health",
      promptKey: "agentRecipePromptHealth",
      tool: "query_ontology",
      arguments: { operation: "health" },
      priority: status === "ready" ? "secondary" : "primary",
    },
    {
      id: "node_profile",
      operation: "query_ontology.node_profile",
      promptKey: "agentRecipePromptNodeProfile",
      tool: "query_ontology",
      arguments: {
        operation: "node_profile",
        slug: impactSlug,
        depth: 2,
        limit: 12,
      },
      priority: "secondary",
    },
    {
      id: "components",
      operation: "query_ontology.components",
      promptKey: "agentRecipePromptComponents",
      tool: "query_ontology",
      arguments: { operation: "components", limit: 20 },
      priority: "secondary",
    },
    {
      id: "path",
      operation: "query_ontology.path",
      promptKey: "agentRecipePromptPath",
      tool: "query_ontology",
      arguments: {
        operation: "path",
        from: impactSlug,
        to: pathTargetSlug,
        maxHops: 5,
      },
      priority: "secondary",
    },
    {
      id: "explain_relation",
      operation: "query_ontology.explain_relation",
      promptKey: "agentRecipePromptExplainRelation",
      tool: "query_ontology",
      arguments: {
        operation: "explain_relation",
        from: impactSlug,
        to: pathTargetSlug,
        direction: "undirected",
        maxHops: 5,
        types: ["depends_on", "relates"],
        limit: 10,
      },
      priority: "secondary",
    },
    {
      id: "similar_nodes",
      operation: "query_ontology.similar_nodes",
      promptKey: "agentRecipePromptSimilarNodes",
      tool: "query_ontology",
      arguments: {
        operation: "similar_nodes",
        title: impactTitle,
        candidateSlug: impactSlug,
        kind: impactKind,
        limit: 10,
      },
      priority: "secondary",
    },
    {
      id: "relation_check",
      operation: "query_ontology.relation_check",
      promptKey: "agentRecipePromptRelationCheck",
      tool: "query_ontology",
      arguments: {
        operation: "relation_check",
        from: impactSlug,
        to: pathTargetSlug,
        type: "depends_on",
      },
      priority: "secondary",
    },
    {
      id: "blast_radius",
      operation: "query_ontology.blast_radius",
      promptKey: "agentRecipePromptBlastRadius",
      tool: "query_ontology",
      arguments: {
        operation: "blast_radius",
        slug: impactSlug,
        depth: 2,
        direction: "incoming",
      },
      priority: "secondary",
    },
    {
      id: "domain_matrix",
      operation: "query_ontology.domain_matrix",
      promptKey: "agentRecipePromptDomainMatrix",
      tool: "query_ontology",
      arguments: { operation: "domain_matrix" },
      priority: "secondary",
    },
    {
      id: "all_paths",
      operation: "query_ontology.all_paths",
      promptKey: "agentRecipePromptAllPaths",
      tool: "query_ontology",
      arguments: {
        operation: "all_paths",
        from: impactSlug,
        to: pathTargetSlug,
        maxHops: 3,
        types: ["depends_on", "relates"],
        searchBudget: 1000,
        limit: 10,
      },
      priority: "secondary",
    },
    {
      id: "pattern_walk",
      operation: "query_ontology.pattern_walk",
      promptKey: "agentRecipePromptPatternWalk",
      tool: "query_ontology",
      arguments: {
        operation: "pattern_walk",
        slug: projectSlug,
        pattern: ["domains", "capabilities"],
        direction: "outgoing",
        limit: 20,
      },
      priority: "secondary",
    },
    {
      id: "cycles",
      operation: "query_ontology.cycles",
      promptKey: "agentRecipePromptCycles",
      tool: "query_ontology",
      arguments: { operation: "cycles", maxHops: 8 },
      priority: "secondary",
    },
    {
      id: "topological_order",
      operation: "query_ontology.topological_order",
      promptKey: "agentRecipePromptTopologicalOrder",
      tool: "query_ontology",
      arguments: {
        operation: "topological_order",
        types: ["depends_on"],
        includeIsolated: false,
        limit: 20,
      },
      priority: "secondary",
    },
    {
      id: "growth_plan",
      operation: "query_ontology.growth_plan",
      promptKey: "agentRecipePromptGrowthPlan",
      tool: "query_ontology",
      arguments: { operation: "growth_plan", limit: 20 },
      priority: "secondary",
    },
    {
      id: "maintenance_plan",
      operation: "query_ontology.maintenance_plan",
      promptKey: "agentRecipePromptMaintenancePlan",
      tool: "query_ontology",
      arguments: { operation: "maintenance_plan", limit: 20 },
      priority: "secondary",
    },
  ];

  if (status === "ready") return common;
  return [...common].sort((a, b) => {
    if (a.priority !== b.priority) return a.priority === "primary" ? -1 : 1;
    return common.indexOf(a) - common.indexOf(b);
  });
}

export function buildAgentInvestigationPlaybooks(
  entrypoints: readonly AgentQueryEntrypoint[] = [],
  projectEntrypoint: AgentProjectEntrypoint | null = null,
): AgentInvestigationPlaybook[] {
  const impactSlug = entrypoints[0]?.slug ?? "<slug>";
  const pathTargetSlug =
    entrypoints.find((entrypoint) => entrypoint.slug !== impactSlug)?.slug ?? "<other-slug>";
  const projectSlug = projectEntrypoint?.slug ?? "<project-slug>";

  const recipe = (
    operation: string,
    argumentsPayload: Record<string, unknown>,
  ): AgentMcpQueryCall => ({
    operation: `query_ontology.${operation}`,
    tool: "query_ontology",
    arguments: argumentsPayload,
  });

  return [
    {
      id: "refactor_impact",
      titleKey: "agentPlaybookRefactorTitle",
      promptKey: "agentPlaybookRefactorPrompt",
      evidence: [
        "Target node profile, incoming blast radius groups, and the highest-risk affected slugs.",
        "Whether an existing direct edge, path, or common-neighbor explanation already explains the proposed relation.",
        "The relation_check recommendation.decision before any add_relation.",
      ],
      stopWhen: [
        "health reports failing checks or actionable nextActions.",
        "relation_check returns skip_existing, review_inverse, or review_new_schema.",
        "blast radius crosses domains that are outside the requested change.",
      ],
      payloads: [
        recipe("workspace_brief", { operation: "workspace_brief" }),
        recipe("query_plan", {
          operation: "query_plan",
          targetOperation: "blast_radius",
          slug: impactSlug,
          depth: 2,
        }),
        recipe("node_profile", {
          operation: "node_profile",
          slug: impactSlug,
          depth: 2,
          limit: 12,
        }),
        recipe("blast_radius", {
          operation: "blast_radius",
          slug: impactSlug,
          depth: 2,
          direction: "incoming",
        }),
        recipe("path", {
          operation: "path",
          from: impactSlug,
          to: pathTargetSlug,
          maxHops: 5,
        }),
        recipe("explain_relation", {
          operation: "explain_relation",
          from: impactSlug,
          to: pathTargetSlug,
          direction: "undirected",
          maxHops: 5,
          types: ["depends_on", "relates"],
          limit: 10,
        }),
        recipe("relation_check", {
          operation: "relation_check",
          from: impactSlug,
          to: pathTargetSlug,
          type: "depends_on",
        }),
      ],
    },
    {
      id: "onboarding_map",
      titleKey: "agentPlaybookOnboardingTitle",
      promptKey: "agentPlaybookOnboardingPrompt",
      evidence: [
        "Workspace status, project/domain map, and the main high-degree entrypoints.",
        "Domain coupling rows that explain where codebase knowledge clusters.",
        "Graph DB-style node scan results that surface high-degree capability starting points.",
        "One concrete hub profile to anchor the first mental model.",
      ],
      stopWhen: [
        "workspace_brief reports unresolved graph health issues.",
        "query_plan(match_nodes) asks for a narrower kind/domain/limit before scanning.",
        "node_profile cannot resolve the selected high-degree entrypoint.",
      ],
      payloads: [
        recipe("workspace_brief", { operation: "workspace_brief" }),
        recipe("domain_matrix", { operation: "domain_matrix" }),
        recipe("query_plan", {
          operation: "query_plan",
          targetOperation: "match_nodes",
          kind: "capability",
          minDegree: 2,
          sort: "degree",
          limit: 10,
        }),
        recipe("match_nodes", {
          operation: "match_nodes",
          kind: "capability",
          minDegree: 2,
          sort: "degree",
          limit: 10,
        }),
        recipe("node_profile", {
          operation: "node_profile",
          slug: impactSlug,
          depth: 2,
          limit: 12,
        }),
      ],
    },
    {
      id: "coupling_audit",
      titleKey: "agentPlaybookCouplingTitle",
      promptKey: "agentPlaybookCouplingPrompt",
      evidence: [
        "Domain-to-domain coupling hot spots.",
        "Central nodes and dependency edges that create boundary pressure.",
        "Any cycles, disconnected components, or health failures that weaken the audit.",
      ],
      stopWhen: [
        "health fails or reports dependency cycles.",
        "centrality and match_edges point to conflicting boundary conclusions.",
      ],
      payloads: [
        recipe("health", { operation: "health" }),
        recipe("domain_matrix", { operation: "domain_matrix" }),
        recipe("query_plan", {
          operation: "query_plan",
          targetOperation: "centrality",
          types: ["depends_on", "relates"],
          limit: 10,
        }),
        recipe("centrality", {
          operation: "centrality",
          types: ["depends_on", "relates"],
          limit: 10,
        }),
        recipe("query_plan", {
          operation: "query_plan",
          targetOperation: "match_edges",
          types: ["depends_on"],
          limit: 20,
        }),
        recipe("match_edges", {
          operation: "match_edges",
          types: ["depends_on"],
          limit: 20,
        }),
      ],
    },
    {
      id: "graph_traversal",
      titleKey: "agentPlaybookTraversalTitle",
      promptKey: "agentPlaybookTraversalPrompt",
      evidence: [
        "Schema patterns that make the traversal legal and meaningful.",
        "Bounded all_paths alternatives plus evidence.status, evidence.reason, and evidence.pathsComplete.",
        "Pattern-walk containment evidence and the project_map domain placement.",
      ],
      stopWhen: [
        "query_plan marks all_paths as high cost for the requested bounds.",
        "all_paths evidence.status is partial or evidence.pathsComplete is false; run evidence.suggestedQuery or saferQuery before writing.",
        "pattern_walk and project_map disagree on project/domain containment.",
      ],
      payloads: [
        recipe("schema", { operation: "schema", limit: 20 }),
        recipe("query_plan", {
          operation: "query_plan",
          targetOperation: "all_paths",
          from: impactSlug,
          to: pathTargetSlug,
          maxHops: 3,
          types: ["depends_on", "relates"],
          searchBudget: 1000,
          limit: 10,
        }),
        recipe("all_paths", {
          operation: "all_paths",
          from: impactSlug,
          to: pathTargetSlug,
          maxHops: 3,
          types: ["depends_on", "relates"],
          searchBudget: 1000,
          limit: 10,
        }),
        recipe("pattern_walk", {
          operation: "pattern_walk",
          slug: projectSlug,
          pattern: ["domains", "capabilities"],
          direction: "outgoing",
          limit: 20,
        }),
        recipe("project_map", {
          operation: "project_map",
          project: projectSlug,
          limit: 10,
          itemLimit: 20,
        }),
      ],
    },
  ];
}
