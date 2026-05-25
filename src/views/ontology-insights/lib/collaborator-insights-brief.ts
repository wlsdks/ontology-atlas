export interface InsightsBriefHub {
  id?: string;
  title: string;
  kind: string;
  degree: number;
  ontologyHref?: string;
  topologyHref?: string;
  builderHref?: string;
}

export interface InsightsOpenQuestion {
  id: string;
  title: string;
  kind: string;
  ontologyHref?: string;
  topologyHref?: string;
  builderHref?: string;
}

export interface InsightsImpactHandoff {
  fromDomain: string;
  toDomain: string;
  count: number;
  topologyPathHref?: string;
  example?: {
    from: string;
    type: string;
    to: string;
  };
}

export interface BuildInsightsCollaboratorBriefInput {
  nodeCount: number;
  relationCount: number;
  domainCount: number;
  crossDomainEdgeCount: number;
  orphanCount: number;
  impactHandoffs?: readonly InsightsImpactHandoff[];
  openQuestions?: readonly InsightsOpenQuestion[];
  topHubs: readonly InsightsBriefHub[];
}

export type InsightsCollaboratorReviewFocus =
  | "align_vocabulary"
  | "trace_impact"
  | "resolve_orphans";

export interface InsightsCollaboratorBrief {
  decisionLane: {
    owner: string;
    expected: string;
    nextStep: string;
  };
  decisionHandoff?: {
    href: string;
    surface: "ontology" | "topology" | "builder" | "path";
    title: string;
  };
  impactHandoffs: InsightsImpactHandoff[];
  openQuestions: InsightsOpenQuestion[];
  reviewFocus: InsightsCollaboratorReviewFocus;
  topHubs: InsightsBriefHub[];
  topHubTitles: string[];
  summaryMetrics: Array<{
    key: "nodes" | "relations" | "domains" | "crossDomain" | "orphans";
    value: number;
  }>;
}

export interface FormatInsightsCollaboratorBriefLabels {
  title: string;
  summary: string;
  nodes: string;
  relations: string;
  domains: string;
  crossDomain: string;
  orphans: string;
  topHubs: string;
  reviewVocabulary: string;
  vocabularyTerm: string;
  vocabularyWhy: string;
  vocabularyReuse: string;
  vocabularyReuseAction: string;
  reviewFocus: string;
  focusAlignVocabulary: string;
  focusTraceImpact: string;
  focusResolveOrphans: string;
  decisionLane: string;
  decisionOwner: string;
  decisionExpected: string;
  decisionNextStep: string;
  decisionGraphHandoff: string;
  decisionAlignOwner: string;
  decisionAlignExpected: string;
  decisionAlignNextStep: string;
  decisionImpactOwner: string;
  decisionImpactExpected: string;
  decisionImpactNextStep: string;
  decisionOrphanOwner: string;
  decisionOrphanExpected: string;
  decisionOrphanNextStep: string;
  reviewQuestions: string;
  alignVocabularyQuestions: readonly string[];
  traceImpactQuestions: readonly string[];
  resolveOrphansQuestions: readonly string[];
  noHubs: string;
  hubHandoff: string;
  impactHandoff: string;
  impactHandoffExample: string;
  impactHandoffPath: string;
  openQuestionHandoff: string;
  ontology: string;
  builder: string;
  handoff: string;
  insights: string;
  topology: string;
  agentCheck: string;
  agentCliCheck: string;
  agentMcpCheck: string;
  impactCliCheck: string;
  impactMcpCheck: string;
}

export interface InsightsCollaboratorHandoff {
  insightsUrl: string;
  topologyUrl: string;
  agentCheckCommand: string;
  agentMcpCheckPayload?: string;
  impactCliCheckCommand?: string;
  impactMcpCheckPayload?: string;
}

