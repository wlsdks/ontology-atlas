"use client";

import { useMemo } from "react";
import { useSearchParams } from "next/navigation";
import { Link } from "@/i18n/navigation";
import { useTranslations } from "next-intl";
import {
  buildEdgeTypeRows,
  buildOntologyBuilderNodeHref,
  buildOntologyNodeHref,
  type KnowledgeGraphNode,
  useEdgeTypeLabel,
} from "@/entities/knowledge-graph";
import { useOntologyInsight } from "@/features/vault-ontology";
import { useOntologyKindLabel } from "@/entities/ontology-class";
import {
  UNKNOWN_TONE,
  buildAgentReadinessSummary,
  buildAgentGraphDbQueryPack,
  buildAgentInvestigationPlaybooks,
  buildAgentQueryRecipes,
  buildAgentTraversalStrategies,
  buildAgentWriteGuardrails,
  buildOntologyTree,
  buildProjectOntologyCounts,
  computeDomainCouplingMatrix,
  computeEdgeTypeDistribution,
  computeKindDistribution,
  countCrossProjectEdges,
  selectAgentProjectEntrypoint,
  selectAgentQueryEntrypoints,
  rankAllByDegree,
  selectRecentNodes,
} from "@/shared/lib/ontology-tree";
import { formatQueryOntologyCall as formatInsightsQueryOntologyCall } from "@/shared/lib/ontology-query-call";
import { MountedGlobalSearch } from "@/widgets/global-search";
import { OperationsNav } from "@/widgets/operations-nav";
import { EmptyState } from "@/shared/ui";
import { resolveDomainTint } from "@/shared/lib/domain-color";
import {
  buildInsightsCollaboratorBrief,
  decisionLaneLabel,
  formatDecisionHandoffLabel,
  formatInsightsCollaboratorBrief,
  formatInsightsVocabularyReview,
  reviewQuestionsForFocus,
  type InsightsCollaboratorBrief,
} from "../lib/collaborator-insights-brief";
import {
  buildInsightsOrphanNodeActions,
  formatInsightsOrphanRepairMcpPacket,
  formatInsightsOrphanRepairPacket,
} from "../lib/orphan-node-actions";
import { resolveInsightsQueryNode } from "../lib/resolve-insights-query-node";
import { formatDomainCouplingPathCheck } from "../lib/domain-coupling-path-check";
import { CopyAgentTextButton } from "./parts/CopyAgentTextButton";
import { InsightsQueryPackCockpit } from "./parts/InsightsQueryPackCockpit";
import { AgentReadinessPanel } from "./parts/AgentReadinessPanel";
import { AgentQueryRecipesPanel } from "./parts/AgentQueryRecipesPanel";
import { InsightsFocusedNodeProofPanel } from "./parts/InsightsFocusedNodeProofPanel";

/**
 * 노드 row 좌측 accent bar 색 — 빌더의 도메인 grouping 과 시각 일관.
 * domain 노드 자체만 자기 hue 로 tint (capability/element 는 domain 정보가
 * KnowledgeGraphNode shape 에 직접 없어 자체 hue 미지원, follow-up).
 */
function rowAccentColor(node: { id: string; kind: string }): string | null {
  if (node.kind !== 'domain') return null;
  const tail = node.id.split('/').pop() ?? node.id;
  return resolveDomainTint(tail).accent;
}

/**
 * 노드 row 에 일관 적용하는 hover transition + 선택적 accent bar.
 * 디자인 시스템의 no-glow 규칙에 맞춰 hover 는 border/background 로만 표시한다.
 */
const ROW_BASE_CLASS =
  "flex items-center gap-2 rounded-md border border-[color:var(--color-border-soft)] " +
  "bg-[color:var(--color-overlay-1)] px-2.5 py-1.5 text-[12px] " +
  "transition-[border-color,background-color] duration-200 " +
  "hover:border-[color:rgba(139,151,255,0.4)] " +
  "hover:bg-[color:rgba(94,106,210,0.07)]";

const DOMAIN_COUPLING_LIMIT = 6;
const DOMAIN_COUPLING_LOCAL_TYPES = ["depends_on", "related_to", "describes"] as const;
const DOMAIN_COUPLING_CLI_TYPES = "depends_on,relates,describes";
const DOMAIN_COUPLING_MCP_TYPES = ["depends_on", "relates", "describes"] as const;
const EMPTY_ORPHANS: KnowledgeGraphNode[] = [];

/**
 * `/ontology/insights` — ontology 의 구조를 한눈에.
 *
 * 패널: kind 분포 · 프로젝트별 분포 · edge type 분포 · 허브 노드 (degree 상위)
 * · cross-project edge 카운트 · 최근 노드 · 미연결 노드 (orphans).
 * `/ontology` 트리 뷰의 보조 surface — 트리는 hierarchy, 인사이트는 통계.
 *
 * R10b 후 lastApprovedAt 이 모든 노드에서 VAULT_SENTINEL_DATE (epoch 0) 라
 * "30일 활동 timeline" 패널과 노드별 relative timestamp 는 영구 의미 0 → 제거됨.
 */
