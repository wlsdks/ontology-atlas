import { formatQueryOntologyCall } from "@/shared/lib/ontology-query-call";
import type { TopologyAnalysisMode } from "../model/url-state";
import {
  explainOntologyRelationKeyForGraphIds,
  inferOntologyRelationKeyForGraphIds,
} from "@/shared/lib/ontology-relation-key";
import {
  buildOntologyBuilderNodeHrefFromGraphId,
  buildOntologyNodeHref,
} from "@/entities/knowledge-graph";

export interface TopologyAnalysisSummaryInput {
  mode: TopologyAnalysisMode;
  selectedTitle: string | null;
  visibleCount: number | null;
  totalCount: number;
  relationCount: number;
  staleCount: number;
  orphanCount: number;
  promotionCount: number;
}

export interface TopologyAnalysisSummary {
  mode: TopologyAnalysisMode;
  primaryMetric: number;
  secondaryMetric: number;
  needsSelection: boolean;
  healthBreakdown: {
    stale: number;
    orphan: number;
    promotion: number;
  };
}

export interface TopologyHealthActionCandidate {
  slug: string;
  name: string;
}

export interface TopologyHealthActionTarget {
  slug: string;
  title: string;
  kind: "stale" | "orphan" | "promotion";
}

export interface TopologyHealthBriefLabels {
  title: string;
  total: string;
  stale: string;
  orphan: string;
  promotion: string;
  inspect: string;
  inspectUrl: string;
  ontologyUrl: string;
  repairUrl: string;
  nextAction: string;
  agentCheck: string;
  mcpCheck: string;
  relationPreflight: string;
  mcpRelationPreflight: string;
  impactCheck: string;
  mcpImpactCheck: string;
  syncGate: string;
  actionStale: string;
  actionOrphan: string;
  actionPromotion: string;
  none: string;
  url: string;
}

export interface TopologyOverviewBriefLabels {
  title: string;
  totalNodes: string;
  totalRelations: string;
  healthSignals: string;
  stale: string;
  orphan: string;
  promotion: string;
  url: string;
  healthUrl: string;
  insightsUrl: string;
  agentCheck: string;
  mcpCheck: string;
  mcpQueryPlan: string;
  workspaceCheck: string;
  mcpWorkspaceCheck: string;
}

export interface TopologyFocusBriefLabels {
  title: string;
  node: string;
  url: string;
  ontologyUrl: string;
  builderUrl: string;
  reviewFocus: string;
  agentCheck: string;
  mcpCheck: string;
  impactCheck: string;
  mcpImpactCheck: string;
  syncGate: string;
}

export interface TopologyPathEvidenceBriefLabels {
  title: string;
  source: string;
  target: string;
  url: string;
  sourceOntologyUrl: string;
  targetOntologyUrl: string;
  sourceBuilderUrl: string;
  targetBuilderUrl: string;
  cliCheck: string;
  mcpCheck: string;
  relationPreflightReason: string;
  relationPreflightMcpCheck: string;
  explainRelationMcpCheck: string;
  allPathsPlanMcpCheck: string;
  allPathsMcpCheck: string;
  allPathsEvidenceContract: string;
  proofChecklist: string;
  proofVisiblePath: string;
  proofRelationPreflight: string;
  proofExplainRelation: string;
  proofBoundedTraversal: string;
  proofPostWriteSync: string;
  proofStatusReady: string;
  proofStatusRequired: string;
  proofStatusAfterWrite: string;
  syncGate: string;
}

export function buildTopologyAnalysisSummary(
  input: TopologyAnalysisSummaryInput,
): TopologyAnalysisSummary {
  if (input.mode === "health") {
    return {
      mode: input.mode,
      primaryMetric: input.staleCount + input.orphanCount + input.promotionCount,
      secondaryMetric: input.relationCount,
      needsSelection: false,
      healthBreakdown: {
        stale: input.staleCount,
        orphan: input.orphanCount,
        promotion: input.promotionCount,
      },
    };
  }

  if (input.mode === "focus" || input.mode === "path") {
    return {
      mode: input.mode,
      primaryMetric: input.visibleCount ?? input.totalCount,
      secondaryMetric: input.relationCount,
      needsSelection: input.selectedTitle === null,
      healthBreakdown: {
        stale: input.staleCount,
        orphan: input.orphanCount,
        promotion: input.promotionCount,
      },
    };
  }

  return {
    mode: input.mode,
    primaryMetric: input.totalCount,
    secondaryMetric: input.relationCount,
    needsSelection: false,
    healthBreakdown: {
      stale: input.staleCount,
      orphan: input.orphanCount,
      promotion: input.promotionCount,
    },
  };
}