export function buildInsightsCollaboratorBrief({
  crossDomainEdgeCount,
  domainCount,
  impactHandoffs = [],
  nodeCount,
  orphanCount,
  openQuestions = [],
  relationCount,
  topHubs,
}: BuildInsightsCollaboratorBriefInput): InsightsCollaboratorBrief {
  const reviewFocus = resolveReviewFocus({ crossDomainEdgeCount, orphanCount });
  const visibleImpactHandoffs = impactHandoffs.slice(0, 3).map((handoff) => ({ ...handoff }));
  const visibleOpenQuestions = openQuestions.slice(0, 3).map((question) => ({ ...question }));
  const visibleTopHubs = topHubs.slice(0, 3).map((hub) => ({ ...hub }));
  return {
    decisionLane: decisionLaneForFocus(reviewFocus),
    decisionHandoff: decisionHandoffForFocus({
      focus: reviewFocus,
      impactHandoffs: visibleImpactHandoffs,
      openQuestions: visibleOpenQuestions,
      topHubs: visibleTopHubs,
    }),
    impactHandoffs: visibleImpactHandoffs,
    openQuestions: visibleOpenQuestions,
    reviewFocus,
    topHubs: visibleTopHubs,
    topHubTitles: visibleTopHubs.map((hub) => hub.title),
    summaryMetrics: [
      { key: "nodes", value: nodeCount },
      { key: "relations", value: relationCount },
      { key: "domains", value: domainCount },
      { key: "crossDomain", value: crossDomainEdgeCount },
      { key: "orphans", value: orphanCount },
    ],
  };
}

export function formatInsightsCollaboratorBrief({
  brief,
  handoff,
  labels,
}: {
  brief: InsightsCollaboratorBrief;
  handoff?: InsightsCollaboratorHandoff | null;
  labels: FormatInsightsCollaboratorBriefLabels;
}): string {
  const metricLabelByKey = {
    nodes: labels.nodes,
    relations: labels.relations,
    domains: labels.domains,
    crossDomain: labels.crossDomain,
    orphans: labels.orphans,
  } satisfies Record<string, string>;

  const metrics = brief.summaryMetrics
    .map((metric) => `- ${metricLabelByKey[metric.key]}: ${metric.value}`)
    .join("\n");
  const hubs =
    brief.topHubs.length > 0
      ? brief.topHubs.map(formatHubSummaryLine).join("\n")
      : `- ${labels.noHubs}`;
  const hubHandoffRows = brief.topHubs
    .filter((hub) => hub.ontologyHref || hub.topologyHref || hub.builderHref)
    .map((hub) => formatHubHandoffLine(hub, labels));
  const vocabularyRows = brief.topHubs.map((hub) =>
    formatVocabularyReviewLine(hub, labels),
  );
  const impactHandoffRows = brief.impactHandoffs.map((handoff) =>
    formatImpactHandoffLine(handoff, labels),
  );
  const openQuestionHandoffRows = brief.openQuestions
    .filter((question) => question.ontologyHref || question.topologyHref || question.builderHref)
    .map((question) => formatOpenQuestionHandoffLine(question, labels));

  const lines = [
    `# ${labels.title}`,
    "",
    labels.summary,
    "",
    "## Metrics",
    metrics,
    "",
    `## ${labels.topHubs}`,
    hubs,
    "",
    `## ${labels.reviewVocabulary}`,
    vocabularyRows.length > 0 ? vocabularyRows.join("\n") : `- ${labels.noHubs}`,
    "",
    `## ${labels.reviewFocus}`,
    reviewFocusLabel(brief.reviewFocus, labels),
    "",
    `## ${labels.decisionLane}`,
    `- ${labels.decisionOwner}: ${decisionLaneLabel(brief.reviewFocus, labels, "owner")}`,
    `- ${labels.decisionExpected}: ${decisionLaneLabel(brief.reviewFocus, labels, "expected")}`,
    `- ${labels.decisionNextStep}: ${decisionLaneLabel(brief.reviewFocus, labels, "nextStep")}`,
    ...(brief.decisionHandoff
      ? [
          `- ${labels.decisionGraphHandoff}: ${formatDecisionHandoffLabel(
            brief.decisionHandoff,
            labels,
          )}: ${brief.decisionHandoff.href}`,
        ]
      : []),
    "",
    `## ${labels.reviewQuestions}`,
    reviewQuestionsForFocus(brief.reviewFocus, labels)
      .map((question) => `- ${question}`)
      .join("\n"),
  ];

  if (hubHandoffRows.length > 0) {
    lines.push("", `## ${labels.hubHandoff}`, hubHandoffRows.join("\n"));
  }

  if (impactHandoffRows.length > 0) {
    lines.push("", `## ${labels.impactHandoff}`, impactHandoffRows.join("\n"));
  }

  if (openQuestionHandoffRows.length > 0) {
    lines.push(
      "",
      `## ${labels.openQuestionHandoff}`,
      openQuestionHandoffRows.join("\n"),
    );
  }

  if (handoff) {
    lines.push(
      "",
      `## ${labels.handoff}`,
      `- ${labels.insights}: ${handoff.insightsUrl}`,
      `- ${labels.topology}: ${handoff.topologyUrl}`,
      `- ${labels.agentCheck}: ${handoff.agentCheckCommand}`,
      `- ${labels.agentCliCheck}: ${handoff.agentCheckCommand}`,
    );
    if (handoff.agentMcpCheckPayload) {
      lines.push(`- ${labels.agentMcpCheck}: ${handoff.agentMcpCheckPayload}`);
    }
    if (handoff.impactCliCheckCommand) {
      lines.push(`- ${labels.impactCliCheck}: ${handoff.impactCliCheckCommand}`);
    }
    if (handoff.impactMcpCheckPayload) {
      lines.push(`- ${labels.impactMcpCheck}: ${handoff.impactMcpCheckPayload}`);
    }
  }

  return lines.join("\n");
}

