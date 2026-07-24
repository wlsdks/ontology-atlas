import { formatQueryOntologyCall } from "@/shared/lib/ontology-query-call";
import type { TopologyAnalysisMode } from "../model/url-state";
import {
  buildOntologyStudioNodeHrefFromGraphId,
  buildOntologyHealthActionTarget,
  buildOntologyNodeHref,
  classifyRelationQuality,
  type KnowledgeGraphEdge,
  type KnowledgeGraphNode,
  type OntologyHealthActionTarget,
} from "@/entities/knowledge-graph";
import { buildOntologyReachability } from "@/shared/lib/ontology-tree";

export interface TopologyAnalysisSummaryInput {
  mode: TopologyAnalysisMode;
  selectedTitle: string | null;
  visibleCount: number | null;
  totalCount: number;
  relationCount: number;
  relationProvenance?: TopologyRelationProvenanceBreakdown;
  relationQuality?: TopologyRelationQualityBreakdown;
  staleCount: number;
  orphanCount: number;
  promotionCount: number;
}

export interface TopologyRelationProvenanceBreakdown {
  sourceBacked: number;
  authored: number;
  needsReview: number;
}

export interface TopologyRelationQualityBreakdown {
  strong: number;
  supported: number;
  weak: number;
  review: number;
}

export type TopologyRelationQuality = keyof TopologyRelationQualityBreakdown;

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
  relationProvenance?: TopologyRelationProvenanceBreakdown;
  relationQuality?: TopologyRelationQualityBreakdown;
}

/**
 * Re-exported under this file's historical name — the picking rule itself
 * now lives at `entities/knowledge-graph/lib/ontology-health-signals.ts` so
 * `/ontology/insights`' RelationsTab "수리 큐" section (분석 패널 완전 소멸
 * 2단계 §c) can reuse the SAME function without a cross-view import
 * (`views/home` → `views/ontology-insights` would violate FSD's "avoid
 * same-layer cross-import" guidance). Both surfaces' "next repair target"
 * can't drift because they call the one entities-level function.
 */
export type TopologyHealthActionTarget = OntologyHealthActionTarget;

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
  actionKindStale: string;
  actionKindOrphan: string;
  actionKindPromotion: string;
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
  relationReading: string;
  relationProvenance: string;
  relationSourceBacked: string;
  relationAuthored: string;
  relationNeedsReview: string;
  relationQuality: string;
  relationQualityStrong: string;
  relationQualitySupported: string;
  relationQualityWeak: string;
  relationQualityReview: string;
  agentReadiness: string;
  agentReadinessReady: string;
  agentReadinessPreflight: string;
  agentReadinessReview: string;
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

export function buildTopologyAnalysisSummary(
  input: TopologyAnalysisSummaryInput,
): TopologyAnalysisSummary {
  const relationProvenance = input.relationProvenance ?? {
    sourceBacked: 0,
    authored: input.relationCount,
    needsReview: 0,
  };
  const relationQuality = input.relationQuality ?? {
    strong: 0,
    supported: input.relationCount,
    weak: 0,
    review: 0,
  };

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
      relationProvenance,
      relationQuality,
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
      relationProvenance,
      relationQuality,
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
    relationProvenance,
    relationQuality,
  };
}

export { buildOntologyHealthActionTarget as buildTopologyHealthActionTarget };

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
      ? `- ${labels.inspect}: ${getTopologyHealthActionKindLabel(
          actionTarget.kind,
          labels,
        )} · ${actionTarget.title} (${actionTarget.slug})`
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
      `- ${labels.agentCheck}: ontology-atlas node ${actionTarget.slug} [vault] --limit 12`,
      `- ${labels.mcpCheck}: ${formatTopologyHealthMcpCheck(actionTarget.slug)}`,
      ...(actionTarget.kind === "orphan"
        ? [
            `- ${labels.relationPreflight}: ontology-atlas relation-check <owner-slug> ${actionTarget.slug} contains [vault]`,
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
    | "primaryMetric"
    | "secondaryMetric"
    | "healthBreakdown"
    | "relationProvenance"
    | "relationQuality"
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
    `- ${labels.relationReading}`,
    `- ${labels.relationProvenance}: ${formatTopologyRelationProvenanceSummary(
      summary.relationProvenance,
      labels,
    )}`,
    `- ${labels.relationQuality}: ${formatTopologyRelationQualitySummary(
      summary.relationQuality,
      labels,
    )}`,
    `- ${labels.agentReadiness}: ${formatTopologyAgentReadinessSummary(
      summary.relationQuality,
      {
        ready: labels.agentReadinessReady,
        preflight: labels.agentReadinessPreflight,
        review: labels.agentReadinessReview,
      },
    )}`,
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
    `- ${labels.agentCheck}: ontology-atlas overview [vault] --limit 5`,
    `- ${labels.mcpCheck}: ${formatTopologyOverviewMcpCheck()}`,
    `- ${labels.mcpQueryPlan}: ${formatTopologyOverviewMcpQueryPlan()}`,
    `- ${labels.workspaceCheck}: ontology-atlas workspace-brief [vault]`,
    `- ${labels.mcpWorkspaceCheck}: ${formatTopologyOverviewMcpWorkspaceCheck()}`,
  );

  return lines.join("\n");
}

