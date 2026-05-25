import type {
  KnowledgeGraphEdge,
  KnowledgeGraphNode,
} from "@/entities/knowledge-graph";

export interface TopologyOntologyDrawerRelation {
  edge: KnowledgeGraphEdge;
  other: KnowledgeGraphNode | null;
  direction: "incoming" | "outgoing";
}

export interface TopologyOntologyDrawerModel {
  sourceSlug: string | null;
  incomingCount: number;
  outgoingCount: number;
  relationCounts: Array<{ type: string; count: number }>;
  previewRelations: TopologyOntologyDrawerRelation[];
  impactSummary: TopologyOntologyDrawerImpactSummary;
  collaborator: {
    lens: "project" | "domain" | "capability" | "element" | "node";
    review: "define_owner" | "explain_usage" | "confirm_dependents" | "trace_impact";
    chips: Array<"source" | "impact" | "vocabulary">;
  };
}

export type TopologyOntologyDrawerImpactLevel =
  | "needs_owner"
  | "usage_only"
  | "dependent_only"
  | "bidirectional";

export interface TopologyOntologyDrawerImpactSummary {
  level: TopologyOntologyDrawerImpactLevel;
  firstIncoming: TopologyOntologyDrawerRelation | null;
  firstOutgoing: TopologyOntologyDrawerRelation | null;
}

export interface TopologyCollaboratorBriefFormatLabels {
  lens: string;
  review: string;
  reviewQuestions: string;
  impactSummary: string;
  impactSummaryText: string;
  firstIncoming: string;
  firstOutgoing: string;
  noImpactRelation: string;
  defineOwnerQuestions: readonly string[];
  explainUsageQuestions: readonly string[];
  confirmDependentsQuestions: readonly string[];
  traceImpactQuestions: readonly string[];
  sourceFallback: string;
  relationTypes: string;
  previewRelations: string;
  noPreviewRelations: string;
  handoff: string;
  topology: string;
  ontology: string;
  builder: string;
  agentCheck: string;
  mcpCheck: string;
  impactCheck: string;
  mcpImpactCheck: string;
  syncGate: string;
  incoming: string;
  outgoing: string;
}

export interface TopologyVocabularyReviewFormatLabels {
  title: string;
  meaningToKeep: string;
  reuseContext: string;
  reviewQuestions: string;
  relationAnchors: string;
  noPreviewRelations: string;
  sourceFallback: string;
  defineOwnerQuestions: readonly string[];
  explainUsageQuestions: readonly string[];
  confirmDependentsQuestions: readonly string[];
  traceImpactQuestions: readonly string[];
  incoming: string;
  outgoing: string;
}

export interface TopologyCollaboratorHandoffLinks {
  topology: string;
  ontology: string;
  builder: string;
  agentCheck: string;
  mcpCheck: string;
  impactCheck: string;
  mcpImpactCheck: string;
  syncGate: string;
}

export function buildTopologyOntologyDrawerModel(
  node: KnowledgeGraphNode,
  nodes: readonly KnowledgeGraphNode[],
  edges: readonly KnowledgeGraphEdge[],
  previewLimit = 5,
): TopologyOntologyDrawerModel {
  const nodeById = new Map(nodes.map((candidate) => [candidate.id, candidate]));
  const incoming = edges.filter((edge) => edge.to === node.id);
  const outgoing = edges.filter((edge) => edge.from === node.id);
  const relationTypeCounts = new Map<string, number>();

  for (const edge of [...incoming, ...outgoing]) {
    relationTypeCounts.set(edge.type, (relationTypeCounts.get(edge.type) ?? 0) + 1);
  }

  const previewRelations: TopologyOntologyDrawerRelation[] = [
    ...outgoing.map((edge) => ({
      edge,
      other: nodeById.get(edge.to) ?? null,
      direction: "outgoing" as const,
    })),
    ...incoming.map((edge) => ({
      edge,
      other: nodeById.get(edge.from) ?? null,
      direction: "incoming" as const,
    })),
  ].slice(0, Math.max(0, previewLimit));

  return {
    sourceSlug: node.evidenceIds[0] ?? null,
    incomingCount: incoming.length,
    outgoingCount: outgoing.length,
    relationCounts: Array.from(relationTypeCounts.entries())
      .map(([type, count]) => ({ type, count }))
      .sort((a, b) => b.count - a.count || a.type.localeCompare(b.type)),
    previewRelations,
    impactSummary: {
      level: buildImpactLevel(incoming.length, outgoing.length),
      firstIncoming:
        previewRelations.find((relation) => relation.direction === "incoming") ??
        null,
      firstOutgoing:
        previewRelations.find((relation) => relation.direction === "outgoing") ??
        null,
    },
    collaborator: buildCollaboratorBrief(node, incoming.length, outgoing.length),
  };
}