export function buildTopologyHealthActionTarget({
  stale,
  orphan,
  promotion,
}: {
  stale: readonly TopologyHealthActionCandidate[];
  orphan: readonly TopologyHealthActionCandidate[];
  promotion: readonly TopologyHealthActionCandidate[];
}): TopologyHealthActionTarget | null {
  const firstStale = stale[0];
  if (firstStale) {
    return {
      slug: firstStale.slug,
      title: firstStale.name,
      kind: "stale",
    };
  }

  const firstOrphan = orphan[0];
  if (firstOrphan) {
    return {
      slug: firstOrphan.slug,
      title: firstOrphan.name,
      kind: "orphan",
    };
  }

  const firstPromotion = promotion[0];
  if (firstPromotion) {
    return {
      slug: firstPromotion.slug,
      title: firstPromotion.name,
      kind: "promotion",
    };
  }

  return null;
}

export function formatTopologyHealthBrief({
  summary,
  actionTarget,
  labels,
  url,
  inspectUrl,
  syncGatePacket,
}: {
  summary: Pick<TopologyAnalysisSummary, "primaryMetric" | "healthBreakdown">;
  actionTarget: TopologyHealthActionTarget | null;
  labels: TopologyHealthBriefLabels;
  url?: string | null;
  inspectUrl?: string | null;
  syncGatePacket?: string | null;
}): string {
  const lines = [
    `# ${labels.title}`,
    `- ${labels.total}: ${summary.primaryMetric}`,
    `- ${labels.stale}: ${summary.healthBreakdown.stale}`,
    `- ${labels.orphan}: ${summary.healthBreakdown.orphan}`,
    `- ${labels.promotion}: ${summary.healthBreakdown.promotion}`,
    actionTarget
      ? `- ${labels.inspect}: ${actionTarget.kind} · ${actionTarget.title} (${actionTarget.slug})`
      : `- ${labels.inspect}: ${labels.none}`,
  ];

  if (url) {
    lines.push(`- ${labels.url}: ${url}`);
  }
  if (inspectUrl) {
    lines.push(`- ${labels.inspectUrl}: ${inspectUrl}`);
  }
  if (actionTarget) {
    lines.push(
      `- ${labels.ontologyUrl}: ${buildOntologyNodeHref(actionTarget.slug)}`,
      `- ${labels.repairUrl}: ${buildTopologyHealthRepairHref(actionTarget.slug)}`,
      `- ${labels.nextAction}: ${getTopologyHealthNextAction(actionTarget.kind, labels)}`,
      `- ${labels.agentCheck}: oh-my-ontology node ${actionTarget.slug} [vault] --limit 12`,
      `- ${labels.mcpCheck}: ${formatTopologyHealthMcpCheck(actionTarget.slug)}`,
      ...(actionTarget.kind === "orphan"
        ? [
            `- ${labels.relationPreflight}: oh-my-ontology relation-check <owner-slug> ${actionTarget.slug} contains [vault]`,
            `- ${labels.mcpRelationPreflight}: ${formatTopologyHealthOwnerRelationMcpCheck(
              actionTarget.slug,
            )}`,
          ]
        : []),
      `- ${labels.impactCheck}: ${formatTopologyHealthImpactCliCheck(actionTarget.slug)}`,
      `- ${labels.mcpImpactCheck}: ${formatTopologyHealthImpactMcpCheck(actionTarget.slug)}`,
      ...formatTopologyAnalysisSyncGate(
        labels.syncGate,
        syncGatePacket ?? "health -> cycles -> growth_plan -> maintenance_plan -> validate_vault",
      ),
    );
  }

  return lines.join("\n");
}

export function formatTopologyOverviewBrief({
  summary,
  labels,
  url,
  healthUrl,
  insightsUrl,
}: {
  summary: Pick<
    TopologyAnalysisSummary,
    "primaryMetric" | "secondaryMetric" | "healthBreakdown"
  >;
  labels: TopologyOverviewBriefLabels;
  url?: string | null;
  healthUrl: string;
  insightsUrl: string;
}): string {
  const healthSignalCount =
    summary.healthBreakdown.stale +
    summary.healthBreakdown.orphan +
    summary.healthBreakdown.promotion;
  const lines = [
    `# ${labels.title}`,
    `- ${labels.totalNodes}: ${summary.primaryMetric}`,
    `- ${labels.totalRelations}: ${summary.secondaryMetric}`,
    `- ${labels.healthSignals}: ${healthSignalCount}`,
    `- ${labels.stale}: ${summary.healthBreakdown.stale}`,
    `- ${labels.orphan}: ${summary.healthBreakdown.orphan}`,
    `- ${labels.promotion}: ${summary.healthBreakdown.promotion}`,
  ];

  if (url) {
    lines.push(`- ${labels.url}: ${url}`);
  }

  lines.push(
    `- ${labels.healthUrl}: ${healthUrl}`,
    `- ${labels.insightsUrl}: ${insightsUrl}`,
    `- ${labels.agentCheck}: oh-my-ontology overview [vault] --limit 5`,
    `- ${labels.mcpCheck}: ${formatTopologyOverviewMcpCheck()}`,
    `- ${labels.mcpQueryPlan}: ${formatTopologyOverviewMcpQueryPlan()}`,
    `- ${labels.workspaceCheck}: oh-my-ontology workspace-brief [vault]`,
    `- ${labels.mcpWorkspaceCheck}: ${formatTopologyOverviewMcpWorkspaceCheck()}`,
  );

  return lines.join("\n");
}

