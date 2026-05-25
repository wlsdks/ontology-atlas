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
  title: string;
  meaningToKeep: string;
  reuseContext: string;
  reviewQuestions: string;
  relationAnchors: string;
  handoff: string;
  topology: string;
  builder: string;
  sourceFallback: string;
  noRelationPreview: string;
  incoming: string;
  outgoing: string;
}

export function buildOntologyReviewBrief({
  node,
  incomingCount,
  outgoingCount,
  relationTypes = [],
  relationPreview = [],
  topologyHref,
  builderHref,
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
    `- Kind: ${node.kind}`,
    `- Review lens: ${lensLabel}`,
    `- Source: ${brief.sourceSlug ?? "No source document"}`,
    `- Relations: ${brief.relationSummary.outgoing} outgoing / ${brief.relationSummary.incoming} incoming`,
    `- Relation types: ${formatRelationTypes(brief.relationTypes)}`,
    `- Review prompt: ${promptLabel}`,
    "",
    `## ${reviewQuestionsLabel}`,
    ...reviewQuestions.map((question) => `- ${question}`),
    "",
    `## ${impactSummaryLabel}`,
    `- ${impactSummaryText}`,
    `- ${impactIncomingLabel}: ${formatImpactRelation(
      brief.impactSummary.firstIncoming,
      impactNoneLabel,
    )}`,
    `- ${impactOutgoingLabel}: ${formatImpactRelation(
      brief.impactSummary.firstOutgoing,
      impactNoneLabel,
    )}`,
    "",
    `## ${relationPreviewLabel}`,
    ...(relationPreview.length > 0
      ? relationPreview.map(formatRelationPreviewRow)
      : [`- ${noRelationPreviewLabel}`]),
    "",
    `- Topology: ${brief.handoffLinks.topology}`,
    ...(brief.handoffLinks.builder
      ? [`- Builder: ${brief.handoffLinks.builder}`]
      : []),
    ...(brief.agentChecks
      ? [
          `- MCP check: ${brief.agentChecks.mcp}`,
          `- CLI check: ${brief.agentChecks.cli}`,
          `- Impact MCP check: ${brief.agentChecks.impactMcp}`,
          `- Impact CLI check: ${brief.agentChecks.impactCli}`,
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
  const relationAnchors =
    brief.relationPreview.length > 0
      ? brief.relationPreview.map((row) => {
          const direction =
            row.direction === "outgoing" ? labels.outgoing : labels.incoming;
          return `- ${direction} ${row.type}: ${row.title} (${row.kind}, ${row.nodeId})`;
        })
      : [`- ${labels.noRelationPreview}`];

  return [
    `# ${labels.title}: ${node.title}`,
    "",
    `- Term: ${node.title}`,
    `- Node: ${node.id}`,
    `- Kind: ${node.kind}`,
    `- Source: ${brief.sourceSlug ?? labels.sourceFallback}`,
    "",
    `## ${labels.meaningToKeep}`,
    `- ${node.summary ?? node.title}`,
    "",
    `## ${labels.reuseContext}`,
    `- ${brief.relationSummary.outgoing} outgoing / ${brief.relationSummary.incoming} incoming relations`,
    `- ${formatRelationTypes(brief.relationTypes)}`,
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
  ].join("\n");
}

export function formatRelationPreviewRow(row: OntologyReviewRelationPreview): string {
  const arrow = row.direction === "outgoing" ? "out" : "in";
  return `- ${arrow} · ${row.type} · ${row.title} (${row.kind}, ${row.nodeId})`;
}

export function formatImpactRelation(
  row: OntologyReviewRelationPreview | null,
  emptyLabel: string,
): string {
  if (!row) return emptyLabel;
  return `${row.type} · ${row.title} (${row.kind}, ${row.nodeId})`;
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
): string {
  if (relationTypes.length === 0) return "none";
  return relationTypes.map((row) => `${row.type} ${row.count}`).join(", ");
}