export function reviewQuestionsForFocus(
  focus: InsightsCollaboratorReviewFocus,
  labels: Pick<
    FormatInsightsCollaboratorBriefLabels,
    | "alignVocabularyQuestions"
    | "traceImpactQuestions"
    | "resolveOrphansQuestions"
  >,
): readonly string[] {
  if (focus === "resolve_orphans") return labels.resolveOrphansQuestions;
  if (focus === "trace_impact") return labels.traceImpactQuestions;
  return labels.alignVocabularyQuestions;
}

function resolveReviewFocus({
  crossDomainEdgeCount,
  orphanCount,
}: {
  crossDomainEdgeCount: number;
  orphanCount: number;
}): InsightsCollaboratorReviewFocus {
  if (orphanCount > 0) return "resolve_orphans";
  if (crossDomainEdgeCount > 0) return "trace_impact";
  return "align_vocabulary";
}

function reviewFocusLabel(
  focus: InsightsCollaboratorReviewFocus,
  labels: FormatInsightsCollaboratorBriefLabels,
): string {
  if (focus === "resolve_orphans") return labels.focusResolveOrphans;
  if (focus === "trace_impact") return labels.focusTraceImpact;
  return labels.focusAlignVocabulary;
}

function decisionLaneForFocus(
  focus: InsightsCollaboratorReviewFocus,
): InsightsCollaboratorBrief["decisionLane"] {
  if (focus === "resolve_orphans") {
    return {
      owner: "domain_owner",
      expected: "assign_container_or_merge",
      nextStep: "open_builder_or_health_handoff",
    };
  }
  if (focus === "trace_impact") {
    return {
      owner: "product_domain_owners",
      expected: "confirm_domains_and_boundaries",
      nextStep: "open_topology_path_and_domain_matrix",
    };
  }
  return {
    owner: "planning_marketing_domain",
    expected: "approve_reused_terms",
    nextStep: "copy_hub_handoffs",
  };
}

function decisionHandoffForFocus({
  focus,
  impactHandoffs,
  openQuestions,
  topHubs,
}: {
  focus: InsightsCollaboratorReviewFocus;
  impactHandoffs: readonly InsightsImpactHandoff[];
  openQuestions: readonly InsightsOpenQuestion[];
  topHubs: readonly InsightsBriefHub[];
}): InsightsCollaboratorBrief["decisionHandoff"] {
  if (focus === "resolve_orphans") {
    const question = openQuestions.find(
      (candidate) =>
        candidate.builderHref || candidate.topologyHref || candidate.ontologyHref,
    );
    if (!question) return undefined;
    if (question.builderHref) {
      return { href: question.builderHref, surface: "builder", title: question.title };
    }
    if (question.topologyHref) {
      return { href: question.topologyHref, surface: "topology", title: question.title };
    }
    if (question.ontologyHref) {
      return { href: question.ontologyHref, surface: "ontology", title: question.title };
    }
    return undefined;
  }

  if (focus === "trace_impact") {
    const impact = impactHandoffs.find((candidate) => candidate.topologyPathHref);
    if (!impact?.topologyPathHref) return undefined;
    return {
      href: impact.topologyPathHref,
      surface: "path",
      title: `${impact.fromDomain} -> ${impact.toDomain}`,
    };
  }

  const hub = topHubs.find(
    (candidate) => candidate.topologyHref || candidate.ontologyHref || candidate.builderHref,
  );
  if (!hub) return undefined;
  if (hub.topologyHref) return { href: hub.topologyHref, surface: "topology", title: hub.title };
  if (hub.ontologyHref) return { href: hub.ontologyHref, surface: "ontology", title: hub.title };
  if (hub.builderHref) return { href: hub.builderHref, surface: "builder", title: hub.title };
  return undefined;
}