export function formatTopologyCollaboratorBrief({
  node,
  model,
  labels,
  handoff,
}: {
  node: KnowledgeGraphNode;
  model: TopologyOntologyDrawerModel;
  labels: TopologyCollaboratorBriefFormatLabels;
  handoff?: TopologyCollaboratorHandoffLinks | null;
}): string {
  const relationTypes =
    model.relationCounts.length > 0
      ? model.relationCounts.map((row) => `${row.type} ${row.count}`).join(", ")
      : labels.noPreviewRelations;
  const previewRelations =
    model.previewRelations.length > 0
      ? model.previewRelations.map((relation) => {
          const direction =
            relation.direction === "outgoing" ? labels.outgoing : labels.incoming;
          const connector = relation.direction === "outgoing" ? "->" : "<-";
          const otherLabel = relation.other
            ? `${relation.other.id} (${relation.other.title})`
            : relation.edge.id;

          return `- ${direction} ${relation.edge.type} ${connector} ${otherLabel}`;
        })
      : [`- ${labels.noPreviewRelations}`];

  const lines = [
    `# ${node.title}`,
    "",
    `- Kind: ${node.kind}`,
    `- Node: ${node.id}`,
    `- Review lens: ${labels.lens}`,
    `- Source: ${model.sourceSlug ?? labels.sourceFallback}`,
    `- Relations: ${model.outgoingCount} outgoing / ${model.incomingCount} incoming`,
    `- ${labels.relationTypes}: ${relationTypes}`,
    `- Review prompt: ${labels.review}`,
    "",
    `## ${labels.reviewQuestions}`,
    ...topologyReviewQuestionsForReview(model.collaborator.review, labels).map(
      (question) => `- ${question}`,
    ),
    "",
    `## ${labels.impactSummary}`,
    `- ${labels.impactSummaryText}`,
    `- ${labels.firstIncoming}: ${formatTopologyImpactRelation(
      model.impactSummary.firstIncoming,
      labels.noImpactRelation,
    )}`,
    `- ${labels.firstOutgoing}: ${formatTopologyImpactRelation(
      model.impactSummary.firstOutgoing,
      labels.noImpactRelation,
    )}`,
    "",
    `## ${labels.previewRelations}`,
    ...previewRelations,
  ];

  if (handoff) {
    lines.push(
      "",
      `## ${labels.handoff}`,
      `- ${labels.topology}: ${handoff.topology}`,
      `- ${labels.ontology}: ${handoff.ontology}`,
      `- ${labels.builder}: ${handoff.builder}`,
      `- ${labels.agentCheck}: ${handoff.agentCheck}`,
      `- ${labels.mcpCheck}: ${handoff.mcpCheck}`,
      `- ${labels.impactCheck}: ${handoff.impactCheck}`,
      `- ${labels.mcpImpactCheck}: ${handoff.mcpImpactCheck}`,
      ...formatTopologyHandoffSyncGate(labels.syncGate, handoff.syncGate),
    );
  }

  return lines.join("\n");
}

function formatTopologyHandoffSyncGate(label: string, syncGate: string): string[] {
  if (!syncGate.includes("\n")) {
    return [`- ${label}: ${syncGate}`];
  }

  return [
    `- ${label}:`,
    ...syncGate.split("\n").map((line) => (line ? `  ${line}` : "")),
  ];
}