export function formatTopologyFocusBrief({
  slug,
  title,
  labels,
  url,
  focusUrl,
  ontologyUrl,
  builderUrl,
  syncGatePacket,
}: {
  slug: string;
  title: string;
  labels: TopologyFocusBriefLabels;
  url?: string | null;
  focusUrl?: string | null;
  ontologyUrl: string;
  builderUrl: string;
  syncGatePacket?: string | null;
}): string {
  const lines = [
    `# ${labels.title}`,
    `- ${labels.node}: ${title} (${slug})`,
  ];

  if (url) {
    lines.push(`- ${labels.url}: ${url}`);
  }
  if (focusUrl) {
    lines.push(`- ${labels.reviewFocus}: ${focusUrl}`);
  }

  lines.push(
    `- ${labels.ontologyUrl}: ${ontologyUrl}`,
    `- ${labels.builderUrl}: ${builderUrl}`,
    `- ${labels.agentCheck}: oh-my-ontology node ${slug} [vault] --limit 12`,
    `- ${labels.mcpCheck}: ${formatTopologyHealthMcpCheck(slug)}`,
    `- ${labels.impactCheck}: ${formatTopologyHealthImpactCliCheck(slug)}`,
    `- ${labels.mcpImpactCheck}: ${formatTopologyHealthImpactMcpCheck(slug)}`,
    ...formatTopologyAnalysisSyncGate(
      labels.syncGate,
      syncGatePacket ?? "health -> cycles -> growth_plan -> maintenance_plan -> validate_vault",
    ),
  );

  return lines.join("\n");
}

export function formatTopologyPathEvidenceBrief({
  sourceSlug,
  targetSlug,
  sourceTitle,
  targetTitle,
  labels,
  url,
  syncGatePacket,
}: {
  sourceSlug: string;
  targetSlug: string;
  sourceTitle: string;
  targetTitle: string;
  labels: TopologyPathEvidenceBriefLabels;
  url?: string | null;
  syncGatePacket?: string | null;
}): string {
  const lines = [
    `# ${labels.title}`,
    `- ${labels.source}: ${sourceTitle} (${sourceSlug})`,
    `- ${labels.target}: ${targetTitle} (${targetSlug})`,
  ];

  if (url) {
    lines.push(`- ${labels.url}: ${url}`);
  }

  lines.push(
    `- ${labels.sourceOntologyUrl}: /ontology/?node=${encodeURIComponent(sourceSlug)}`,
    `- ${labels.targetOntologyUrl}: /ontology/?node=${encodeURIComponent(targetSlug)}`,
    `- ${labels.sourceBuilderUrl}: ${buildTopologyHealthRepairHref(sourceSlug)}`,
    `- ${labels.targetBuilderUrl}: ${buildTopologyHealthRepairHref(targetSlug)}`,
    `- ${labels.cliCheck}: ${formatTopologyPathCliCheck(sourceSlug, targetSlug)}`,
    `- ${labels.mcpCheck}: ${formatTopologyPathMcpCheck(sourceSlug, targetSlug)}`,
    `- ${labels.relationPreflightReason}: ${explainOntologyRelationKeyForGraphIds(
      sourceSlug,
      targetSlug,
    )}`,
    `- ${labels.relationPreflightMcpCheck}: ${formatTopologyPathRelationPreflightMcpCheck(
      sourceSlug,
      targetSlug,
    )}`,
    `- ${labels.explainRelationMcpCheck}: ${formatTopologyPathExplainRelationMcpCheck(
      sourceSlug,
      targetSlug,
    )}`,
    `- ${labels.allPathsPlanMcpCheck}: ${formatTopologyPathAllPathsPlanMcpCheck(
      sourceSlug,
      targetSlug,
    )}`,
    `- ${labels.allPathsMcpCheck}: ${formatTopologyPathAllPathsMcpCheck(
      sourceSlug,
      targetSlug,
    )}`,
    `- ${labels.allPathsEvidenceContract}: report limit, searchBudget, expandedStates, exhaustive, truncatedByBudget, totalPathsExact, evidence.status, evidence.reason, and evidence.pathsComplete before using paths as write evidence`,
    `- ${labels.proofChecklist}:`,
    `  - ${labels.proofVisiblePath}: ${labels.proofStatusReady}`,
    `  - ${labels.proofRelationPreflight}: ${labels.proofStatusRequired}`,
    `  - ${labels.proofExplainRelation}: ${labels.proofStatusRequired}`,
    `  - ${labels.proofBoundedTraversal}: ${labels.proofStatusRequired}`,
    `  - ${labels.proofPostWriteSync}: ${labels.proofStatusAfterWrite}`,
    ...formatTopologyAnalysisSyncGate(
      labels.syncGate,
      syncGatePacket ?? "health -> cycles -> growth_plan -> maintenance_plan -> validate_vault",
    ),
  );

  return lines.join("\n");
}