export function decisionLaneLabel(
  focus: InsightsCollaboratorReviewFocus,
  labels: Pick<
    FormatInsightsCollaboratorBriefLabels,
    | "decisionAlignOwner"
    | "decisionAlignExpected"
    | "decisionAlignNextStep"
    | "decisionImpactOwner"
    | "decisionImpactExpected"
    | "decisionImpactNextStep"
    | "decisionOrphanOwner"
    | "decisionOrphanExpected"
    | "decisionOrphanNextStep"
  >,
  field: keyof InsightsCollaboratorBrief["decisionLane"],
): string {
  if (focus === "resolve_orphans") {
    if (field === "owner") return labels.decisionOrphanOwner;
    if (field === "expected") return labels.decisionOrphanExpected;
    return labels.decisionOrphanNextStep;
  }
  if (focus === "trace_impact") {
    if (field === "owner") return labels.decisionImpactOwner;
    if (field === "expected") return labels.decisionImpactExpected;
    return labels.decisionImpactNextStep;
  }
  if (field === "owner") return labels.decisionAlignOwner;
  if (field === "expected") return labels.decisionAlignExpected;
  return labels.decisionAlignNextStep;
}

export function formatDecisionHandoffLabel(
  handoff: NonNullable<InsightsCollaboratorBrief["decisionHandoff"]>,
  labels: Pick<
    FormatInsightsCollaboratorBriefLabels,
    "builder" | "impactHandoffPath" | "ontology" | "topology"
  >,
): string {
  const surface =
    handoff.surface === "builder"
      ? labels.builder
      : handoff.surface === "path"
        ? labels.impactHandoffPath
        : handoff.surface === "ontology"
          ? labels.ontology
          : labels.topology;
  return `${handoff.title} (${surface})`;
}

function formatVocabularyReviewLine(
  hub: InsightsBriefHub,
  labels: Pick<
    FormatInsightsCollaboratorBriefLabels,
    | "vocabularyTerm"
    | "vocabularyWhy"
    | "vocabularyReuse"
    | "vocabularyReuseAction"
  >,
): string {
  const id = hub.id ? `, ${hub.id}` : "";
  return `- ${labels.vocabularyTerm}: ${hub.title} (${hub.kind}${id}) | ${labels.vocabularyWhy}: degree ${hub.degree} | ${labels.vocabularyReuse}: ${labels.vocabularyReuseAction}`;
}

function formatHubSummaryLine(hub: InsightsBriefHub): string {
  const details = [`${hub.kind}`, `degree ${hub.degree}`];
  if (hub.id) details.push(hub.id);
  return `- ${hub.title} (${details.join(", ")})`;
}

function formatHubHandoffLine(
  hub: InsightsBriefHub,
  labels: Pick<
    FormatInsightsCollaboratorBriefLabels,
    "ontology" | "topology" | "builder"
  >,
): string {
  const links = [
    hub.ontologyHref ? `${labels.ontology}: ${hub.ontologyHref}` : null,
    hub.topologyHref ? `${labels.topology}: ${hub.topologyHref}` : null,
    hub.builderHref ? `${labels.builder}: ${hub.builderHref}` : null,
  ].filter((link): link is string => link !== null);
  return `- ${hub.title}: ${links.join(" | ")}`;
}

function formatImpactHandoffLine(
  handoff: InsightsImpactHandoff,
  labels: Pick<
    FormatInsightsCollaboratorBriefLabels,
    "crossDomain" | "impactHandoffExample" | "impactHandoffPath"
  >,
): string {
  const example = handoff.example
    ? ` ${labels.impactHandoffExample}: ${handoff.example.from} --${handoff.example.type}--> ${handoff.example.to}`
    : "";
  const path = handoff.topologyPathHref
    ? ` ${labels.impactHandoffPath}: ${handoff.topologyPathHref}`
    : "";
  return `- ${handoff.fromDomain} -> ${handoff.toDomain}: ${handoff.count} ${labels.crossDomain}.${example}${path}`;
}

function formatOpenQuestionHandoffLine(
  question: InsightsOpenQuestion,
  labels: Pick<
    FormatInsightsCollaboratorBriefLabels,
    "ontology" | "topology" | "builder"
  >,
): string {
  const links = [
    question.ontologyHref ? `${labels.ontology}: ${question.ontologyHref}` : null,
    question.topologyHref ? `${labels.topology}: ${question.topologyHref}` : null,
    question.builderHref ? `${labels.builder}: ${question.builderHref}` : null,
  ].filter((link): link is string => link !== null);
  return `- ${question.title} (${question.kind}, ${question.id}): ${links.join(" | ")}`;
}