export function formatTopologyVocabularyReview({
  node,
  model,
  labels,
}: {
  node: KnowledgeGraphNode;
  model: TopologyOntologyDrawerModel;
  labels: TopologyVocabularyReviewFormatLabels;
}): string {
  const relationAnchors =
    model.previewRelations.length > 0
      ? model.previewRelations.map((relation) => {
          const direction =
            relation.direction === "outgoing" ? labels.outgoing : labels.incoming;
          const otherLabel = relation.other
            ? `${relation.other.id} (${relation.other.title})`
            : relation.edge.id;

          return `- ${direction} ${relation.edge.type}: ${otherLabel}`;
        })
      : [`- ${labels.noPreviewRelations}`];

  return [
    `# ${labels.title}: ${node.title}`,
    "",
    `- Term: ${node.title}`,
    `- Slug: ${node.id}`,
    `- Kind: ${node.kind}`,
    `- Source: ${model.sourceSlug ?? labels.sourceFallback}`,
    "",
    `## ${labels.meaningToKeep}`,
    `- ${node.summary ?? node.title}`,
    "",
    `## ${labels.reuseContext}`,
    `- ${model.outgoingCount} outgoing / ${model.incomingCount} incoming relations`,
    `- ${model.relationCounts.map((row) => `${row.type} ${row.count}`).join(", ") || labels.noPreviewRelations}`,
    "",
    `## ${labels.reviewQuestions}`,
    ...topologyReviewQuestionsForReview(model.collaborator.review, labels).map(
      (question) => `- ${question}`,
    ),
    "",
    `## ${labels.relationAnchors}`,
    ...relationAnchors,
  ].join("\n");
}

export function formatTopologyImpactRelation(
  relation: TopologyOntologyDrawerRelation | null,
  fallback: string,
): string {
  if (!relation) return fallback;
  const other = relation.other
    ? `${relation.other.id} (${relation.other.title})`
    : relation.edge.id;
  return `${relation.edge.type} · ${other}`;
}

export function formatTopologyNodeMcpCheck(slug: string): string {
  return formatQueryOntologyCall({
    operation: "node_profile",
    slug,
    depth: 2,
    limit: 12,
  });
}

export function formatTopologyNodeCliCheck(slug: string): string {
  return `oh-my-ontology node ${slug} [vault] --limit 12`;
}

export function formatTopologyNodeImpactCliCheck(slug: string): string {
  return `oh-my-ontology blast-radius ${slug} [vault] --depth 2 --direction incoming`;
}

export function formatTopologyNodeImpactMcpCheck(slug: string): string {
  return formatQueryOntologyCall({
    operation: "blast_radius",
    slug,
    depth: 2,
    direction: "incoming",
  });
}

function formatQueryOntologyCall(payload: Record<string, unknown>): string {
  return `query_ontology(${JSON.stringify(payload)})`;
}

export function topologyReviewQuestionsForReview(
  review: TopologyOntologyDrawerModel["collaborator"]["review"],
  labels: Pick<
    TopologyCollaboratorBriefFormatLabels,
    | "defineOwnerQuestions"
    | "explainUsageQuestions"
    | "confirmDependentsQuestions"
    | "traceImpactQuestions"
  >,
): readonly string[] {
  if (review === "trace_impact") return labels.traceImpactQuestions;
  if (review === "confirm_dependents") return labels.confirmDependentsQuestions;
  if (review === "explain_usage") return labels.explainUsageQuestions;
  return labels.defineOwnerQuestions;
}

function buildCollaboratorBrief(
  node: KnowledgeGraphNode,
  incomingCount: number,
  outgoingCount: number,
): TopologyOntologyDrawerModel["collaborator"] {
  const lens =
    node.kind === "project" ||
    node.kind === "domain" ||
    node.kind === "capability" ||
    node.kind === "element"
      ? node.kind
      : "node";
  const total = incomingCount + outgoingCount;
  const review =
    total === 0
      ? "define_owner"
      : incomingCount > 0 && outgoingCount > 0
        ? "trace_impact"
        : outgoingCount > 0
          ? "explain_usage"
          : "confirm_dependents";

  return {
    lens,
    review,
    chips: [
      node.evidenceIds.length > 0 ? "source" : null,
      total > 0 ? "impact" : null,
      lens === "domain" || lens === "capability" ? "vocabulary" : null,
    ].filter((chip): chip is "source" | "impact" | "vocabulary" => chip !== null),
  };
}

function buildImpactLevel(
  incomingCount: number,
  outgoingCount: number,
): TopologyOntologyDrawerImpactLevel {
  const total = incomingCount + outgoingCount;
  if (total === 0) return "needs_owner";
  if (incomingCount > 0 && outgoingCount > 0) return "bidirectional";
  if (outgoingCount > 0) return "usage_only";
  return "dependent_only";
}
