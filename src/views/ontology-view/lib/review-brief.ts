import type { KnowledgeGraphNode } from "@/entities/knowledge-graph";
import {
  buildBlastRadiusCliCommand,
  buildBlastRadiusMcpCall,
  buildNodeProfileCliCommand,
  buildNodeProfileMcpCall,
} from "./reachability-copy";

export type OntologyReviewLens =
  | "project"
  | "domain"
  | "capability"
  | "element"
  | "node";

export type OntologyReviewPrompt =
  | "define_owner"
  | "explain_usage"
  | "confirm_dependents"
  | "trace_impact";

export type OntologyReviewImpactLevel =
  | "needs_owner"
  | "usage_only"
  | "dependent_only"
  | "bidirectional";

export interface OntologyReviewBrief {
  lens: OntologyReviewLens;
  prompt: OntologyReviewPrompt;
  sourceSlug: string | null;
  relationSummary: {
    incoming: number;
    outgoing: number;
  };
  impactSummary: OntologyReviewImpactSummary;
  relationTypes: Array<{ type: string; count: number }>;
  relationPreview: OntologyReviewRelationPreview[];
  handoffLinks: {
    topology: string;
    builder: string | null;
    query: string;
  };
  agentChecks: {
    mcp: string;
    cli: string;
    impactMcp: string;
    impactCli: string;
  } | null;
}

export interface OntologyReviewImpactSummary {
  level: OntologyReviewImpactLevel;
  incomingCount: number;
  outgoingCount: number;
  firstIncoming: OntologyReviewRelationPreview | null;
  firstOutgoing: OntologyReviewRelationPreview | null;
}

export interface OntologyReviewRelationPreview {
  direction: "incoming" | "outgoing";
  type: string;
  title: string;
  kind: string;
  nodeId: string;
}

export interface OntologyVocabularyReviewLabels {
  term: string;
  node: string;
  kind: string;
  source: string;
  relationSummary: string;
  outgoingCount: string;
  incomingCount: string;
  relationTypeLabels: Record<string, string>;
  title: string;
  meaningToKeep: string;
  reuseContext: string;
  reviewQuestions: string;
  relationAnchors: string;
  handoff: string;
  topology: string;
  builder: string;
  query: string;
  sourceFallback: string;
  noRelationPreview: string;
  incoming: string;
  outgoing: string;
}

export interface OntologyReviewBriefLabels {
  kind: string;
  reviewLens: string;
  source: string;
  sourceFallback: string;
  relations: string;
  outgoingCount: string;
  incomingCount: string;
  relationTypes: string;
  relationTypeLabels: Record<string, string>;
  reviewPrompt: string;
  topology: string;
  builder: string;
  query: string;
  mcpCheck: string;
  cliCheck: string;
  impactMcpCheck: string;
  impactCliCheck: string;
  incoming: string;
  outgoing: string;
}

const DEFAULT_REVIEW_BRIEF_LABELS: OntologyReviewBriefLabels = {
  kind: "Kind",
  reviewLens: "Review lens",
  source: "Source",
  sourceFallback: "No source document",
  relations: "Relations",
  outgoingCount: "{count} outgoing",
  incomingCount: "{count} incoming",
  relationTypes: "Relation types",
  relationTypeLabels: {},
  reviewPrompt: "Review prompt",
  topology: "Topology focus",
  builder: "Builder",
  query: "Query cockpit",
  mcpCheck: "MCP check",
  cliCheck: "CLI check",
  impactMcpCheck: "Impact MCP check",
  impactCliCheck: "Impact CLI check",
  incoming: "in",
  outgoing: "out",
};

