"use client";

import { useMemo } from "react";
import { useSearchParams } from "next/navigation";
import { Link, useRouter } from "@/i18n/navigation";
import { useTranslations } from "next-intl";
import {
  buildEdgeTypeRows,
  buildOntologyBuilderNodeHrefFromGraphId,
  buildOntologyHealthActionTarget,
  buildOntologyHealthSignals,
  buildOntologyNodeHref,
  classifyRelationQuality,
  summarizeAgentReadiness,
  useEdgeTypeLabel,
  type KnowledgeGraphEdge,
  type KnowledgeGraphNode,
} from "@/entities/knowledge-graph";
import {
  LiveActivityIndicator,
  useOntologyInsight,
  useVaultDocFreshnessIndex,
} from "@/features/vault-ontology";
import { useDataSourceMode } from "@/features/data-source-mode";
import { useLocalVault } from "@/features/docs-vault-local";
import { useOntologyKindLabel } from "@/entities/ontology-class";
import {
  buildOntologyTree,
  computeEdgeTypeDistribution,
  computeKindDistribution,
  rankAllByDegree,
} from "@/shared/lib/ontology-tree";
import { MountedGlobalSearch } from "@/widgets/global-search";
import { AppSettingsMenu } from "@/widgets/app-settings-menu";
import { EmptyState, TabBar } from "@/shared/ui";
import {
  DEFAULT_INSIGHTS_TAB,
  INSIGHTS_TABS,
  buildInsightsTabHref,
  parseInsightsTab,
  type InsightsTab,
} from "../lib/insights-tab-state";
import { computeDomainCapacityRows } from "../lib/domain-capacity";
import { computeCensusHealth } from "../lib/census-health";
import { buildDependsOnRows } from "../lib/depends-on-rows";
import { buildHubEgoThumbnail } from "../lib/hub-ego-thumbnail";
import { FRESHNESS_WINDOW_WEEKS, computeFreshnessSummary } from "../lib/freshness";
import { OverviewTab } from "./tabs/OverviewTab";
import { RelationsTab, type RelationHubRow } from "./tabs/RelationsTab";
import { FreshnessTab } from "./tabs/FreshnessTab";
import { InsightsHandoffRow } from "./parts/InsightsHandoffRow";

const EMPTY_NODES: KnowledgeGraphNode[] = [];
const EMPTY_EDGES: KnowledgeGraphEdge[] = [];
const HUB_DISPLAY_LIMIT = 6;
const DEPENDS_ON_DISPLAY_LIMIT = 5;
const RECENT_UPDATES_LIMIT = 8;

const HANDOFF_PAYLOAD: Record<InsightsTab, string> = {
  overview: 'query_ontology({operation:"health"}) → query_ontology({operation:"growth_plan"}) → query_ontology({operation:"maintenance_plan"})',
  relations: 'query_ontology({operation:"match_edges", type:"depends_on"}) → query_ontology({operation:"blast_radius", slug:"<hub-slug>"})',
  freshness: 'query_ontology({operation:"maintenance_plan"}) → find_orphans({}) → query_ontology({operation:"growth_plan"})',
};

/**
 * `/ontology/insights` — 그래프 인사이트, 3-tab 계기판 (RATIO-SYSTEM 최종
 * 라운드, `docs/prototypes/insights-final.html` 승인안).
 *
 * 탭1 개요 · 탭2 관계 · 탭3 신선도 + 하단 agent handoff 1행. 이전 라운드의
 * 4-tab 리더 페르소나 시스템(proof/collaboration/agent/census — reader
 * intent 프리셋, session proof strip, collaborator brief, query recipe
 * cockpit)은 승인된 최종 목업에 없어 제거됐다. 모든 숫자는 이 페이지가 이미
 * 쓰던 데이터 소스(`useOntologyInsight`, `shared/lib/ontology-tree`)에서
 * 유도 — census 공식(총 노드/엣지/도메인 수)은 토폴로지 크롬과 동일하다.
 */
