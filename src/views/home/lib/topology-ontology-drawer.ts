import { formatQueryOntologyCall } from "@/shared/lib/ontology-query-call";
import {
  buildOntologyReachability,
  computeOntologyDependents,
  IMPACT_EXCLUDED_RELATION_TYPES,
} from "@/shared/lib/ontology-tree";
import type {
  KnowledgeGraphEdge,
  KnowledgeGraphNode,
} from "@/entities/knowledge-graph";

export interface TopologyOntologyDrawerRelation {
  edge: KnowledgeGraphEdge;
  other: KnowledgeGraphNode | null;
  direction: "incoming" | "outgoing";
  provenance: TopologyRelationProvenance;
}

export type TopologyRelationProvenance =
  | "source_backed"
  | "authored"
  | "needs_review";

export interface TopologyOntologyDrawerReach {
  /**
   * 전이 incoming closure — 이 노드를 (직접·간접) 의존으로 가진 노드 수.
   * = "이 노드를 바꾸면 영향받는 노드" = 변경 영향 범위(blast radius).
   * CLI `blast-radius --direction incoming` 와 같은 방향 semantics.
   */
  dependents: number;
  /**
   * 전이 outgoing closure — 이 노드가 (직접·간접) 의존하는 노드 수.
   */
  dependencies: number;
}

export interface TopologyOntologyDrawerModel {
  sourceSlug: string | null;
  /**
   * 이 노드를 소유한 domain 노드(있으면). 비즈니스 영역 context 를 read-only
   * 로 노출 — vault writable 일 땐 domainEdit 인풋이 대신 보인다. incoming
   * 엣지 중 source 가 kind:domain 인 첫 노드(보통 contains 관계).
   */
  ownerDomain: { id: string; title: string } | null;
  incomingCount: number;
  outgoingCount: number;
  relationCounts: Array<{ type: string; count: number }>;
  provenanceCounts: Array<{ provenance: TopologyRelationProvenance; count: number }>;
  previewRelations: TopologyOntologyDrawerRelation[];
  /**
   * 1-hop degree(`incomingCount`/`outgoingCount`)가 과소평가하는 *전이* 영향
   * 범위. graph-DB 의 reachability 질의를 노드 detail 에 바로 노출 — 사람은
   * "이거 바꾸면 N개 영향" 을 한눈에, 에이전트는 brief 로 같은 값을 받는다.
   */
  reach: TopologyOntologyDrawerReach;
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
  kind: string;
  node: string;
  reviewLens: string;
  source: string;
  relations: string;
  reviewPrompt: string;
  outgoingCount: string;
  incomingCount: string;
  relationQualityGate: string;
  relationQualityInterpretation: string;
  relationQualityPreflight: string;
  relationQualityEvidence: string;
  relationQualityNoAnchor: string;
  relationQualityProvenance: string;
  relationProvenanceLabels: Record<TopologyRelationProvenance, string>;
  lens: string;
  review: string;
  reviewQuestions: string;
  impactSummary: string;
  impactSummaryText: string;
  reachTitle: string;
  reachDependents: string;
  reachDependencies: string;
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
  relationTypeLabels: Record<string, string>;
}

export interface TopologyVocabularyReviewFormatLabels {
  term: string;
  slug: string;
  kind: string;
  source: string;
  relationSummary: string;
  outgoingCount: string;
  incomingCount: string;
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
  relationTypeLabels: Record<string, string>;
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
  const provenanceCounts = new Map<TopologyRelationProvenance, number>();

  for (const edge of [...incoming, ...outgoing]) {
    relationTypeCounts.set(edge.type, (relationTypeCounts.get(edge.type) ?? 0) + 1);
    const provenance = classifyTopologyRelationProvenance(edge);
    provenanceCounts.set(provenance, (provenanceCounts.get(provenance) ?? 0) + 1);
  }

  const previewRelations: TopologyOntologyDrawerRelation[] = [
    ...outgoing.map((edge) => ({
      edge,
      other: nodeById.get(edge.to) ?? null,
      direction: "outgoing" as const,
      provenance: classifyTopologyRelationProvenance(edge),
    })),
    ...incoming.map((edge) => ({
      edge,
      other: nodeById.get(edge.from) ?? null,
      direction: "incoming" as const,
      provenance: classifyTopologyRelationProvenance(edge),
    })),
  ].slice(0, Math.max(0, previewLimit));