function formatTopologyAnalysisSyncGate(label: string, syncGate: string): string[] {
  if (!syncGate.includes("\n")) {
    return [`- ${label}: ${syncGate}`];
  }

  return [
    `- ${label}:`,
    ...syncGate.split("\n").map((line) => (line ? `  ${line}` : "")),
  ];
}

export function formatTopologyHealthMcpCheck(slug: string): string {
  return formatQueryOntologyCall({
    operation: "node_profile",
    slug,
    depth: 2,
    limit: 12,
  });
}

export function formatTopologyHealthOwnerRelationMcpCheck(slug: string): string {
  return formatQueryOntologyCall({
    operation: "relation_check",
    from: "<owner-slug>",
    to: slug,
    type: "contains",
  });
}

export function formatTopologyOverviewMcpCheck(): string {
  return formatQueryOntologyCall({
    operation: "overview",
    limit: 5,
  });
}

export function formatTopologyOverviewMcpQueryPlan(): string {
  return formatQueryOntologyCall({
    operation: "query_plan",
    targetOperation: "overview",
  });
}

export function formatTopologyOverviewMcpWorkspaceCheck(): string {
  return formatQueryOntologyCall({
    operation: "workspace_brief",
  });
}

export function formatTopologyHealthImpactCliCheck(slug: string): string {
  return `oh-my-ontology blast-radius ${slug} [vault] --depth 2 --direction incoming`;
}

export function formatTopologyHealthImpactMcpCheck(slug: string): string {
  return formatQueryOntologyCall({
    operation: "blast_radius",
    slug,
    depth: 2,
    direction: "incoming",
  });
}

export function formatTopologyPathCliCheck(from: string, to: string): string {
  return `oh-my-ontology path ${from} ${to} [vault] --max-hops 5`;
}

export function formatTopologyPathMcpCheck(from: string, to: string): string {
  return formatQueryOntologyCall({
    operation: "path",
    from,
    to,
    maxHops: 5,
  });
}

export function formatTopologyPathRelationPreflightMcpCheck(
  from: string,
  to: string,
): string {
  return formatQueryOntologyCall({
    operation: "relation_check",
    from,
    to,
    type: inferOntologyRelationKeyForGraphIds(from, to),
  });
}

export function formatTopologyPathExplainRelationMcpCheck(
  from: string,
  to: string,
): string {
  return formatQueryOntologyCall({
    operation: "explain_relation",
    from,
    to,
    direction: "undirected",
    maxHops: 5,
    limit: 10,
  });
}

export function formatTopologyPathAllPathsPlanMcpCheck(
  from: string,
  to: string,
): string {
  return formatQueryOntologyCall({
    operation: "query_plan",
    targetOperation: "all_paths",
    from,
    to,
    maxHops: 5,
    limit: 10,
    searchBudget: 1000,
  });
}

export function formatTopologyPathAllPathsMcpCheck(from: string, to: string): string {
  return formatQueryOntologyCall({
    operation: "all_paths",
    from,
    to,
    maxHops: 5,
    limit: 10,
    searchBudget: 1000,
  });
}


export function buildTopologyHealthRepairHref(slug: string): string {
  return buildOntologyBuilderNodeHrefFromGraphId(slug);
}

export function getTopologyHealthNextAction(
  kind: TopologyHealthActionTarget["kind"],
  labels: Pick<
    TopologyHealthBriefLabels,
    "actionStale" | "actionOrphan" | "actionPromotion"
  >,
): string {
  if (kind === "stale") {
    return labels.actionStale;
  }
  if (kind === "orphan") {
    return labels.actionOrphan;
  }
  return labels.actionPromotion;
}