export function buildOntologyReviewBrief({
  node,
  incomingCount,
  outgoingCount,
  relationTypes = [],
  relationPreview = [],
  topologyHref,
  builderHref,
  queryHref,
  agentCheckSlug,
  agentCheckLimit = 8,
  impactDepth = 2,
}: {
  node: KnowledgeGraphNode;
  incomingCount: number;
  outgoingCount: number;
  relationTypes?: Array<{ type: string; count: number }>;
  relationPreview?: OntologyReviewRelationPreview[];
  topologyHref?: string;
  builderHref?: string | null;
  queryHref?: string;
  agentCheckSlug?: string | null;
  agentCheckLimit?: number;
  impactDepth?: 1 | 2 | 3;
}): OntologyReviewBrief {
  const lens =
    node.kind === "project" ||
    node.kind === "domain" ||
    node.kind === "capability" ||
    node.kind === "element"
      ? node.kind
      : "node";
  const total = incomingCount + outgoingCount;
  const prompt =
    total === 0
      ? "define_owner"
      : incomingCount > 0 && outgoingCount > 0
        ? "trace_impact"
        : outgoingCount > 0
          ? "explain_usage"
          : "confirm_dependents";
  const impactLevel =
    total === 0
      ? "needs_owner"
      : incomingCount > 0 && outgoingCount > 0
        ? "bidirectional"
        : outgoingCount > 0
          ? "usage_only"
          : "dependent_only";
  const preview = [...relationPreview];

  return {
    lens,
    prompt,
    sourceSlug: node.evidenceIds[0]?.replace(/^ontology\//, "") ?? null,
    relationSummary: {
      incoming: incomingCount,
      outgoing: outgoingCount,
    },
    impactSummary: {
      level: impactLevel,
      incomingCount,
      outgoingCount,
      firstIncoming:
        preview.find((row) => row.direction === "incoming") ?? null,
      firstOutgoing:
        preview.find((row) => row.direction === "outgoing") ?? null,
    },
    relationTypes: [...relationTypes].sort(
      (a, b) => b.count - a.count || a.type.localeCompare(b.type),
    ),
    relationPreview: preview,
    handoffLinks: {
      topology: topologyHref ?? buildOntologyReviewTopologyHref(node.id),
      builder: builderHref ?? null,
      query: queryHref ?? "/ontology/insights/",
    },
    agentChecks: agentCheckSlug
      ? {
          mcp: buildNodeProfileMcpCall({
            slug: agentCheckSlug,
            limit: agentCheckLimit,
          }),
          cli: buildNodeProfileCliCommand({
            slug: agentCheckSlug,
            limit: agentCheckLimit,
          }),
          impactMcp: buildBlastRadiusMcpCall({
            slug: agentCheckSlug,
            depth: impactDepth,
            direction: "incoming",
          }),
          impactCli: buildBlastRadiusCliCommand({
            slug: agentCheckSlug,
            depth: impactDepth,
            direction: "incoming",
          }),
        }
      : null,
  };
}

export function formatOntologyReviewBrief({
  node,
  brief,
  labels = DEFAULT_REVIEW_BRIEF_LABELS,
  lensLabel,
  promptLabel,
  reviewQuestionsLabel,
  reviewQuestions,
  impactSummaryLabel,
  impactSummaryText,
  impactIncomingLabel,
  impactOutgoingLabel,
  impactNoneLabel,
  relationPreviewLabel,
  relationPreview,
  noRelationPreviewLabel,
}: {
  node: KnowledgeGraphNode;
  brief: OntologyReviewBrief;
  labels?: OntologyReviewBriefLabels;
  lensLabel: string;
  promptLabel: string;
  reviewQuestionsLabel: string;
  reviewQuestions: readonly string[];
  impactSummaryLabel: string;
  impactSummaryText: string;
  impactIncomingLabel: string;
  impactOutgoingLabel: string;
  impactNoneLabel: string;
  relationPreviewLabel: string;
  relationPreview: readonly OntologyReviewRelationPreview[];
  noRelationPreviewLabel: string;
}): string {
  return [
    `# ${node.title}`,
    "",
    `- ${labels.kind}: ${node.kind}`,
    `- ${labels.reviewLens}: ${lensLabel}`,
    `- ${labels.source}: ${brief.sourceSlug ?? labels.sourceFallback}`,
    `- ${labels.relations}: ${formatRelationCount(
      labels.outgoingCount,
      brief.relationSummary.outgoing,
    )} / ${formatRelationCount(
      labels.incomingCount,
      brief.relationSummary.incoming,
    )}`,
    `- ${labels.relationTypes}: ${formatRelationTypes(
      brief.relationTypes,
      labels.relationTypeLabels,
    )}`,
    `- ${labels.reviewPrompt}: ${promptLabel}`,
    "",
    `## ${reviewQuestionsLabel}`,
    ...reviewQuestions.map((question) => `- ${question}`),
    "",
    `## ${impactSummaryLabel}`,
    `- ${impactSummaryText}`,
    `- ${impactIncomingLabel}: ${formatImpactRelation(
      brief.impactSummary.firstIncoming,
      impactNoneLabel,
      labels.relationTypeLabels,
    )}`,
    `- ${impactOutgoingLabel}: ${formatImpactRelation(
      brief.impactSummary.firstOutgoing,
      impactNoneLabel,
      labels.relationTypeLabels,
    )}`,
    "",
    `## ${relationPreviewLabel}`,
    ...(relationPreview.length > 0
      ? relationPreview.map((row) =>
          formatRelationPreviewRow(row, {
            incoming: labels.incoming,
            outgoing: labels.outgoing,
            relationTypeLabels: labels.relationTypeLabels,
          }),
        )
      : [`- ${noRelationPreviewLabel}`]),
    "",
    `- ${labels.topology}: ${brief.handoffLinks.topology}`,
    ...(brief.handoffLinks.builder
      ? [`- ${labels.builder}: ${brief.handoffLinks.builder}`]
      : []),
    `- ${labels.query}: ${brief.handoffLinks.query}`,
    ...(brief.agentChecks
      ? [
          `- ${labels.mcpCheck}: ${brief.agentChecks.mcp}`,
          `- ${labels.cliCheck}: ${brief.agentChecks.cli}`,
          `- ${labels.impactMcpCheck}: ${brief.agentChecks.impactMcp}`,
          `- ${labels.impactCliCheck}: ${brief.agentChecks.impactCli}`,
        ]
      : []),
  ].join("\n");
}

export function formatOntologyVocabularyReview({
  node,
  brief,
  reviewQuestions,
  labels,
}: {
  node: KnowledgeGraphNode;
  brief: OntologyReviewBrief;
  reviewQuestions: readonly string[];
  labels: OntologyVocabularyReviewLabels;
}): string {
  const formatRelationType = (type: string) =>
    labels.relationTypeLabels[type] ?? type;
  const relationAnchors =
    brief.relationPreview.length > 0
      ? brief.relationPreview.map((row) => {
          const direction =
            row.direction === "outgoing" ? labels.outgoing : labels.incoming;
          return `- ${direction} ${formatRelationType(row.type)}: ${row.title} (${row.kind}, ${row.nodeId})`;
        })
      : [`- ${labels.noRelationPreview}`];

  return [
    `# ${labels.title}: ${node.title}`,
    "",
    `- ${labels.term}: ${node.title}`,
    `- ${labels.node}: ${node.id}`,
    `- ${labels.kind}: ${node.kind}`,
    `- ${labels.source}: ${brief.sourceSlug ?? labels.sourceFallback}`,
    "",
    `## ${labels.meaningToKeep}`,
    `- ${node.summary ?? node.title}`,
    "",
    `## ${labels.reuseContext}`,
    `- ${labels.relationSummary}: ${labels.outgoingCount} ${brief.relationSummary.outgoing} / ${labels.incomingCount} ${brief.relationSummary.incoming}`,
    `- ${formatRelationTypes(brief.relationTypes, labels.relationTypeLabels)}`,
    "",
    `## ${labels.reviewQuestions}`,
    ...reviewQuestions.map((question) => `- ${question}`),
    "",
    `## ${labels.relationAnchors}`,
    ...relationAnchors,
    "",
    `## ${labels.handoff}`,
    `- ${labels.topology}: ${brief.handoffLinks.topology}`,
    ...(brief.handoffLinks.builder
      ? [`- ${labels.builder}: ${brief.handoffLinks.builder}`]
      : []),
    `- ${labels.query}: ${brief.handoffLinks.query}`,
  ].join("\n");
}

export function formatRelationPreviewRow(
  row: OntologyReviewRelationPreview,
  labels: {
    incoming: string;
    outgoing: string;
    relationTypeLabels?: Record<string, string>;
  } = {
    incoming: DEFAULT_REVIEW_BRIEF_LABELS.incoming,
    outgoing: DEFAULT_REVIEW_BRIEF_LABELS.outgoing,
    relationTypeLabels: DEFAULT_REVIEW_BRIEF_LABELS.relationTypeLabels,
  },
): string {
  const direction = row.direction === "outgoing" ? labels.outgoing : labels.incoming;
  const type = labels.relationTypeLabels?.[row.type] ?? row.type;
  return `- ${direction} · ${type} · ${row.title} (${row.kind}, ${row.nodeId})`;
}

export function formatImpactRelation(
  row: OntologyReviewRelationPreview | null,
  emptyLabel: string,
  relationTypeLabels: Record<string, string> = {},
): string {
  if (!row) return emptyLabel;
  return `${relationTypeLabels[row.type] ?? row.type} · ${row.title} (${row.kind}, ${row.nodeId})`;
}

export function ontologyReviewQuestionsForPrompt(
  prompt: OntologyReviewPrompt,
  labels: Record<OntologyReviewPrompt, readonly string[]>,
): readonly string[] {
  return labels[prompt];
}

export function buildOntologyReviewTopologyHref(nodeId: string): string {
  return `/topology/?mode=focus&p=${encodeURIComponent(nodeId)}`;
}

function formatRelationTypes(
  relationTypes: readonly { type: string; count: number }[],
  relationTypeLabels: Record<string, string> = {},
): string {
  if (relationTypes.length === 0) return "none";
  return relationTypes
    .map((row) => `${relationTypeLabels[row.type] ?? row.type} ${row.count}`)
    .join(", ");
}

function formatRelationCount(label: string, count: number): string {
  return label.includes("{count}") ? label.replace("{count}", String(count)) : `${label} ${count}`;
}