  // 전이 reach — 기존 reachability 엔진 재사용(새 BFS 0). depth = 노드 수면
  // 사이클·긴 체인 모두 full closure 보장(discovered set 이 중복 차단).
  // limit:1 — summary.reachableNodes 는 limit 과 무관하게 *전체* 카운트라
  // 가시 layer 만 1개로 줄여 할당 최소화.
  // excludeTypes: soft association(related_to/describes)은 의존이 아니라 blast
  // radius 에서 제외 — 안 빼면 related_to 웹이 거의 모든 노드를 연결해 "Affected"
  // 가 노드별 변별력을 잃는다(측정: leaf·hub 모두 ~27 → 제외 시 2 vs 9). iter 27.
  const fullDepth = Math.max(nodes.length, 1);
  const reach: TopologyOntologyDrawerReach = {
    // dependents 는 shared computeOntologyDependents 단일 source — 변경점 diff
    // (Self-Drawing Diff #2)가 같은 함수를 호출해 같은 수를 보장(can't drift).
    dependents: computeOntologyDependents(node.id, nodes, edges),
    dependencies: buildOntologyReachability(node.id, nodes, edges, {
      direction: "outgoing",
      depth: fullDepth,
      limit: 1,
      excludeTypes: IMPACT_EXCLUDED_RELATION_TYPES,
    }).summary.reachableNodes,
  };

  // 소유 domain — incoming 엣지의 source 중 kind:domain 첫 노드. domain 은
  // 보통 자식을 contains 하므로 (domain → node) incoming 에서 찾는다.
  let ownerDomain: { id: string; title: string } | null = null;
  for (const e of incoming) {
    const src = nodeById.get(e.from);
    if (src && src.kind === "domain") {
      ownerDomain = { id: src.id, title: src.title };
      break;
    }
  }