export function formatTopologyRelationProvenanceSummary(
  provenance: TopologyRelationProvenanceBreakdown | undefined,
  labels: Pick<
    TopologyOverviewBriefLabels,
    "relationSourceBacked" | "relationAuthored" | "relationNeedsReview"
  >,
): string {
  const counts = provenance ?? { sourceBacked: 0, authored: 0, needsReview: 0 };
  return [
    `${labels.relationSourceBacked} ${counts.sourceBacked}`,
    `${labels.relationAuthored} ${counts.authored}`,
    `${labels.relationNeedsReview} ${counts.needsReview}`,
  ].join(" · ");
}

/** Re-exports the entities-level classifier under this file's historical
 *  name — `entities/knowledge-graph/lib/relation-quality.ts` is the single
 *  source of truth (shared with `views/ontology-insights`' RelationsTab agent
 *  readiness gauge, W3 분석 보기 은퇴). */
export function classifyTopologyRelationQuality(
  edge: Pick<KnowledgeGraphEdge, "type" | "evidenceIds" | "lastApprovedBy">,
): keyof TopologyRelationQualityBreakdown {
  return classifyRelationQuality(edge);
}

export function formatTopologyRelationQualitySummary(
  quality: TopologyRelationQualityBreakdown | undefined,
  labels: Pick<
    TopologyOverviewBriefLabels,
    | "relationQualityStrong"
    | "relationQualitySupported"
    | "relationQualityWeak"
    | "relationQualityReview"
  >,
): string {
  const counts = quality ?? { strong: 0, supported: 0, weak: 0, review: 0 };
  return [
    `${labels.relationQualityStrong} ${counts.strong}`,
    `${labels.relationQualitySupported} ${counts.supported}`,
    `${labels.relationQualityWeak} ${counts.weak}`,
    `${labels.relationQualityReview} ${counts.review}`,
  ].join(" · ");
}

export function formatTopologyAgentReadinessSummary(
  quality: TopologyRelationQualityBreakdown | undefined,
  labels: {
    ready: string;
    preflight: string;
    review: string;
  },
): string {
  const counts = quality ?? { strong: 0, supported: 0, weak: 0, review: 0 };
  return [
    `${labels.ready} ${counts.strong + counts.supported}`,
    `${labels.preflight} ${counts.weak}`,
    `${labels.review} ${counts.review}`,
  ].join(" · ");
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
  return `ontology-atlas blast-radius ${slug} [vault] --depth 2 --direction incoming`;
}

export function formatTopologyHealthImpactMcpCheck(slug: string): string {
  return formatQueryOntologyCall({
    operation: "blast_radius",
    slug,
    depth: 2,
    direction: "incoming",
  });
}

export function formatTopologyPathMcpCheck(from: string, to: string): string {
  return formatQueryOntologyCall({
    operation: "path",
    from,
    to,
    maxHops: 5,
  });
}

/**
 * 경로 칩(`TopologyPathChip`)의 "N홉" 숫자 — 두 노드 사이 최단 hop 수(undirected
 * BFS, `direction: "both"`). 관계엔 방향이 있어도 "경로가 있다/몇 단계냐"는
 * 사용자 질문 자체가 방향 무관이라 `explain_relation` MCP 오퍼레이션과 같은
 * `direction: "undirected"` 관례를 따른다. depth/limit 을 노드 수만큼 열어
 * 그래프 전체에서 실제 최단 거리를 찾는다(부분 BFS 로 놓치지 않음).
 * 같은 노드를 고르면 0, 도달 불가면 null.
 */
export function computeTopologyPathHopCount(
  sourceId: string,
  targetId: string,
  nodes: readonly KnowledgeGraphNode[],
  edges: readonly KnowledgeGraphEdge[],
): number | null {
  if (sourceId === targetId) return 0;
  const bound = Math.max(nodes.length, 1);
  const reachability = buildOntologyReachability(sourceId, nodes, edges, {
    direction: "both",
    depth: bound,
    limit: bound,
  });
  for (const layer of reachability.layers) {
    if (layer.nodes.some((node) => node.id === targetId)) {
      return layer.distance;
    }
  }
  return null;
}