export function OntologyInsightsPage() {
  const t = useTranslations("ontologyPages.insights");
  const kindLabel = useOntologyKindLabel();
  const edgeTypeLabel = useEdgeTypeLabel();
  const searchParams = useSearchParams();

  const { insight, error } = useOntologyInsight();
  const queryNodeId = searchParams.get("node");

  const kindDist = useMemo(
    () => (insight ? computeKindDistribution(insight.nodes) : new Map<string, number>()),
    [insight],
  );
  const HUB_DISPLAY_LIMIT = 10;
  // 전체 허브 후보를 한 번에 구해 truncation 을 사용자에게 알린다 (silent cap
  // 회피) — 상위 HUB_DISPLAY_LIMIT 만 표시하되 전체 개수를 caption 으로 노출.
  const hubRanking = useMemo(
    () => (insight ? rankAllByDegree(insight.nodes, insight.edges) : []),
    [insight],
  );
  const topHubs = useMemo(
    () => hubRanking.slice(0, HUB_DISPLAY_LIMIT),
    [hubRanking],
  );
  const recent = useMemo(
    () => (insight ? selectRecentNodes(insight.nodes, 10) : []),
    [insight],
  );
  const treeResult = useMemo(
    () => (insight ? buildOntologyTree(insight.nodes, insight.edges) : null),
    [insight],
  );
  const orphans = treeResult?.orphans ?? EMPTY_ORPHANS;
  const agentReadiness = useMemo(
    () =>
      insight && treeResult
        ? buildAgentReadinessSummary(insight.nodes, insight.edges, treeResult)
        : null,
    [insight, treeResult],
  );
  const agentEntrypoints = useMemo(
    () => (insight ? selectAgentQueryEntrypoints(insight.nodes, insight.edges, 4) : []),
    [insight],
  );
  const agentProjectEntrypoint = useMemo(
    () => (insight ? selectAgentProjectEntrypoint(insight.nodes, insight.edges) : null),
    [insight],
  );
  const agentQueryRecipes = useMemo(
    () =>
      agentReadiness
        ? buildAgentQueryRecipes(
            agentReadiness.status,
            agentEntrypoints,
            agentProjectEntrypoint,
          )
        : [],
    [agentEntrypoints, agentProjectEntrypoint, agentReadiness],
  );
  const agentPlaybooks = useMemo(
    () => buildAgentInvestigationPlaybooks(agentEntrypoints, agentProjectEntrypoint),
    [agentEntrypoints, agentProjectEntrypoint],
  );
  const agentTraversalStrategies = useMemo(
    () => buildAgentTraversalStrategies(agentEntrypoints, agentProjectEntrypoint),
    [agentEntrypoints, agentProjectEntrypoint],
  );
  const agentGraphDbQueryPack = useMemo(
    () => buildAgentGraphDbQueryPack(agentEntrypoints),
    [agentEntrypoints],
  );
  const agentGuardrails = useMemo(
    () => buildAgentWriteGuardrails(agentEntrypoints),
    [agentEntrypoints],
  );

  const totalNodes = insight?.nodes.length ?? 0;
  const totalEdges = insight?.edges.length ?? 0;
  const focusedQueryNode = useMemo(
    () => (insight ? resolveInsightsQueryNode(queryNodeId, insight.nodes) : null),
    [insight, queryNodeId],
  );

  // kind 분포 — sorted desc + 시각용 합계.
  const kindRows = useMemo(() => {
    const rows = Array.from(kindDist.entries())
      .map(([kind, count]) => ({ kind, count }))
      .sort((a, b) => b.count - a.count);
    return rows;
  }, [kindDist]);
  const kindMax = kindRows[0]?.count ?? 0;

  // 프로젝트별 ontology 분포 — 어느 프로젝트가 ontology 측면에서 큰지
  // 한 카드로 보여준다. project / document 메타 kind 는 집계 제외하고
  // 4 kind (domain / capability / element / unknown) 만 합산.
  const projectRows = useMemo(() => {
    if (!insight) return [] as Array<{ project: string; total: number }>;
    const counts = buildProjectOntologyCounts(insight.nodes);
    return Array.from(counts.entries())
      .map(([project, c]) => ({ project, total: c.total }))
      .sort((a, b) => b.total - a.total);
  }, [insight]);
  const projectMax = projectRows[0]?.total ?? 0;

  // edge type 분포 — 어떤 관계 type 이 우세한지 즉시 인지 (belongs_to /
  // implements / contains / uses 등). 트리는 hierarchy, 인사이트는
  // 통계, relations 페이지는 edge 단위 view — 여기는 mini bar 만.
  const edgeTypeDist = useMemo(
    () => (insight ? computeEdgeTypeDistribution(insight.edges) : new Map<string, number>()),
    [insight],
  );
  const edgeTypeRows = useMemo(
    () => buildEdgeTypeRows(edgeTypeDist),
    [edgeTypeDist],
  );
  // edgeTypeRows 는 canonical 순서 (contains, belongs_to, …) 라 [0] 가 max
  // 가 아니다 — 실제 max 는 reduce 로 별도 계산. 이전엔 bar pct 가 잘못된
  // baseline 으로 정규화돼 100% 초과 / 비율 왜곡 회귀가 있었다.
  const edgeTypeMax = useMemo(
    () => edgeTypeRows.reduce((m, r) => Math.max(m, r.count), 0),
    [edgeTypeRows],
  );

  // cross-project edge 카운트 — 양 끝 노드의 projectIds 가 disjoint 인 edge
  // 만 셈. 전체 edge 의 비율로 사용자에게 \"ontology 가 얼마나 분산됐나\"
  // 신호 노출.
  const crossProjectEdgeCount = useMemo(
    () => (insight ? countCrossProjectEdges(insight.edges, insight.nodes) : 0),
    [insight],
  );
  const domainCoupling = useMemo(
    () =>
      insight
        ? computeDomainCouplingMatrix(insight.nodes, insight.edges, DOMAIN_COUPLING_LIMIT, {
            types: DOMAIN_COUPLING_LOCAL_TYPES,
          })
        : null,
    [insight],
  );
  const domainCouplingCliCommand =
    `oh-my-ontology domain-matrix [vault] --limit ${DOMAIN_COUPLING_LIMIT} ` +
    `--types ${DOMAIN_COUPLING_CLI_TYPES}`;
  const domainCouplingMcpPayload = formatInsightsQueryOntologyCall({
    operation: "domain_matrix",
    limit: DOMAIN_COUPLING_LIMIT,
    types: DOMAIN_COUPLING_MCP_TYPES,
  });
  const collaboratorBrief = useMemo(() => {
    if (!insight || !domainCoupling) return null;
    return buildInsightsCollaboratorBrief({
      nodeCount: totalNodes,
      relationCount: totalEdges,
      domainCount: domainCoupling.domainCount,
      crossDomainEdgeCount: domainCoupling.crossDomainEdgeCount,
      orphanCount: orphans.length,
      impactHandoffs: domainCoupling.connections.slice(0, 3).map((connection) => {
        const strongest = connection.relationCounts[0];
        const example = connection.examples[0];
        return {
          fromDomain: connection.from.title,
          toDomain: connection.to.title,
          count: connection.count,
          topologyPathHref:
            strongest && example
              ? `/topology/?mode=path&pathFrom=${encodeURIComponent(example.from)}&pathTo=${encodeURIComponent(example.to)}`
              : undefined,
          example:
            strongest && example
              ? {
                  from: example.from,
                  type: edgeTypeLabel(strongest.type),
                  to: example.to,
                }
              : undefined,
        };
      }),
      openQuestions: orphans.slice(0, 3).map((node) => {
        const actions = buildInsightsOrphanNodeActions(node);
        return {
          id: node.id,
          title: node.title,
          kind: node.kind,
          ontologyHref: actions.ontologyHref,
          topologyHref: actions.topologyHref,
          builderHref: actions.builderHref,
        };
      }),
      topHubs: topHubs.map(({ node, degree }) => ({
        id: node.id,
        title: node.title,
        kind: node.kind,
        degree,
        ontologyHref: buildOntologyNodeHref(node.id),
        topologyHref: `/topology/?mode=focus&p=${encodeURIComponent(node.id)}`,
        builderHref: buildOntologyBuilderNodeHref(node),
      })),
    });
  }, [domainCoupling, edgeTypeLabel, insight, orphans, topHubs, totalNodes, totalEdges]);

  return (
    <div>
      <OperationsNav />
      <main id="main" className="mx-auto w-full max-w-5xl px-5 py-8 md:px-8 md:py-12">
      <MountedGlobalSearch />

      <section className="mb-8 space-y-3">
        <div>
          <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-[color:var(--color-text-quaternary)]">
            {t("eyebrow")}
          </p>
          <h1 className="mt-1 break-keep text-2xl font-[var(--font-weight-signature)] text-[color:var(--color-text-primary)]">
            {t("title")}
          </h1>
        </div>
        <p className="break-keep text-sm leading-7 text-[color:var(--color-text-secondary)]">
          {t("subtitle")}
        </p>
      </section>

      {error ? (
        <div
          role="alert"
          className="mb-6 rounded-2xl border border-[color:rgba(229,72,77,0.32)] bg-[color:rgba(229,72,77,0.08)] px-5 py-4 text-sm text-[color:var(--color-status-danger)]"
        >
          {t("errorAlert", { message: error.message })}
        </div>
      ) : null}

      {!insight ? (
        <div
          role="status"
          aria-live="polite"
          className="rounded-2xl border border-[color:var(--color-divider)] bg-[color:var(--color-overlay-1)] px-6 py-10 text-center text-sm text-[color:var(--color-text-tertiary)]"
        >
          {t("loading")}
        </div>
      ) : insight.nodes.length === 0 ? (
        <EmptyState
          tone="solid"
          align="center"
          title={
            <>
              {t("emptyTitleBefore")}
              <Link
                href={"/docs/"}
                className="text-[color:rgba(159,170,235,0.95)] underline"
              >
                {t("emptyTitleLink")}
              </Link>
              {t("emptyTitleAfter")}
            </>
          }
        />
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {agentGraphDbQueryPack.length > 0 ? (
            <InsightsQueryPackCockpit
              graphDbQueryPack={agentGraphDbQueryPack}
              readiness={agentReadiness}
            />
          ) : null}

          {focusedQueryNode ? (
            <InsightsFocusedNodeProofPanel node={focusedQueryNode} />
          ) : null}

          {collaboratorBrief ? (
            <InsightsCollaboratorBriefPanel
              brief={collaboratorBrief}
              impactCliCheckCommand={domainCouplingCliCommand}
              impactMcpCheckPayload={domainCouplingMcpPayload}
            />
          ) : null}

          {agentReadiness ? (
            <AgentReadinessPanel
              summary={agentReadiness}
              status={agentReadiness.status}
              score={agentReadiness.score}
              meaningfulNodes={agentReadiness.meaningfulNodes}
              relationCount={agentReadiness.relationCount}
              orphanCount={agentReadiness.orphanCount}
              unknownNodes={agentReadiness.unknownNodes}
              hubCount={agentReadiness.hubCount}
              averageDegree={agentReadiness.averageDegree}
              actionKeys={agentReadiness.actionKeys}
            />
          ) : null}

          {agentQueryRecipes.length > 0 ? (
            <AgentQueryRecipesPanel
              recipes={agentQueryRecipes}
              projectEntrypoint={agentProjectEntrypoint}
              entrypoints={agentEntrypoints}
              playbooks={agentPlaybooks}
              graphDbQueryPack={agentGraphDbQueryPack}
              traversalStrategies={agentTraversalStrategies}
              guardrails={agentGuardrails}
            />
          ) : null}

          {/* kind 분포 */}
          <Panel
            title={t("kindPanelTitle")}
            subtitle={t("kindPanelSubtitle", {
              nodes: totalNodes,
              edges: totalEdges,
            })}
          >
            <ul className="space-y-2">
              {kindRows.map(({ kind, count }) => {
                const pct = kindMax > 0 ? Math.round((count / kindMax) * 100) : 0;
                // share-of-total — bar 의 시각 정보가 *kindMax 대비* 라 사용자
                // 가 "전체 중 비중" 을 따로 인지 못 함. raw count 옆에 share
                // (`{count} · {share}%`) 를 monospace 로 같이 노출 — 디자인
                // 헌장의 무채색 quaternary 톤 유지.
                const share =
                  totalNodes > 0 ? Math.round((count / totalNodes) * 100) : 0;
                return (
                  <li key={kind} className="text-[12px]">
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="text-[color:var(--color-text-secondary)]">
                        {kindLabel(kind)}
                      </span>
                      <span className="font-mono text-[10px] tabular-nums text-[color:var(--color-text-quaternary)]">
                        {count} · {share}%
                      </span>
                    </div>
                    <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-[color:var(--color-overlay-2)]">
                      <div
                        className="h-full rounded-full"
                        style={{
                          width: `${pct}%`,
                          backgroundColor:
                            kind === "unknown"
                              ? UNKNOWN_TONE.strokeStrong
                              : kind === "project"
                                ? "rgba(159,170,235,0.65)"
                                : "rgba(159,170,235,0.40)",
                        }}
                      />
                    </div>
                  </li>
                );
              })}
            </ul>
          </Panel>

          {/* edge type 분포 — Cut A 후 /ontology/relations 의 분포 패널을
              여기로 흡수. 의미 관계 type 비율 (belongs_to / implements /
              contains / uses / depends_on 등). cross-project edge 비율은
              별도 카드 대신 이 패널 상단 caption 으로 fold — kind 분포
              다음 자리로 이동 (구조 진단 = core).  */}
          {edgeTypeRows.length > 0 ? (
            <Panel
              title={t("edgeTypePanelTitle")}
              subtitle={t("edgeTypePanelSubtitle", { count: totalEdges })}
            >
              {crossProjectEdgeCount > 0 ? (
                <p
                  className="mb-3 text-[11px] leading-5 text-[color:var(--color-text-tertiary)]"
                  data-testid="insights-cross-project-inline"
                >
                  {t("edgeTypeCrossProjectInline", {
                    count: crossProjectEdgeCount,
                    total: totalEdges,
                    pct:
                      totalEdges > 0
                        ? Math.round((crossProjectEdgeCount / totalEdges) * 1000) / 10
                        : 0,
                  })}
                </p>
              ) : null}
              <ul className="space-y-1.5" data-testid="insights-edge-type-rows">
                {edgeTypeRows.map(({ type, count }) => {
                  const pct = edgeTypeMax > 0 ? Math.round((count / edgeTypeMax) * 100) : 0;
                  const share =
                    totalEdges > 0 ? Math.round((count / totalEdges) * 100) : 0;
                  return (
                    <li
                      key={type}
                      className="text-[12px]"
                      data-testid="insights-edge-type-row"
                      data-edge-type={type}
                    >
                      <div className="flex items-baseline justify-between gap-2 px-1">
                        {/* 영문 코드 (contains / related_to) 노출 안 함 — 한글
                            라벨이면 충분, 비개발자에게 코드명은 noise. */}
                        <span className="min-w-0 truncate text-[color:var(--color-text-secondary)]">
                          {edgeTypeLabel(type)}
                        </span>
                        <span className="font-mono text-[10px] tabular-nums text-[color:var(--color-text-quaternary)]">
                          {count} · {share}%
                        </span>
                      </div>
                      <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-[color:var(--color-overlay-2)]">
                        <div
                          className="h-full rounded-full"
                          style={{
                            width: `${pct}%`,
                            backgroundColor: "rgba(159,170,235,0.45)",
                          }}
                        />
                      </div>
                    </li>
                  );
                })}
              </ul>
            </Panel>
          ) : null}

          {domainCoupling && domainCoupling.domainCount > 0 ? (
            <Panel
              title={t("domainCouplingPanelTitle")}
              subtitle={t("domainCouplingPanelSubtitle", {
                domains: domainCoupling.domainCount,
                cross: domainCoupling.crossDomainEdgeCount,
                assigned: domainCoupling.assignedNodeCount,
                nodes: domainCoupling.nodeCount,
              })}
            >
              <div data-testid="insights-domain-coupling">
                <div className="mb-3 flex flex-col gap-2 rounded-md border border-[color:rgba(73,190,146,0.16)] bg-[color:rgba(73,190,146,0.045)] px-2.5 py-2 sm:flex-row sm:items-center sm:justify-between">
                  <p className="break-keep text-[11px] leading-5 text-[color:var(--color-text-tertiary)]">
                    {t("domainCouplingReproduce")}
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    <CopyAgentTextButton
                      label={t("domainCouplingCopyCli")}
                      copiedLabel={t("agentCopied")}
                      text={domainCouplingCliCommand}
                      compact
                    />
                    <CopyAgentTextButton
                      label={t("domainCouplingCopyMcp")}
                      copiedLabel={t("agentCopied")}
                      text={domainCouplingMcpPayload}
                      compact
                    />
                  </div>
                </div>
                <div className="mb-3 grid grid-cols-3 gap-2">
                  {[
                    {
                      key: "cross",
                      label: t("domainCouplingMetricCross"),
                      value: domainCoupling.crossDomainEdgeCount,
                    },
                    {
                      key: "self",
                      label: t("domainCouplingMetricSelf"),
                      value: domainCoupling.selfDomainEdgeCount,
                    },
                    {
                      key: "unassigned",
                      label: t("domainCouplingMetricUnassigned"),
                      value: domainCoupling.unassignedNodeCount,
                    },
                  ].map((metric) => (
                    <div
                      key={metric.key}
                      className="min-w-0 rounded-md border border-[color:rgba(139,151,255,0.14)] bg-[color:rgba(139,151,255,0.045)] px-2 py-1.5"
                    >
                      <p className="truncate font-mono text-[9px] uppercase tracking-[0.10em] text-[color:var(--color-text-quaternary)]">
                        {metric.label}
                      </p>
                      <p className="mt-1 font-mono text-sm tabular-nums text-[color:var(--color-text-primary)]">
                        {metric.value}
                      </p>
                    </div>
                  ))}
                </div>
                {domainCoupling.connections.length > 0 ? (
                  <ol className="space-y-2" data-testid="insights-domain-coupling-rows">
                    {domainCoupling.connections.map((connection) => {
                      const strongest = connection.relationCounts[0];
                      const example = connection.examples[0];
                      const topologyPathHref =
                        strongest && example
                          ? `/topology/?mode=path&pathFrom=${encodeURIComponent(example.from)}&pathTo=${encodeURIComponent(example.to)}`
                          : null;
                      const pathCheckPacket =
                        strongest && example && topologyPathHref
                          ? formatDomainCouplingPathCheck({
                              from: example.from,
                              relationType: edgeTypeLabel(strongest.type),
                              to: example.to,
                              topologyPathHref,
                              labels: {
                                title: t("domainCouplingPathCheckTitle"),
                                source: t("domainCouplingPathCheckSource"),
                                target: t("domainCouplingPathCheckTarget"),
                                relation: t("domainCouplingPathCheckRelation"),
                                topology: t("domainCouplingPathCheckTopology"),
                                cli: t("domainCouplingPathCheckCli"),
                                mcpPlan: t("domainCouplingPathCheckMcpPlan"),
                                mcp: t("domainCouplingPathCheckMcp"),
                                evidenceContract: t(
                                  "domainCouplingPathCheckEvidenceContract",
                                ),
                              },
                            })
                          : null;
                      return (
                        <li
                          key={`${connection.from.id}->${connection.to.id}`}
                          className="rounded-md border border-[color:var(--color-border-soft)] bg-[color:rgba(255,255,255,0.035)] px-2.5 py-2"
                          data-testid="insights-domain-coupling-row"
                        >
                          <div className="flex min-w-0 items-center gap-2">
                            <Link
                              href={buildOntologyNodeHref(connection.from.id)}
                              className="min-w-0 flex-1 truncate text-[12px] text-[color:var(--color-text-primary)] underline-offset-2 hover:underline"
                            >
                              {connection.from.title}
                            </Link>
                            <span className="shrink-0 font-mono text-[10px] text-[color:var(--color-text-quaternary)]">
                              →
                            </span>
                            <Link
                              href={buildOntologyNodeHref(connection.to.id)}
                              className="min-w-0 flex-1 truncate text-[12px] text-[color:var(--color-text-primary)] underline-offset-2 hover:underline"
                            >
                              {connection.to.title}
                            </Link>
                            <span className="shrink-0 rounded border border-[color:rgba(139,151,255,0.18)] bg-[color:rgba(139,151,255,0.06)] px-1.5 py-0.5 font-mono text-[10px] tabular-nums text-[color:var(--color-text-secondary)]">
                              {connection.count}
                            </span>
                          </div>
                          <div className="mt-2 flex flex-wrap gap-1">
                            {connection.relationCounts.map((row) => (
                              <span
                                key={row.type}
                                className="rounded border border-[color:rgba(139,151,255,0.14)] bg-[color:rgba(139,151,255,0.045)] px-1.5 py-0.5 text-[10px] text-[color:var(--color-text-tertiary)]"
                              >
                                {edgeTypeLabel(row.type)} {row.count}
                              </span>
                            ))}
                          </div>
                          {strongest && example ? (
                            <div className="mt-2 flex min-w-0 items-center gap-2">
                              <p className="min-w-0 flex-1 truncate font-mono text-[10px] text-[color:var(--color-text-quaternary)]">
                                {t("domainCouplingExample", {
                                  from: example.from,
                                  type: edgeTypeLabel(strongest.type),
                                  to: example.to,
                                })}
                              </p>
                              {topologyPathHref ? (
                                <Link
                                  href={topologyPathHref}
                                  className="shrink-0 font-mono text-[9px] uppercase tracking-[0.08em] text-[color:var(--color-accent)] hover:underline"
                                >
                                  {t("domainCouplingOpenPath")}
                                </Link>
                              ) : null}
                              {pathCheckPacket ? (
                                <CopyAgentTextButton
                                  label={t("domainCouplingCopyPathCheck")}
                                  copiedLabel={t("agentCopied")}
                                  text={pathCheckPacket}
                                  compact
                                />
                              ) : null}
                            </div>
                          ) : null}
                        </li>
                      );
                    })}
                  </ol>
                ) : (
                  <p className="text-[12px] leading-5 text-[color:var(--color-text-tertiary)]">
                    {t("domainCouplingEmpty")}
                  </p>
                )}
              </div>
            </Panel>
          ) : null}

          {/* 프로젝트별 분포 — 어느 프로젝트가 가장 많은 도메인/기능/요소를
              가진지 시각 확인. document / project 메타 kind 제외 (4 kind
              합계). */}
          {projectRows.length > 0 ? (
            <Panel
              title={t("projectPanelTitle")}
              subtitle={t("projectPanelSubtitle", { count: projectRows.length })}
            >
              <ul className="space-y-1.5" data-testid="insights-project-rows">
                {projectRows.slice(0, 12).map(({ project, total }) => {
                  const pct = projectMax > 0 ? Math.round((total / projectMax) * 100) : 0;
                  return (
                    <li
                      key={project}
                      className="text-[12px]"
                      data-testid="insights-project-row"
                      data-project={project}
                    >
                      <div className="flex items-baseline justify-between gap-2 px-1">
                        <span className="min-w-0 truncate font-mono text-[11px] text-[color:var(--color-text-secondary)]">
                          {project}
                        </span>
                        <span className="font-mono text-[10px] tabular-nums text-[color:var(--color-text-quaternary)]">
                          {total}
                        </span>
                      </div>
                      <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-[color:var(--color-overlay-2)]">
                        <div
                          className="h-full rounded-full"
                          style={{
                            width: `${pct}%`,
                            backgroundColor: "rgba(159,170,235,0.55)",
                          }}
                        />
                      </div>
                    </li>
                  );
                })}
              </ul>
            </Panel>
          ) : null}

          {/* 허브 노드 — degree 상위 */}
          <Panel title={t("hubsPanelTitle")} subtitle={t("hubsPanelSubtitle")}>
            {topHubs.length === 0 ? (
              <p className="text-[12px] text-[color:var(--color-text-tertiary)]">{t("hubsEmpty")}</p>
            ) : (
              <ol className="space-y-1">
                {topHubs.map(({ node, degree }, idx) => (
                  <li key={node.id}>
                    <Link
                      href={buildOntologyNodeHref(node.id)}
                      className={ROW_BASE_CLASS}
                      style={(() => {
                        const accent = rowAccentColor(node);
                        return accent ? { borderLeft: `3px solid ${accent}` } : undefined;
                      })()}
                    >
                      <span className="w-5 shrink-0 font-mono text-[10px] text-[color:var(--color-text-quaternary)]">
                        {idx + 1}
                      </span>
                      <span className="inline-flex shrink-0 items-center rounded-full border border-[color:var(--color-overlay-3)] bg-[color:var(--color-overlay-1)] px-1.5 py-[1px] font-mono text-[9px] uppercase tracking-[0.10em] text-[color:var(--color-text-quaternary)]">
                        {kindLabel(node.kind)}
                      </span>
                      <span className="min-w-0 flex-1 truncate text-[color:var(--color-text-primary)]">
                        {node.title}
                      </span>
                      <span className="shrink-0 font-mono text-[10px] tabular-nums text-[color:var(--color-text-tertiary)]">
                        {degree}
                      </span>
                    </Link>
                  </li>
                ))}
              </ol>
            )}
            {hubRanking.length > topHubs.length ? (
              <p className="mt-2 font-mono text-[10px] uppercase tracking-[0.10em] text-[color:var(--color-text-quaternary)]">
                {t("hubsTruncated", {
                  shown: topHubs.length,
                  total: hubRanking.length,
                })}
              </p>
            ) : null}
          </Panel>

          {/* 최근 노드 — vault sentinel mode 라 timestamp 없이 chip / 제목만. */}
          <Panel
            title={t("recentPanelTitle")}
            subtitle={t("recentSubtitle", { count: recent.length })}
          >
            <ol className="space-y-1">
              {recent.map((node) => (
                <li key={node.id}>
                  <Link
                    href={buildOntologyNodeHref(node.id)}
                    className="flex items-center gap-2 rounded-md border border-[color:var(--color-border-soft)] bg-[color:var(--color-overlay-1)] px-2.5 py-1.5 text-[12px] transition-colors hover:border-[color:rgba(94,106,210,0.32)]"
                  >
                    <span className="inline-flex shrink-0 items-center rounded-full border border-[color:var(--color-overlay-3)] bg-[color:var(--color-overlay-1)] px-1.5 py-[1px] font-mono text-[9px] uppercase tracking-[0.10em] text-[color:var(--color-text-quaternary)]">
                      {kindLabel(node.kind)}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-[color:var(--color-text-primary)]">
                      {node.title}
                    </span>
                  </Link>
                </li>
              ))}
            </ol>
          </Panel>

          {/* 미연결 노드 — 0 개면 panel 자체 hide (모두 트리에 연결됨이 default 라
              빈 카드로 자리 차지할 가치 없음). orphan 가 있을 때만 amber 톤 강조. */}
          {orphans.length > 0 ? (
            <Panel
              title={t("orphansPanelTitle")}
              subtitle={t("orphansPanelSubtitle", { count: orphans.length })}
              accent="amber"
            >
              <ul className="space-y-1">
                {orphans.slice(0, 10).map((node) => {
                  const actions = buildInsightsOrphanNodeActions(node);
                  const repairPacket = formatInsightsOrphanRepairPacket({
                    actions,
                    labels: {
                      title: t("orphansRepairPacketTitle"),
                      node: t("orphansRepairPacketNode"),
                      kind: t("orphansRepairPacketKind"),
                      ontology: t("orphansRepairPacketOntology"),
                      topology: t("orphansRepairPacketTopology"),
                      builder: t("orphansRepairPacketBuilder"),
                      agentChecks: t("orphansRepairPacketAgentChecks"),
                      nextSteps: t("orphansRepairPacketNextSteps"),
                      inspectNode: t("orphansRepairPacketInspectNode"),
                      chooseOwner: t("orphansRepairPacketChooseOwner"),
                      preflightRelation: t("orphansRepairPacketPreflightRelation"),
                      verifyHealth: t("orphansRepairPacketVerifyHealth"),
                      syncGate: t("orphansRepairPacketSyncGate"),
                    },
                    node,
                  });
                  const repairMcpPacket = formatInsightsOrphanRepairMcpPacket({
                    labels: {
                      title: t("orphansRepairMcpPacketTitle"),
                      inspectNode: t("orphansRepairMcpPacketInspectNode"),
                      preflightRelation: t(
                        "orphansRepairMcpPacketPreflightRelation",
                      ),
                      verifyHealth: t("orphansRepairMcpPacketVerifyHealth"),
                      syncGate: t("orphansRepairMcpPacketSyncGate"),
                    },
                    node,
                  });
                  return (
                    <li
                      key={node.id}
                      className="rounded-md border border-[color:rgba(255,179,71,0.18)] bg-[color:rgba(255,179,71,0.04)] px-2.5 py-1.5 text-[12px] transition-[border-color,background-color] duration-200 hover:border-[color:rgba(255,179,71,0.40)] hover:bg-[color:rgba(255,179,71,0.08)]"
                    >
                      <div className="flex items-center gap-2">
                        <span className="inline-flex shrink-0 items-center rounded-full border border-[color:rgba(255,179,71,0.30)] bg-[color:rgba(255,179,71,0.08)] px-1.5 py-[1px] font-mono text-[9px] uppercase tracking-[0.10em] text-[color:rgba(238,198,128,0.95)]">
                          {kindLabel(node.kind)}
                        </span>
                        <Link
                          href={actions.ontologyHref}
                          className="min-w-0 flex-1 truncate text-[color:var(--color-text-primary)] underline-offset-2 hover:underline"
                        >
                          {node.title}
                        </Link>
                      </div>
                      <div className="mt-2 flex flex-wrap gap-1.5 pl-0 sm:pl-[68px]">
                        <Link
                          href={actions.topologyHref}
                          className="rounded border border-[color:rgba(255,179,71,0.18)] bg-[color:rgba(255,179,71,0.045)] px-1.5 py-0.5 text-[10px] text-[color:var(--color-text-tertiary)] transition-colors hover:border-[color:rgba(255,179,71,0.34)] hover:text-[color:var(--color-text-primary)]"
                        >
                          {t("orphansOpenTopology")}
                        </Link>
                        <Link
                          href={actions.builderHref}
                          className="rounded border border-[color:rgba(139,151,255,0.16)] bg-[color:rgba(139,151,255,0.045)] px-1.5 py-0.5 text-[10px] text-[color:var(--color-text-tertiary)] transition-colors hover:border-[color:rgba(139,151,255,0.32)] hover:text-[color:var(--color-text-primary)]"
                        >
                          {t("orphansFocusBuilder")}
                        </Link>
                        <CopyAgentTextButton
                          label={t("orphansCopyRepairPacket")}
                          copiedLabel={t("agentCopied")}
                          text={repairPacket}
                          compact
                        />
                        <CopyAgentTextButton
                          label={t("orphansCopyMcpRepairPacket")}
                          copiedLabel={t("agentCopied")}
                          text={repairMcpPacket}
                          compact
                        />
                      </div>
                    </li>
                  );
                })}
                {orphans.length > 10 ? (
                  <li className="font-mono text-[10px] text-[color:var(--color-text-quaternary)]">
                    {t("orphansMore", { count: orphans.length - 10 })}
                  </li>
                ) : null}
              </ul>
            </Panel>
          ) : null}
        </div>
      )}
      </main>
    </div>
  );
}