export function OntologyInsightsPage() {
  const t = useTranslations("ontologyPages.insights");
  const kindLabel = useOntologyKindLabel();
  const edgeTypeLabel = useEdgeTypeLabel();
  const searchParams = useSearchParams();
  const router = useRouter();
  const tab = parseInsightsTab(searchParams.get("tab"));

  const { insight, error } = useOntologyInsight();
  const docFreshnessIndex = useVaultDocFreshnessIndex();
  const vault = useLocalVault();
  const dataSourceMode = useDataSourceMode();

  const nodes = insight?.nodes ?? EMPTY_NODES;
  const edges = insight?.edges ?? EMPTY_EDGES;
  const totalNodes = nodes.length;
  const totalEdges = edges.length;

  const kindDist = useMemo(() => computeKindDistribution(nodes), [nodes]);
  const kindRows = useMemo(
    () =>
      Array.from(kindDist.entries())
        .map(([kind, count]) => ({ kind, count }))
        .sort((a, b) => b.count - a.count),
    [kindDist],
  );
  const domainCount = kindDist.get("domain") ?? 0;

  const treeResult = useMemo(() => buildOntologyTree(nodes, edges), [nodes, edges]);
  const health = useMemo(() => computeCensusHealth(nodes, edges, treeResult), [nodes, edges, treeResult]);
  const domainRows = useMemo(() => computeDomainCapacityRows(treeResult.roots), [treeResult]);

  const edgeTypeDist = useMemo(() => computeEdgeTypeDistribution(edges), [edges]);
  const edgeTypeRows = useMemo(() => buildEdgeTypeRows(edgeTypeDist), [edgeTypeDist]);
  const agentReadiness = useMemo(() => {
    const counts = { strong: 0, supported: 0, weak: 0, review: 0 };
    for (const edge of edges) {
      counts[classifyRelationQuality(edge)] += 1;
    }
    return summarizeAgentReadiness(counts);
  }, [edges]);
  const edgeTypeSummary = useMemo(
    () => edgeTypeRows.slice(0, 4).map((r) => ({ key: r.type, label: edgeTypeLabel(r.type), count: r.count })),
    [edgeTypeRows, edgeTypeLabel],
  );
  // 수리 큐 — 분석 패널 완전 소멸 2단계 §c 로 지도 좌측 레일의 health 모드에서
  // 이관. 지도의 health 칩과 같은 entities 레벨 함수(buildOntologyHealthSignals
  // / buildOntologyHealthActionTarget) 를 재사용 — 이 페이지가 이미 쓰던
  // `nodes`/`edges`(useOntologyInsight) 만으로 계산되는 온톨로지 그래프 레벨
  // 신호만 다룬다(`/projects` 카드의 project-레벨 stale/orphan 탐지는 범위 밖 —
  // 그건 project 엔티티 전용 렌즈라 이 페이지의 온톨로지 그래프 데이터와는
  // 다른 소스다).
  const healthSignals = useMemo(() => buildOntologyHealthSignals(nodes, edges), [nodes, edges]);
  const healthQueue = useMemo(
    () => ({
      staleCount: healthSignals.stale.length,
      orphanCount: healthSignals.orphan.length,
      promotionCount: healthSignals.promotion.length,
      actionTarget: buildOntologyHealthActionTarget(healthSignals),
      builderHref: buildOntologyBuilderNodeHrefFromGraphId,
      ontologyHref: buildOntologyNodeHref,
    }),
    [healthSignals],
  );

  const dependsOnRows = useMemo(
    () => buildDependsOnRows(nodes, edges, DEPENDS_ON_DISPLAY_LIMIT),
    [nodes, edges],
  );

  const hubRanking = useMemo(() => rankAllByDegree(nodes, edges), [nodes, edges]);
  const hubs = useMemo<RelationHubRow[]>(
    () =>
      hubRanking.slice(0, HUB_DISPLAY_LIMIT).map(({ node, degree }) => ({
        id: node.id,
        title: node.title,
        kind: node.kind,
        degree,
        thumbnail: buildHubEgoThumbnail(node.id, nodes, edges),
      })),
    [hubRanking, nodes, edges],
  );

  const freshness = useMemo(
    () => computeFreshnessSummary(nodes, edges, docFreshnessIndex, new Date(), { recentLimit: RECENT_UPDATES_LIMIT }),
    [nodes, edges, docFreshnessIndex],
  );

  const setTab = (next: string) => {
    router.replace(buildInsightsTabHref(next as InsightsTab), { scroll: false });
  };

  const heroLabels = {
    concepts: t("heroConcepts"),
    relations: t("heroRelations"),
    health: t("heroHealth"),
    orphan: t("healthOrphan"),
    cycle: t("healthCycle"),
    domainMembership: t("healthDomainMembership"),
    evidenceLinked: t("healthEvidenceLinked"),
  };
  const overviewLabels = {
    ...heroLabels,
    kindCensusTitle: t("kindCensusTitle"),
    domainCapacityTitle: t("domainCapacityTitle"),
    noDomains: t("noDomains"),
    kindGlyphCaption: t("kindGlyphCaption"),
    domainCapacityCaption: t("domainCapacityCaption"),
    capabilityUnit: kindLabel("capability"),
    elementUnit: kindLabel("element"),
  };
  const relationsLabels = {
    relationTypesTitle: t("relationTypesTitle"),
    topDependsOnTitle: t("topDependsOnTitle"),
    noDependsOn: t("noDependsOn"),
    hubsTitle: t("hubsTitle"),
    noHubs: t("noHubs"),
    connectionsUnit: t("connectionsUnit"),
    hubTruncated: (shown: number, total: number) => t("hubTruncated", { shown, total }),
    hubThumbnailCaption: t("hubThumbnailCaption"),
    agentReadinessTitle: t("agentReadinessTitle"),
    agentReadinessReady: t("agentReadinessReady"),
    agentReadinessPreflight: t("agentReadinessPreflight"),
    agentReadinessReview: t("agentReadinessReview"),
    repairQueueTitle: t("repairQueueTitle"),
    repairQueueStale: t("repairQueueStale"),
    repairQueueOrphan: t("repairQueueOrphan"),
    repairQueuePromotion: t("repairQueuePromotion"),
    repairQueueEmpty: t("repairQueueEmpty"),
    repairQueueTargetLabel: t("repairQueueTargetLabel"),
    repairQueueActionKindStale: t("repairQueueActionKindStale"),
    repairQueueActionKindOrphan: t("repairQueueActionKindOrphan"),
    repairQueueActionKindPromotion: t("repairQueueActionKindPromotion"),
    repairQueueOpenBuilder: t("repairQueueOpenBuilder"),
    repairQueueOpenOntology: t("repairQueueOpenOntology"),
  };
  const formatDaysAgo = (days: number) => {
    if (days <= 0) return t("daysAgoToday");
    if (days < 7) return t("daysAgoDays", { count: days });
    if (days < 90) return t("daysAgoWeeks", { count: Math.round(days / 7) });
    return t("daysAgoMonths", { count: Math.round(days / 30) });
  };
  const freshnessLabels = {
    domainFreshnessTitle: t("domainFreshnessTitle"),
    windowCaption: t("windowCaption", { weeks: FRESHNESS_WINDOW_WEEKS }),
    noDomains: t("noDomains"),
    stale: t("stale"),
    currentWeek: t("currentWeek"),
    unknownDate: t("unknownDate"),
    daysAgo: formatDaysAgo,
    older: t("older"),
    axisStart: t("axisStart", { weeks: FRESHNESS_WINDOW_WEEKS }),
    axisEnd: t("axisEnd"),
    recentUpdatesTitle: t("recentUpdatesTitle"),
    noRecentUpdates: t("noRecentUpdates"),
    staleCountLabel: t("staleCountLabel"),
    trendTitle: t("trendTitle"),
    trendCaption: t("trendCaption", { weeks: FRESHNESS_WINDOW_WEEKS }),
  };

  return (
    <div className="flex min-h-screen w-full">
      {/* 레일은 perf/persistent-shell 이후 layout(AppShell) 상주. */}
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-end gap-2 px-4 pt-3 md:px-6">
          <LiveActivityIndicator agentActivityStatus={vault.agentActivityStatus} />
          <AppSettingsMenu mode={dataSourceMode} />
        </div>
        <main id="main" className="mx-auto w-full max-w-[var(--page-max)] px-6 py-8 md:px-10">
        <MountedGlobalSearch />

        <header className="flex flex-wrap items-end gap-4">
          <h1 className="text-[23px] font-[var(--font-weight-signature)] tracking-[-0.015em] text-[color:var(--color-text-primary)]">
            {t("title")}
          </h1>
          <p className="max-w-xl pb-0.5 text-[12.5px] text-[color:var(--color-text-tertiary)]">{t("subtitle")}</p>
          {insight ? (
            <span className="ml-auto pb-0.5 font-mono text-[11.5px] tracking-[0.1em] text-[color:var(--topology-v2-numeral-face)]">
              {totalNodes} {t("censusConcepts")}
              <span className="mx-1.5 text-[color:var(--color-text-quaternary)]">·</span>
              {totalEdges} {t("censusRelations")}
              <span className="mx-1.5 text-[color:var(--color-text-quaternary)]">·</span>
              {domainCount} {t("censusDomains")}
            </span>
          ) : null}
        </header>

        <nav className="mt-4">
          <TabBar
            ariaLabel={t("tabsAriaLabel")}
            activeKey={tab}
            onSelect={setTab}
            items={INSIGHTS_TABS.map((key) => ({
              key,
              label: t(`tab.${key}`),
              count: key === "overview" ? totalNodes : key === "relations" ? totalEdges : `${FRESHNESS_WINDOW_WEEKS}${t("weeksUnit")}`,
            }))}
          />
        </nav>

        {error ? (
          <div
            role="alert"
            className="mt-6 rounded-lg border border-[color:var(--color-danger-a32)] bg-[color:var(--color-danger-a08)] px-5 py-4 text-sm text-[color:var(--color-status-danger)]"
          >
            {t("errorAlert", { message: error.message })}
          </div>
        ) : null}

        {!insight ? (
          <div
            role="status"
            aria-live="polite"
            className="mt-6 rounded-lg border border-[color:var(--color-divider)] bg-[color:var(--color-overlay-1)] px-6 py-10 text-center text-sm text-[color:var(--color-text-tertiary)]"
          >
            {t("loading")}
          </div>
        ) : insight.nodes.length === 0 ? (
          <div className="mt-6">
            <EmptyState
              tone="solid"
              align="center"
              title={
                <>
                  {t("emptyTitleBefore")}
                  <Link href={"/docs/"} className="text-[color:rgba(159,170,235,0.95)] underline">
                    {t("emptyTitleLink")}
                  </Link>
                  {t("emptyTitleAfter")}
                </>
              }
            />
          </div>
        ) : (
          <div
            role="tabpanel"
            id={`insights-tabpanel-${tab}`}
            aria-labelledby={`insights-tab-${tab}`}
            className="mt-[var(--section-gap)] flex min-h-0 flex-1 flex-col"
          >
            {tab === "overview" ? (
              <OverviewTab
                totalNodes={totalNodes}
                totalEdges={totalEdges}
                health={health}
                kindRows={kindRows}
                domainRows={domainRows}
                edgeTypeSummary={edgeTypeSummary}
                kindLabel={kindLabel}
                labels={overviewLabels}
              />
            ) : null}
            {tab === "relations" ? (
              <RelationsTab
                edgeTypeRows={edgeTypeRows}
                totalEdges={totalEdges}
                edgeTypeLabel={edgeTypeLabel}
                dependsOnRows={dependsOnRows}
                hubs={hubs}
                hubTotalCount={hubRanking.length}
                kindLabel={kindLabel}
                agentReadiness={agentReadiness}
                healthQueue={healthQueue}
                hubLink={{
                  href: buildOntologyNodeHref,
                  ariaLabel: (title) => t("hubRowAriaLabel", { title }),
                }}
                labels={relationsLabels}
              />
            ) : null}
            {tab === "freshness" ? (
              <FreshnessTab
                labels={freshnessLabels}
                domainRows={freshness.domainRows}
                recent={freshness.recent}
                staleCount={freshness.staleCount}
                weeklyTotals={freshness.weeklyTotals}
                kindLabel={kindLabel}
                recentLink={{
                  href: buildOntologyNodeHref,
                  ariaLabel: (title) => t("freshnessRowAriaLabel", { title }),
                }}
              />
            ) : null}
          </div>
        )}

        <InsightsHandoffRow
          label={t("handoffLabel")}
          payload={HANDOFF_PAYLOAD[tab] ?? HANDOFF_PAYLOAD[DEFAULT_INSIGHTS_TAB]}
          copyLabel={t("handoffCopy")}
          copiedLabel={t("agentCopied")}
        />
        </main>
      </div>
    </div>
  );
}