export interface TopologyPathAgentPacketLabels {
  title: string;
  source: string;
  target: string;
  hops: string;
  hopsUnknown: string;
  sourceOntologyUrl: string;
  targetOntologyUrl: string;
  sourceBuilderUrl: string;
  targetBuilderUrl: string;
  mcpCheck: string;
}

/**
 * 경로 칩의 "경로 패킷 복사" 1버튼 — 예전 path 패널의 CLI/MCP 2버튼 분기 +
 * relation-preflight/explain_relation/all_paths 5종 복사 버튼을 에이전트용
 * `find_path` MCP 호출 1종으로 압축했다(분석 패널 완전 소멸 2단계 §b,
 * "2버튼 분기 제거 — 에이전트용 1종만"). 필요하면 에이전트가 이 결과를 보고
 * 스스로 relation_check/explain_relation 을 이어서 호출할 수 있다 — 매
 * 클릭마다 5개 버튼을 미리 깔아둘 필요는 없다.
 */
export function formatTopologyPathAgentPacket({
  sourceSlug,
  targetSlug,
  sourceTitle,
  targetTitle,
  hopCount,
  labels,
}: {
  sourceSlug: string;
  targetSlug: string;
  sourceTitle: string;
  targetTitle: string;
  hopCount: number | null;
  labels: TopologyPathAgentPacketLabels;
}): string {
  return [
    `# ${labels.title}`,
    `- ${labels.source}: ${sourceTitle} (${sourceSlug})`,
    `- ${labels.target}: ${targetTitle} (${targetSlug})`,
    `- ${labels.hops}: ${hopCount === null ? labels.hopsUnknown : hopCount}`,
    `- ${labels.sourceOntologyUrl}: ${buildOntologyNodeHref(sourceSlug)}`,
    `- ${labels.targetOntologyUrl}: ${buildOntologyNodeHref(targetSlug)}`,
    `- ${labels.sourceBuilderUrl}: ${buildTopologyHealthRepairHref(sourceSlug)}`,
    `- ${labels.targetBuilderUrl}: ${buildTopologyHealthRepairHref(targetSlug)}`,
    `- ${labels.mcpCheck}: ${formatTopologyPathMcpCheck(sourceSlug, targetSlug)}`,
  ].join("\n");
}

export function buildTopologyHealthRepairHref(slug: string): string {
  return buildOntologyStudioNodeHrefFromGraphId(slug);
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

/**
 * INDEX 패널 하단 "인계" 메뉴의 "재분석 지시" 항목이 복사하는 agent 프롬프트
 * (W3 분석 보기 은퇴 — 이전엔 `TopologyAnalysisBar` overview 모드 안의 접힌
 * 보조 액션이었다). 입력 없는 고정 텍스트라 view 상태에 의존하지 않는다.
 */
export function formatOntologyReanalysisAgentCommand(): string {
  return [
    "Ontology Atlas agent task: reanalyze and strengthen this codebase ontology.",
    "",
    "If Atlas MCP is connected, run these read-first calls:",
    '1. list_kinds({})',
    '2. analyze_repo_structure({ "rootPath": "[repo-root]", "maxDepth": 3 })',
    '3. query_ontology({ "operation": "growth_plan", "limit": 20 })',
    '4. query_ontology({ "operation": "maintenance_plan", "limit": 20 })',
    '5. validate_vault({ "repoRoot": "[repo-root]" })',
    "",
    "Then propose only confirmed domain/capability/element/relation updates.",
    "Before writing, compare against existing nodes with find_evidence/similar_nodes and avoid duplicates.",
    "",
    "CLI fallback:",
    "pnpm cli:mcp-verify docs/ontology --timeout-ms 15000",
    "node cli/src/index.mjs growth docs/ontology --limit 20",
    "node cli/src/index.mjs maintenance docs/ontology --limit 20",
    "node cli/src/index.mjs validate docs/ontology",
  ].join("\n");
}

function getTopologyHealthActionKindLabel(
  kind: TopologyHealthActionTarget["kind"],
  labels: Pick<
    TopologyHealthBriefLabels,
    "actionKindStale" | "actionKindOrphan" | "actionKindPromotion"
  >,
): string {
  if (kind === "stale") {
    return labels.actionKindStale;
  }
  if (kind === "orphan") {
    return labels.actionKindOrphan;
  }
  return labels.actionKindPromotion;
}