function InsightsCollaboratorBriefPanel({
  brief,
  impactCliCheckCommand,
  impactMcpCheckPayload,
}: {
  brief: InsightsCollaboratorBrief;
  impactCliCheckCommand: string;
  impactMcpCheckPayload: string;
}) {
  const t = useTranslations("ontologyPages.insights");
  const metricLabels = {
    nodes: t("collaboratorMetricNodes"),
    relations: t("collaboratorMetricRelations"),
    domains: t("collaboratorMetricDomains"),
    crossDomain: t("collaboratorMetricCrossDomain"),
    orphans: t("collaboratorMetricOrphans"),
  } satisfies Record<string, string>;
  const focusLabel =
    brief.reviewFocus === "resolve_orphans"
      ? t("collaboratorFocusResolveOrphans")
      : brief.reviewFocus === "trace_impact"
        ? t("collaboratorFocusTraceImpact")
        : t("collaboratorFocusAlignVocabulary");
  const reviewQuestionLabels = {
    alignVocabularyQuestions: [
      t("collaboratorQuestionAlignReuse"),
      t("collaboratorQuestionAlignRename"),
      t("collaboratorQuestionAlignOwner"),
    ],
    traceImpactQuestions: [
      t("collaboratorQuestionImpactDomains"),
      t("collaboratorQuestionImpactMessaging"),
      t("collaboratorQuestionImpactBoundary"),
    ],
    resolveOrphansQuestions: [
      t("collaboratorQuestionOrphanOwner"),
      t("collaboratorQuestionOrphanContainer"),
      t("collaboratorQuestionOrphanAction"),
    ],
  };
  const decisionLaneLabels = {
    decisionAlignOwner: t("collaboratorDecisionAlignOwner"),
    decisionAlignExpected: t("collaboratorDecisionAlignExpected"),
    decisionAlignNextStep: t("collaboratorDecisionAlignNextStep"),
    decisionImpactOwner: t("collaboratorDecisionImpactOwner"),
    decisionImpactExpected: t("collaboratorDecisionImpactExpected"),
    decisionImpactNextStep: t("collaboratorDecisionImpactNextStep"),
    decisionOrphanOwner: t("collaboratorDecisionOrphanOwner"),
    decisionOrphanExpected: t("collaboratorDecisionOrphanExpected"),
    decisionOrphanNextStep: t("collaboratorDecisionOrphanNextStep"),
    decisionRecord: t("collaboratorDecisionRecord"),
    decisionRecordDecision: t("collaboratorDecisionRecordDecision"),
    decisionRecordOwner: t("collaboratorDecisionRecordOwner"),
    decisionRecordEvidence: t("collaboratorDecisionRecordEvidence"),
    decisionRecordFollowUp: t("collaboratorDecisionRecordFollowUp"),
  };
  const reviewQuestions = reviewQuestionsForFocus(
    brief.reviewFocus,
    reviewQuestionLabels,
  );
  const decisionOwner = decisionLaneLabel(brief.reviewFocus, decisionLaneLabels, "owner");
  const decisionExpected = decisionLaneLabel(
    brief.reviewFocus,
    decisionLaneLabels,
    "expected",
  );
  const decisionNextStep = decisionLaneLabel(
    brief.reviewFocus,
    decisionLaneLabels,
    "nextStep",
  );
  const decisionHandoffLabel = brief.decisionHandoff
    ? formatDecisionHandoffLabel(brief.decisionHandoff, {
        builder: t("collaboratorHandoffBuilder"),
        impactHandoffPath: t("collaboratorImpactHandoffPath"),
        ontology: t("collaboratorHandoffOntology"),
        topology: t("collaboratorHandoffTopologyShort"),
        topologyFocus: t("collaboratorHandoffTopologyFocus"),
        topologyHealth: t("collaboratorHandoffTopologyHealth"),
      })
    : null;
  const collaboratorCliCheckCommand =
    "oh-my-ontology workspace-brief [vault] --limit 5";
  const collaboratorMcpCheckPayload = 'query_ontology({"operation":"workspace_brief","limit":5})';
  const copyTextValue = formatInsightsCollaboratorBrief({
    brief,
    labels: {
      title: t("collaboratorInsightsTitle"),
      summary: t("collaboratorInsightsSubtitle"),
      nodes: metricLabels.nodes,
      relations: metricLabels.relations,
      domains: metricLabels.domains,
      crossDomain: metricLabels.crossDomain,
      orphans: metricLabels.orphans,
      topHubs: t("collaboratorTopHubs"),
      reviewVocabulary: t("collaboratorReviewVocabulary"),
      vocabularyTerm: t("collaboratorVocabularyTerm"),
      vocabularyWhy: t("collaboratorVocabularyWhy"),
      vocabularyReuse: t("collaboratorVocabularyReuse"),
      vocabularyReuseAction: t("collaboratorVocabularyReuseAction"),
      reviewFocus: t("collaboratorReviewFocus"),
      focusAlignVocabulary: t("collaboratorFocusAlignVocabulary"),
      focusTraceImpact: t("collaboratorFocusTraceImpact"),
      focusResolveOrphans: t("collaboratorFocusResolveOrphans"),
      decisionLane: t("collaboratorDecisionLane"),
      decisionOwner: t("collaboratorDecisionOwner"),
      decisionExpected: t("collaboratorDecisionExpected"),
      decisionNextStep: t("collaboratorDecisionNextStep"),
      decisionGraphHandoff: t("collaboratorDecisionGraphHandoff"),
      ...decisionLaneLabels,
      meetingAgenda: t("collaboratorMeetingAgenda"),
      meetingAgendaDecision: t("collaboratorMeetingAgendaDecision"),
      meetingAgendaEvidence: t("collaboratorMeetingAgendaEvidence"),
      meetingAgendaAction: t("collaboratorMeetingAgendaAction"),
      reviewQuestions: t("collaboratorReviewQuestions"),
      ...reviewQuestionLabels,
      noHubs: t("collaboratorNoHubs"),
      hubHandoff: t("collaboratorHubHandoff"),
      impactHandoff: t("collaboratorImpactHandoff"),
      impactHandoffExample: t("collaboratorImpactHandoffExample"),
      impactHandoffPath: t("collaboratorImpactHandoffPath"),
      openQuestionHandoff: t("collaboratorOpenQuestionHandoff"),
      ontology: t("collaboratorHandoffOntology"),
      builder: t("collaboratorHandoffBuilder"),
      handoff: t("collaboratorHandoff"),
      insights: t("collaboratorHandoffInsights"),
      topology: t("collaboratorHandoffTopology"),
      topologyFocus: t("collaboratorHandoffTopologyFocus"),
      topologyHealth: t("collaboratorHandoffTopologyHealth"),
      agentCheck: t("collaboratorHandoffAgentCheck"),
      agentCliCheck: t("collaboratorHandoffCliCheck"),
      agentMcpCheck: t("collaboratorHandoffMcpCheck"),
      impactCliCheck: t("collaboratorHandoffImpactCliCheck"),
      impactMcpCheck: t("collaboratorHandoffImpactMcpCheck"),
    },
    handoff: {
      insightsUrl:
        typeof window === "undefined" ? "/ontology/insights/" : window.location.href,
      topologyUrl: "/topology/?mode=health",
      agentCheckCommand: collaboratorCliCheckCommand,
      agentMcpCheckPayload: collaboratorMcpCheckPayload,
      impactCliCheckCommand,
      impactMcpCheckPayload,
    },
  });
  const vocabularyReviewText = formatInsightsVocabularyReview({
    brief,
    labels: {
      title: t("collaboratorInsightsTitle"),
      summary: t("collaboratorInsightsSubtitle"),
      nodes: metricLabels.nodes,
      relations: metricLabels.relations,
      domains: metricLabels.domains,
      crossDomain: metricLabels.crossDomain,
      orphans: metricLabels.orphans,
      topHubs: t("collaboratorTopHubs"),
      reviewVocabulary: t("collaboratorReviewVocabulary"),
      vocabularyTerm: t("collaboratorVocabularyTerm"),
      vocabularyWhy: t("collaboratorVocabularyWhy"),
      vocabularyReuse: t("collaboratorVocabularyReuse"),
      vocabularyReuseAction: t("collaboratorVocabularyReuseAction"),
      reviewFocus: t("collaboratorReviewFocus"),
      focusAlignVocabulary: t("collaboratorFocusAlignVocabulary"),
      focusTraceImpact: t("collaboratorFocusTraceImpact"),
      focusResolveOrphans: t("collaboratorFocusResolveOrphans"),
      decisionLane: t("collaboratorDecisionLane"),
      decisionOwner: t("collaboratorDecisionOwner"),
      decisionExpected: t("collaboratorDecisionExpected"),
      decisionNextStep: t("collaboratorDecisionNextStep"),
      decisionGraphHandoff: t("collaboratorDecisionGraphHandoff"),
      ...decisionLaneLabels,
      meetingAgenda: t("collaboratorMeetingAgenda"),
      meetingAgendaDecision: t("collaboratorMeetingAgendaDecision"),
      meetingAgendaEvidence: t("collaboratorMeetingAgendaEvidence"),
      meetingAgendaAction: t("collaboratorMeetingAgendaAction"),
      reviewQuestions: t("collaboratorReviewQuestions"),
      ...reviewQuestionLabels,
      noHubs: t("collaboratorNoHubs"),
      hubHandoff: t("collaboratorHubHandoff"),
      impactHandoff: t("collaboratorImpactHandoff"),
      impactHandoffExample: t("collaboratorImpactHandoffExample"),
      impactHandoffPath: t("collaboratorImpactHandoffPath"),
      openQuestionHandoff: t("collaboratorOpenQuestionHandoff"),
      ontology: t("collaboratorHandoffOntology"),
      builder: t("collaboratorHandoffBuilder"),
      handoff: t("collaboratorHandoff"),
      insights: t("collaboratorHandoffInsights"),
      topology: t("collaboratorHandoffTopology"),
      topologyFocus: t("collaboratorHandoffTopologyFocus"),
      topologyHealth: t("collaboratorHandoffTopologyHealth"),
      agentCheck: t("collaboratorHandoffAgentCheck"),
      agentCliCheck: t("collaboratorHandoffCliCheck"),
      agentMcpCheck: t("collaboratorHandoffMcpCheck"),
      impactCliCheck: t("collaboratorHandoffImpactCliCheck"),
      impactMcpCheck: t("collaboratorHandoffImpactMcpCheck"),
    },
  });

  return (
    <section
      className="min-w-0 rounded-2xl border border-[color:rgba(139,151,255,0.22)] bg-[color:rgba(139,151,255,0.055)] px-5 py-4 md:col-span-2"
      data-testid="insights-collaborator-brief"
    >
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-[color:rgba(184,191,255,0.92)]">
            {t("collaboratorInsightsTitle")}
          </p>
          <p className="mt-1 max-w-3xl break-keep text-[12px] leading-5 text-[color:var(--color-text-tertiary)]">
            {t("collaboratorInsightsSubtitle")}
          </p>
        </div>
        <div className="flex flex-wrap gap-1.5">
          <CopyAgentTextButton
            label={t("collaboratorCopyBrief")}
            copiedLabel={t("agentCopied")}
            text={copyTextValue}
            compact
          />
          <CopyAgentTextButton
            label={t("collaboratorCopyVocabulary")}
            copiedLabel={t("agentCopied")}
            text={vocabularyReviewText}
            compact
          />
          <CopyAgentTextButton
            label={t("collaboratorCopyCliCheck")}
            copiedLabel={t("agentCopied")}
            text={collaboratorCliCheckCommand}
            compact
          />
          <CopyAgentTextButton
            label={t("collaboratorCopyMcpCheck")}
            copiedLabel={t("agentCopied")}
            text={collaboratorMcpCheckPayload}
            compact
          />
        </div>
      </div>
      <div className="mt-3 grid gap-2 md:grid-cols-5">
        {brief.summaryMetrics.map((metric) => (
          <div
            key={metric.key}
            className="rounded-md border border-[color:rgba(139,151,255,0.14)] bg-[color:rgba(3,7,18,0.12)] px-2.5 py-2"
          >
            <p className="truncate font-mono text-[9px] uppercase tracking-[0.10em] text-[color:var(--color-text-quaternary)]">
              {metricLabels[metric.key]}
            </p>
            <p className="mt-1 font-mono text-sm tabular-nums text-[color:var(--color-text-primary)]">
              {metric.value}
            </p>
          </div>
        ))}
      </div>
      <div className="mt-3 grid gap-2 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <div className="rounded-md border border-[color:rgba(139,151,255,0.14)] bg-[color:rgba(255,255,255,0.035)] px-3 py-2.5">
          <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-[color:var(--color-text-quaternary)]">
            {t("collaboratorTopHubs")}
          </p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {brief.topHubs.length > 0 ? (
              brief.topHubs.map((hub) => (
                <span
                  key={hub.id ?? hub.title}
                  className="flex max-w-full min-w-0 flex-wrap items-center gap-1 rounded border border-[color:rgba(139,151,255,0.16)] bg-[color:rgba(139,151,255,0.055)] px-2 py-1 text-[11px] text-[color:var(--color-text-secondary)]"
                >
                  <span className="max-w-[18rem] truncate">{hub.title}</span>
                  <span className="font-mono text-[9px] uppercase tracking-[0.08em] text-[color:var(--color-text-quaternary)]">
                    {hub.kind} · {hub.degree}
                  </span>
                  {hub.ontologyHref ? (
                    <Link
                      href={hub.ontologyHref}
                      className="font-mono text-[9px] uppercase tracking-[0.08em] text-[color:var(--color-accent)] hover:underline"
                    >
                      {t("collaboratorHandoffOntology")}
                    </Link>
                  ) : null}
                  {hub.topologyHref ? (
                    <Link
                      href={hub.topologyHref}
                      className="font-mono text-[9px] uppercase tracking-[0.08em] text-[color:var(--color-accent)] hover:underline"
                    >
                      {t("collaboratorHandoffTopologyFocus")}
                    </Link>
                  ) : null}
                  {hub.builderHref ? (
                    <Link
                      href={hub.builderHref}
                      className="font-mono text-[9px] uppercase tracking-[0.08em] text-[color:var(--color-accent)] hover:underline"
                    >
                      {t("collaboratorHandoffBuilder")}
                    </Link>
                  ) : null}
                </span>
              ))
            ) : (
              <span className="text-[11px] text-[color:var(--color-text-tertiary)]">
                {t("collaboratorNoHubs")}
              </span>
            )}
          </div>
        </div>
        <div className="rounded-md border border-[color:rgba(73,190,146,0.18)] bg-[color:rgba(73,190,146,0.045)] px-3 py-2.5">
          <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-[color:rgba(151,230,198,0.92)]">
            {t("collaboratorReviewFocus")}
          </p>
          <p className="mt-2 break-keep text-[12px] leading-5 text-[color:var(--color-text-secondary)]">
            {focusLabel}
          </p>
          <dl
            className="mt-2 grid gap-1.5 rounded border border-[color:rgba(73,190,146,0.14)] bg-[color:rgba(255,255,255,0.03)] px-2.5 py-2"
            data-testid="insights-collaborator-decision-lane"
          >
            <div className="min-w-0">
              <dt className="font-mono text-[9px] uppercase tracking-[0.10em] text-[color:var(--color-text-quaternary)]">
                {t("collaboratorDecisionOwner")}
              </dt>
              <dd className="mt-0.5 break-keep text-[11px] leading-4 text-[color:var(--color-text-secondary)]">
                {decisionOwner}
              </dd>
            </div>
            <div className="min-w-0">
              <dt className="font-mono text-[9px] uppercase tracking-[0.10em] text-[color:var(--color-text-quaternary)]">
                {t("collaboratorDecisionExpected")}
              </dt>
              <dd className="mt-0.5 break-keep text-[11px] leading-4 text-[color:var(--color-text-secondary)]">
                {decisionExpected}
              </dd>
            </div>
            <div className="min-w-0">
              <dt className="font-mono text-[9px] uppercase tracking-[0.10em] text-[color:var(--color-text-quaternary)]">
                {t("collaboratorDecisionNextStep")}
              </dt>
              <dd className="mt-0.5 break-keep text-[11px] leading-4 text-[color:var(--color-text-secondary)]">
                {decisionNextStep}
              </dd>
            </div>
            {brief.decisionHandoff && decisionHandoffLabel ? (
              <div className="min-w-0 border-t border-[color:rgba(73,190,146,0.12)] pt-1.5">
                <dt className="font-mono text-[9px] uppercase tracking-[0.10em] text-[color:var(--color-text-quaternary)]">
                  {t("collaboratorDecisionGraphHandoff")}
                </dt>
                <dd className="mt-1 min-w-0">
                  <Link
                    href={brief.decisionHandoff.href}
                    className="inline-flex max-w-full items-center rounded border border-[color:rgba(73,190,146,0.22)] bg-[color:rgba(73,190,146,0.07)] px-2 py-1 font-mono text-[9px] uppercase tracking-[0.08em] text-[color:var(--color-accent)] hover:underline"
                  >
                    <span className="truncate">{decisionHandoffLabel}</span>
                  </Link>
                </dd>
              </div>
            ) : null}
          </dl>
          <dl
            className="mt-2 grid gap-1.5 rounded border border-[color:rgba(73,190,146,0.14)] bg-[color:rgba(255,255,255,0.025)] px-2.5 py-2"
            data-testid="insights-collaborator-decision-record"
          >
            <div className="min-w-0">
              <dt className="font-mono text-[9px] uppercase tracking-[0.10em] text-[color:var(--color-text-quaternary)]">
                {t("collaboratorDecisionRecord")}
              </dt>
              <dd className="mt-0.5 break-keep text-[11px] leading-4 text-[color:var(--color-text-secondary)]">
                {decisionExpected}
              </dd>
            </div>
            <div className="grid gap-1 sm:grid-cols-3">
              <div className="min-w-0">
                <dt className="font-mono text-[9px] uppercase tracking-[0.10em] text-[color:var(--color-text-quaternary)]">
                  {t("collaboratorDecisionRecordOwner")}
                </dt>
                <dd className="mt-0.5 break-keep text-[10.5px] leading-4 text-[color:var(--color-text-tertiary)]">
                  {decisionOwner}
                </dd>
              </div>
              <div className="min-w-0">
                <dt className="font-mono text-[9px] uppercase tracking-[0.10em] text-[color:var(--color-text-quaternary)]">
                  {t("collaboratorDecisionRecordEvidence")}
                </dt>
                <dd className="mt-0.5 truncate text-[10.5px] leading-4 text-[color:var(--color-text-tertiary)]">
                  {decisionHandoffLabel ?? focusLabel}
                </dd>
              </div>
              <div className="min-w-0">
                <dt className="font-mono text-[9px] uppercase tracking-[0.10em] text-[color:var(--color-text-quaternary)]">
                  {t("collaboratorDecisionRecordFollowUp")}
                </dt>
                <dd className="mt-0.5 break-keep text-[10.5px] leading-4 text-[color:var(--color-text-tertiary)]">
                  {decisionNextStep}
                </dd>
              </div>
            </div>
          </dl>
          <div
            className="mt-2 rounded border border-[color:rgba(139,151,255,0.16)] bg-[color:rgba(139,151,255,0.045)] px-2.5 py-2"
            data-testid="insights-collaborator-meeting-agenda"
          >
            <p className="font-mono text-[9px] uppercase tracking-[0.10em] text-[color:var(--color-text-quaternary)]">
              {t("collaboratorMeetingAgenda")}
            </p>
            <ol className="mt-1.5 space-y-1">
              {[
                {
                  label: t("collaboratorMeetingAgendaDecision"),
                  value: decisionExpected,
                },
                {
                  label: t("collaboratorMeetingAgendaEvidence"),
                  value: decisionHandoffLabel ?? focusLabel,
                },
                {
                  label: t("collaboratorMeetingAgendaAction"),
                  value: decisionNextStep,
                },
              ].map((item, index) => (
                <li
                  key={item.label}
                  className="grid grid-cols-[18px_1fr] gap-1.5 text-[10.5px] leading-4 text-[color:var(--color-text-tertiary)]"
                >
                  <span className="font-mono text-[9px] text-[color:rgba(200,210,255,0.82)]">
                    {index + 1}
                  </span>
                  <span className="break-keep">
                    <span className="text-[color:var(--color-text-secondary)]">
                      {item.label}:
                    </span>{" "}
                    {item.value}
                  </span>
                </li>
              ))}
            </ol>
          </div>
          <div className="mt-2 border-t border-[color:rgba(73,190,146,0.14)] pt-2">
            <p className="font-mono text-[9px] uppercase tracking-[0.10em] text-[color:var(--color-text-quaternary)]">
              {t("collaboratorReviewQuestions")}
            </p>
            <ul className="mt-1.5 space-y-1">
              {reviewQuestions.map((question) => (
                <li
                  key={question}
                  className="break-keep text-[11px] leading-4 text-[color:var(--color-text-tertiary)]"
                >
                  {question}
                </li>
              ))}
            </ul>
          </div>
          {brief.impactHandoffs.length > 0 ? (
            <div
              className="mt-2 border-t border-[color:rgba(73,190,146,0.14)] pt-2"
              data-testid="insights-collaborator-impact-handoffs"
            >
              <p className="font-mono text-[9px] uppercase tracking-[0.10em] text-[color:var(--color-text-quaternary)]">
                {t("collaboratorImpactHandoff")}
              </p>
              <ul className="mt-1.5 space-y-1.5">
                {brief.impactHandoffs.map((handoff) => (
                  <li
                    key={`${handoff.fromDomain}->${handoff.toDomain}`}
                    className="min-w-0 break-keep text-[11px] leading-4 text-[color:var(--color-text-tertiary)]"
                  >
                    <span className="text-[color:var(--color-text-secondary)]">
                      {handoff.fromDomain} → {handoff.toDomain}
                    </span>
                    <span className="font-mono text-[10px] text-[color:var(--color-text-quaternary)]">
                      {" "}
                      {handoff.count}
                    </span>
                    {handoff.example ? (
                      <span className="block truncate font-mono text-[10px] text-[color:var(--color-text-quaternary)]">
                        {handoff.example.from} --{handoff.example.type}--&gt;{" "}
                        {handoff.example.to}
                      </span>
                    ) : null}
                    {handoff.topologyPathHref ? (
                      <Link
                        href={handoff.topologyPathHref}
                        className="mt-1 inline-flex font-mono text-[9px] uppercase tracking-[0.08em] text-[color:var(--color-accent)] hover:underline"
                      >
                        {t("collaboratorImpactHandoffPath")}
                      </Link>
                    ) : null}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          {brief.openQuestions.length > 0 ? (
            <div
              className="mt-2 border-t border-[color:rgba(73,190,146,0.14)] pt-2"
              data-testid="insights-collaborator-open-questions"
            >
              <p className="font-mono text-[9px] uppercase tracking-[0.10em] text-[color:var(--color-text-quaternary)]">
                {t("collaboratorOpenQuestionHandoff")}
              </p>
              <ul className="mt-1.5 space-y-1.5">
                {brief.openQuestions.map((question) => (
                  <li
                    key={question.id}
                    className="min-w-0 break-keep text-[11px] leading-4 text-[color:var(--color-text-tertiary)]"
                  >
                    <span className="text-[color:var(--color-text-secondary)]">
                      {question.title}
                    </span>
                    <span className="font-mono text-[10px] text-[color:var(--color-text-quaternary)]">
                      {" "}
                      {question.kind}
                    </span>
                    <span className="ml-1.5 inline-flex flex-wrap gap-1">
                      {question.ontologyHref ? (
                        <Link
                          href={question.ontologyHref}
                          className="font-mono text-[9px] uppercase tracking-[0.08em] text-[color:var(--color-accent)] hover:underline"
                        >
                          {t("collaboratorHandoffOntology")}
                        </Link>
                      ) : null}
                      {question.topologyHref ? (
                        <Link
                          href={question.topologyHref}
                          className="font-mono text-[9px] uppercase tracking-[0.08em] text-[color:var(--color-accent)] hover:underline"
                        >
                          {t("collaboratorHandoffTopologyHealth")}
                        </Link>
                      ) : null}
                      {question.builderHref ? (
                        <Link
                          href={question.builderHref}
                          className="font-mono text-[9px] uppercase tracking-[0.08em] text-[color:var(--color-accent)] hover:underline"
                        >
                          {t("collaboratorHandoffBuilder")}
                        </Link>
                      ) : null}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      </div>
    </section>
  );
}

function Panel({
  title,
  subtitle,
  accent,
  children,
}: {
  title: string;
  subtitle?: string;
  accent?: "amber";
  children: React.ReactNode;
}) {
  const accentClass =
    accent === "amber"
      ? "border-[color:rgba(255,179,71,0.30)] bg-[color:rgba(255,179,71,0.06)]"
      : "border-[color:var(--color-divider)] bg-[color:var(--color-overlay-1)]";
  return (
    <section className={`rounded-2xl border px-5 py-4 ${accentClass}`}>
      <header className="mb-3">
        <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-[color:var(--color-text-quaternary)]">
          {title}
        </p>
        {subtitle ? (
          <p className="mt-0.5 text-[11px] text-[color:var(--color-text-tertiary)]">{subtitle}</p>
        ) : null}
      </header>
      {children}
    </section>
  );
}