  return {
    sourceSlug: node.evidenceIds[0] ?? null,
    ownerDomain,
    incomingCount: incoming.length,
    outgoingCount: outgoing.length,
    relationCounts: Array.from(relationTypeCounts.entries())
      .map(([type, count]) => ({ type, count }))
      .sort((a, b) => b.count - a.count || a.type.localeCompare(b.type)),
    provenanceCounts: Array.from(provenanceCounts.entries())
      .map(([provenance, count]) => ({ provenance, count }))
      .sort(
        (a, b) =>
          provenanceRank(a.provenance) - provenanceRank(b.provenance) ||
          b.count - a.count,
      ),
    previewRelations,
    reach,
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
  const formatRelationType = (type: string) =>
    labels.relationTypeLabels[type] ?? type;
  const relationTypes =
    model.relationCounts.length > 0
      ? model.relationCounts
          .map((row) => `${formatRelationType(row.type)} ${row.count}`)
          .join(", ")
      : labels.noPreviewRelations;
  const relationProvenance =
    model.provenanceCounts.length > 0
      ? model.provenanceCounts
          .map(
            (row) =>
              `${labels.relationProvenanceLabels[row.provenance]} ${row.count}`,
          )
          .join(", ")
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

          return `- ${direction} ${formatRelationType(
            relation.edge.type,
          )} ${connector} ${otherLabel}`;
        })
      : [`- ${labels.noPreviewRelations}`];
  const relationQualityAnchor = model.previewRelations[0] ?? null;

  const lines = [
    `# ${node.title}`,
    "",
    `- ${labels.kind}: ${node.kind}`,
    `- ${labels.node}: ${node.id}`,
    `- ${labels.reviewLens}: ${labels.lens}`,
    `- ${labels.source}: ${model.sourceSlug ?? labels.sourceFallback}`,
    `- ${labels.relations}: ${labels.outgoingCount} ${model.outgoingCount} / ${labels.incomingCount} ${model.incomingCount}`,
    `- ${labels.relationTypes}: ${relationTypes}`,
    `- ${labels.relationQualityProvenance}: ${relationProvenance}`,
    `- ${labels.reviewPrompt}: ${labels.review}`,
    "",
    `## ${labels.relationQualityGate}`,
    `- ${labels.relationQualityInterpretation}`,
    relationQualityAnchor
      ? `- ${labels.relationQualityPreflight}: ${formatTopologyRelationPreflightMcpCheck(
          relationQualityAnchor.edge,
        )}`
      : `- ${labels.relationQualityPreflight}: ${labels.relationQualityNoAnchor}`,
    relationQualityAnchor
      ? `- ${labels.relationQualityEvidence}: ${formatTopologyRelationExplainMcpCheck(
          relationQualityAnchor.edge,
        )}`
      : `- ${labels.relationQualityEvidence}: ${labels.relationQualityNoAnchor}`,
    "",
    `## ${labels.reviewQuestions}`,
    ...topologyReviewQuestionsForReview(model.collaborator.review, labels).map(
      (question) => `- ${question}`,
    ),
    "",
    `## ${labels.impactSummary}`,
    `- ${labels.impactSummaryText}`,
    // 전이 blast radius — 에이전트가 "이거 바꿔도 안전한가" 판단할 때 1-hop
    // degree 가 아닌 진짜 영향 범위를 보게. drawer(사람)와 같은 model.reach.
    `- ${labels.reachTitle}: ${labels.reachDependents} ${model.reach.dependents}, ${labels.reachDependencies} ${model.reach.dependencies}`,
    `- ${labels.firstIncoming}: ${formatTopologyImpactRelation(
      model.impactSummary.firstIncoming,
      labels.noImpactRelation,
      labels.relationTypeLabels,
    )}`,
    `- ${labels.firstOutgoing}: ${formatTopologyImpactRelation(
      model.impactSummary.firstOutgoing,
      labels.noImpactRelation,
      labels.relationTypeLabels,
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
  const formatRelationType = (type: string) =>
    labels.relationTypeLabels[type] ?? type;
  const relationAnchors =
    model.previewRelations.length > 0
      ? model.previewRelations.map((relation) => {
          const direction =
            relation.direction === "outgoing" ? labels.outgoing : labels.incoming;
          const otherLabel = relation.other
            ? `${relation.other.id} (${relation.other.title})`
            : relation.edge.id;

          return `- ${direction} ${formatRelationType(
            relation.edge.type,
          )}: ${otherLabel}`;
        })
      : [`- ${labels.noPreviewRelations}`];

  return [
    `# ${labels.title}: ${node.title}`,
    "",
    `- ${labels.term}: ${node.title}`,
    `- ${labels.slug}: ${node.id}`,
    `- ${labels.kind}: ${node.kind}`,
    `- ${labels.source}: ${model.sourceSlug ?? labels.sourceFallback}`,
    "",
    `## ${labels.meaningToKeep}`,
    `- ${node.summary ?? node.title}`,
    "",
    `## ${labels.reuseContext}`,
    `- ${labels.relationSummary}: ${labels.outgoingCount} ${model.outgoingCount} / ${labels.incomingCount} ${model.incomingCount}`,
    `- ${
      model.relationCounts
        .map((row) => `${formatRelationType(row.type)} ${row.count}`)
        .join(", ") || labels.noPreviewRelations
    }`,
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
  relationTypeLabels: Record<string, string> = {},
): string {
  if (!relation) return fallback;
  const other = relation.other
    ? `${relation.other.id} (${relation.other.title})`
    : relation.edge.id;
  return `${relationTypeLabels[relation.edge.type] ?? relation.edge.type} · ${other}`;
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
  return `ontology-atlas node ${slug} [vault] --limit 12`;
}

export function formatTopologyNodeImpactCliCheck(slug: string): string {
  return `ontology-atlas blast-radius ${slug} [vault] --depth 2 --direction incoming`;
}

export function formatTopologyNodeImpactMcpCheck(slug: string): string {
  return formatQueryOntologyCall({
    operation: "blast_radius",
    slug,
    depth: 2,
    direction: "incoming",
  });
}

export function formatTopologyRelationPreflightMcpCheck(
  edge: Pick<KnowledgeGraphEdge, "from" | "to" | "type">,
): string {
  return formatQueryOntologyCall({
    operation: "relation_check",
    from: edge.from,
    to: edge.to,
    type: edge.type,
  });
}

export function formatTopologyRelationExplainMcpCheck(
  edge: Pick<KnowledgeGraphEdge, "from" | "to">,
): string {
  return formatQueryOntologyCall({
    operation: "explain_relation",
    from: edge.from,
    to: edge.to,
    direction: "undirected",
    maxHops: 5,
    limit: 10,
  });
}

export function classifyTopologyRelationProvenance(
  edge: Pick<KnowledgeGraphEdge, "evidenceIds" | "lastApprovedBy">,
): TopologyRelationProvenance {
  if (edge.evidenceIds.length > 0) return "source_backed";
  if (edge.lastApprovedBy.trim().length > 0) return "authored";
  return "needs_review";
}

function provenanceRank(provenance: TopologyRelationProvenance): number {
  if (provenance === "source_backed") return 0;
  if (provenance === "authored") return 1;
  return 2;
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
