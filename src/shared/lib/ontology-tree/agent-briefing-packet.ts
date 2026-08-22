import type { KnowledgeGraphEdge, KnowledgeGraphNode } from "@/entities/knowledge-graph";
import { buildAgentReadinessSummary, type AgentReadinessSummary } from "./agent-readiness";
import {
  buildAgentGraphDbQueryPack,
  buildAgentHandoffPrompt,
  buildAgentQueryRecipes,
  buildAgentTraversalStrategies,
  buildAgentWriteGuardrails,
  selectAgentProjectEntrypoint,
  selectAgentQueryEntrypoints,
  type AgentQueryEntrypoint,
} from "./agent-query-recipes";
import type { OntologyTreeBuildResult } from "./types";

/**
 * The single agent onboarding briefing — one copy, pasted once into an AI coding
 * agent (Claude Code / Codex / Cursor), gives that agent this codebase's ontology
 * memory immediately.
 *
 * It folds the ~10 scattered "Copy …" packets (run order, graph-DB pack,
 * readiness, guardrails, …) into one. No new logic: it assembles the existing
 * certified composers (`buildAgentHandoffPrompt` and friends) and prepends a
 * mental-model plus readiness header so the reader learns what they are looking at
 * first.
 *
 * The briefing body is English text an agent consumes (same register as
 * `buildAgentHandoffPrompt`). Only the button label and toast go through i18n.
 */
const BRIEFING_INTRO = [
  "# ontology-atlas — agent onboarding brief",
  "",
  "Paste this into your AI coding agent (Claude Code / Codex / Cursor) to load this",
  "codebase's ontology memory: the developer-maintained mental model — domains,",
  "capabilities, elements, and typed relations over the local markdown vault.",
  "Prefer the MCP query_ontology calls below; CLI fallbacks are listed for when the",
  "MCP connector is unavailable. Cite concrete slugs/edges and run query_plan before",
  "heavier traversal or impact queries.",
];

const CENSUS_KIND_ORDER = ["project", "domain", "capability", "element", "document", "unknown"];

function censusLine(nodes: readonly KnowledgeGraphNode[]): string {
  const counts = new Map<string, number>();
  for (const node of nodes) counts.set(node.kind, (counts.get(node.kind) ?? 0) + 1);
  const ordered = [
    ...CENSUS_KIND_ORDER.filter((k) => counts.has(k)),
    ...[...counts.keys()].filter((k) => !CENSUS_KIND_ORDER.includes(k)).sort(),
  ];
  if (ordered.length === 0) return "empty vault";
  return ordered.map((k) => `${k} ${counts.get(k)}`).join(" · ");
}

function topNodeIds(nodes: readonly KnowledgeGraphNode[], kind: string, limit: number): string[] {
  return nodes
    .filter((node) => node.kind === kind)
    .map((node) => node.id)
    .slice(0, limit);
}

function implementationEvidenceIds(
  nodes: readonly KnowledgeGraphNode[],
  edges: readonly KnowledgeGraphEdge[],
  limit: number,
): string[] {
  const capabilityIds = new Set(nodes.filter((node) => node.kind === "capability").map((node) => node.id));
  const elementIds = new Set(nodes.filter((node) => node.kind === "element").map((node) => node.id));
  const evidence: string[] = [];

  for (const edge of edges) {
    if (capabilityIds.has(edge.from) && elementIds.has(edge.to) && !evidence.includes(edge.to)) {
      evidence.push(edge.to);
    }
    if (capabilityIds.has(edge.to) && elementIds.has(edge.from) && !evidence.includes(edge.from)) {
      evidence.push(edge.from);
    }
  }

  return evidence.slice(0, limit);
}

function buildBusinessToCodeLens(
  nodes: readonly KnowledgeGraphNode[],
  edges: readonly KnowledgeGraphEdge[],
): string[] {
  const domains = topNodeIds(nodes, "domain", 5);
  const capabilities = topNodeIds(nodes, "capability", 5);
  const evidence = implementationEvidenceIds(nodes, edges, 5);

  return [
    "## Business-to-code ontology lens",
    "- Read the business outcome first, then business/product domains, capabilities, and implementation evidence.",
    `- business domains: ${domains.length > 0 ? domains.join(", ") : "none yet — ask what product/business boundary this vault represents"}`,
    `- capability outcomes: ${capabilities.length > 0 ? capabilities.join(", ") : "none yet — ask what user workflow, operational decision, or business outcome the system supports"}`,
    `- implementation evidence: ${
      evidence.length > 0
        ? `${evidence.join(", ")} proves or supports capability behavior`
        : "none yet — attach source paths, commands, routes, or APIs only after domain/capability meaning is clear"
    }; do not treat paths, APIs, routes, or commands as the ontology root.`,
  ];
}

export interface AgentBriefingPacket {
  /** The complete briefing string, copied in one go. */
  briefing: string;
  /** Readiness summary — the status and score shown in the button's toast and caption. */
  readiness: AgentReadinessSummary;
  /** Suggested starting nodes (hubs), exposed so the caller can preview or describe them. */
  entrypoints: AgentQueryEntrypoint[];
}

/**
 * Assemble the complete agent onboarding briefing from the vault graph. Every
 * input is derived from existing pure composers, so the same graph always produces
 * the same output.
 */
export function buildAgentBriefingPacket(
  nodes: readonly KnowledgeGraphNode[],
  edges: readonly KnowledgeGraphEdge[],
  tree: Pick<OntologyTreeBuildResult, "orphans">,
): AgentBriefingPacket {
  const readiness = buildAgentReadinessSummary(nodes, edges, tree);
  const entrypoints = selectAgentQueryEntrypoints(nodes, edges, 4);
  const projectEntrypoint = selectAgentProjectEntrypoint(nodes, edges);
  const recipes = buildAgentQueryRecipes(readiness.status, entrypoints, projectEntrypoint);
  const traversalStrategies = buildAgentTraversalStrategies(entrypoints, projectEntrypoint);
  const graphDbQueryPack = buildAgentGraphDbQueryPack(entrypoints);
  const guardrails = buildAgentWriteGuardrails(entrypoints);

  const handoff = buildAgentHandoffPrompt(
    recipes,
    entrypoints,
    projectEntrypoint,
    traversalStrategies,
    graphDbQueryPack,
    guardrails,
  );

  const briefing = [
    ...BRIEFING_INTRO,
    "",
    ...buildBusinessToCodeLens(nodes, edges),
    "",
    "## Mental model & readiness",
    `- census: ${censusLine(nodes)}`,
    `- relations: ${readiness.relationCount} · hubs: ${readiness.hubCount} · avg degree: ${readiness.averageDegree}`,
    `- readiness: ${readiness.status} (score ${readiness.score}/100) — blockers: unknown ${readiness.unknownNodes}, orphans ${readiness.orphanCount}`,
    "",
    handoff,
  ].join("\n");

  return { briefing, readiness, entrypoints };
}
