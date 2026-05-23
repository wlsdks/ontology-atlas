import type { AgentReadinessStatus } from "./agent-readiness";
import type { KnowledgeGraphEdge, KnowledgeGraphNode } from "@/entities/knowledge-graph";

const AGENT_QUERY_OPERATIONS = new Set([
  "all_paths",
  "agent_brief",
  "workspace_brief",
  "query_plan",
  "health",
  "node_profile",
  "path",
  "relation_check",
  "blast_radius",
  "domain_matrix",
  "centrality",
  "match_nodes",
  "match_edges",
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
  | "node_profile"
  | "path"
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
}

const ALL_PATHS_RESULT_CONTRACT = [
  "For all_paths, report limit, searchBudget, expandedStates, exhaustive, truncatedByBudget, totalPathsExact, evidence.status, evidence.reason, and evidence.pathsComplete.",
  "Treat returned paths as partial evidence unless evidence.pathsComplete is true; when evidence.status is partial, follow evidence.suggestedQuery or evidence.saferQuery before writing.",
  "Do not use a single returned path as proof when all_paths is limited, budget-truncated, or evidence.pathsComplete is false.",
];

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
    .filter((command): command is string => command !== null);
  const cliFallback =
    cliCommands.length > 0
      ? [
          "",
          "CLI fallback commands when the MCP connector is unavailable:",
          ...cliCommands.map((command, index) => `${index + 1}. ${command}`),
        ]
      : [];

  return [
    "Use this oh-my-ontology first-contact run order before answering from the codebase graph.",
    "Run the MCP calls in order. Report health, cite concrete slugs/edges, and run query_plan before heavier traversal or impact queries.",
    ...ALL_PATHS_RESULT_CONTRACT,
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
      return "oh-my-ontology agent-brief [vault]";
    case "workspace_brief":
      return "oh-my-ontology workspace-brief [vault]";
    case "health":
      return "oh-my-ontology health [vault]";
    case "query_plan": {
      if (args.targetOperation === "blast_radius") {
        const slug = stringArg(args.slug, "<slug>");
        return withFlags(`oh-my-ontology blast-radius ${shellQuote(slug)} [vault]`, [
          "--plan",
          nonNegativeFlag("--depth", args.depth),
          stringFlag("--direction", args.direction),
        ]);
      }
      if (args.targetOperation === "centrality") {
        return withFlags("oh-my-ontology hubs [vault]", [
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
      return null;
    }
    case "node_profile": {
      const slug = stringArg(args.slug, "<slug>");
      return withFlags(`oh-my-ontology node ${shellQuote(slug)} [vault]`, [
        positiveFlag("--limit", args.limit),
      ]);
    }
    case "path": {
      const from = stringArg(args.from, "<from-slug>");
      const to = stringArg(args.to, "<to-slug>");
      return withFlags(`oh-my-ontology path ${shellQuote(from)} ${shellQuote(to)} [vault]`, [
        nonNegativeFlag("--max-hops", args.maxHops),
      ]);
    }
    case "relation_check": {
      const from = stringArg(args.from, "<from-slug>");
      const to = stringArg(args.to, "<to-slug>");
      const type = stringArg(args.type, "depends_on");
      return `oh-my-ontology relation-check ${shellQuote(from)} ${shellQuote(to)} ${shellQuote(type)} [vault]`;
    }
    case "blast_radius": {
      const slug = stringArg(args.slug, "<slug>");
      return withFlags(`oh-my-ontology blast-radius ${shellQuote(slug)} [vault]`, [
        nonNegativeFlag("--depth", args.depth),
        stringFlag("--direction", args.direction),
      ]);
    }
    case "all_paths": {
      const from = stringArg(args.from, "<from-slug>");
      const to = stringArg(args.to, "<to-slug>");
      return withFlags(`oh-my-ontology all-paths ${shellQuote(from)} ${shellQuote(to)} [vault]`, [
        "--plan",
        nonNegativeFlag("--max-hops", args.maxHops),
        csvFlag("--types", args.types),
        positiveFlag("--search-budget", args.searchBudget),
        positiveFlag("--limit", args.limit),
      ]);
    }
    case "centrality":
      return withFlags("oh-my-ontology hubs [vault]", [
        positiveFlag("--limit", args.limit),
        csvFlag("--types", args.types),
      ]);
    case "match_edges":
      return formatMatchEdgesCommand(args);
    case "match_nodes":
      return formatMatchNodesCommand(args);
    case "domain_matrix":
      return withFlags("oh-my-ontology domain-matrix [vault]", [
        stringFlag("--project", args.project),
        positiveFlag("--limit", args.limit),
        csvFlag("--types", args.types),
      ]);
    default:
      return null;
  }
}

function formatMatchEdgesCommand(
  args: Record<string, unknown>,
  options: { plan?: boolean } = {},
): string {
  return withFlags("oh-my-ontology match-edges [vault]", [
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
  return withFlags("oh-my-ontology match-nodes [vault]", [
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

function csvFlag(name: string, value: unknown): string | null {
  if (!Array.isArray(value) || value.length === 0) return null;
  const values = value.filter((item): item is string => typeof item === "string" && item.trim().length > 0);
  return values.length > 0 ? `${name} ${values.map(shellQuote).join(",")}` : null;
}

function booleanFlag(name: string, value: unknown): string | null {
  return value === true ? name : null;
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
    .filter((command): command is string => command !== null);
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
    "Use the oh-my-ontology MCP server to answer this investigation intent before editing.",
    "Run the calls in order, cite the returned slugs/edges in your reasoning, and only write to the vault after the graph evidence is clear.",
    ...ALL_PATHS_RESULT_CONTRACT,
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
    "Use this oh-my-ontology MCP traversal strategy before treating graph paths as evidence.",
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
    .filter((command): command is string => command !== null);
  const cliFallback =
    cliCommands.length > 0
      ? [
          "",
          "CLI fallback commands when the MCP connector is unavailable:",
          ...cliCommands.map((command, index) => `${index + 1}. ${command}`),
        ]
      : [];

  return [
    "Use this oh-my-ontology graph traversal packet before treating graph paths as evidence.",
    "Run query_plan before all_paths, keep traversal bounded, and cross-check containment before changing ownership, domain boundaries, or relation direction.",
    ...ALL_PATHS_RESULT_CONTRACT,
    "",
    "Execution gates:",
    gates,
    "",
    "MCP calls:",
    payloads,
    ...cliFallback,
  ].join("\n");
}

export function formatAgentGuardrailPrompt(guardrail: AgentWriteGuardrail): string {
  const payloads = guardrail.payloads
    .map((payload, index) => `${index + 1}. ${payload.operation}\n${formatAgentMcpToolPayload(payload)}`)
    .join("\n\n");

  return [
    "Use this oh-my-ontology MCP write gate before changing the vault.",
    "Run the reads/preflights in order, cite the evidence, then perform the write only when the target relation or rename is still justified.",
    "For relation_check, follow recommendation.decision first: skip_existing means do not add, review_inverse or review_new_schema means pause and explain before writing.",
    "",
    payloads,
  ].join("\n");
}

export function buildAgentHandoffPrompt(
  recipes: AgentQueryRecipe[],
  entrypoints: readonly AgentQueryEntrypoint[] = [],
  projectEntrypoint: AgentProjectEntrypoint | null = null,
  traversalStrategies: readonly AgentTraversalStrategy[] = [],
): string {
  const runOrder = formatAgentRunOrderPrompt(recipes);
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
    "Use the oh-my-ontology MCP server as the codebase graph memory before editing.",
    "Start with the first-contact calls below, inspect health before writes, and run query_plan before heavier impact queries.",
    "For relation_check results, follow recommendation.decision before using proposedAction; review_inverse and review_new_schema require an explicit human-readable justification before add_relation.",
    traversalStrategies.length > 0
      ? `Traversal strategy: ${traversalStrategies.map((strategy) => strategy.id).join(" -> ")}.`
      : "Traversal strategy: plan_before_enumeration -> bounded_path_evidence -> containment_cross_check.",
    "When code changes introduce or rename a domain, capability, element, or relation, sync the docs/ontology vault before finishing.",
    "",
    runOrder,
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
        {
          operation: "validate_vault",
          tool: "validate_vault",
          arguments: {},
        },
      ],
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
        "Whether an existing path already explains the proposed relation.",
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
