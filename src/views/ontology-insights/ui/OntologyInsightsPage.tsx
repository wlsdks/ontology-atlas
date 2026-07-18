"use client";

import { useMemo } from "react";
import { useSearchParams } from "next/navigation";
import { Link, useRouter } from "@/i18n/navigation";
import { useTranslations } from "next-intl";
import {
  buildEdgeTypeRows,
  useEdgeTypeLabel,
  type KnowledgeGraphEdge,
  type KnowledgeGraphNode,
} from "@/entities/knowledge-graph";
import { useOntologyInsight, useVaultDocFreshnessIndex } from "@/features/vault-ontology";
import { useOntologyKindLabel } from "@/entities/ontology-class";
import {
  buildOntologyTree,
  computeEdgeTypeDistribution,
  computeKindDistribution,
  rankAllByDegree,
} from "@/shared/lib/ontology-tree";
import { MountedGlobalSearch } from "@/widgets/global-search";
import { OperationsNav } from "@/widgets/operations-nav";
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
  const edgeTypeSummary = useMemo(
    () => edgeTypeRows.slice(0, 4).map((r) => ({ key: r.type, label: edgeTypeLabel(r.type), count: r.count })),
    [edgeTypeRows, edgeTypeLabel],
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
    recentUpdatesTitle: t("recentUpdatesTitle"),
    noRecentUpdates: t("noRecentUpdates"),
    staleCountLabel: t("staleCountLabel"),
  };

  return (
    <div>
      <OperationsNav />
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
            className="mt-6 rounded-lg border border-[color:rgba(229,72,77,0.32)] bg-[color:rgba(229,72,77,0.08)] px-5 py-4 text-sm text-[color:var(--color-status-danger)]"
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
                labels={relationsLabels}
              />
            ) : null}
            {tab === "freshness" ? (
              <FreshnessTab
                labels={freshnessLabels}
                domainRows={freshness.domainRows}
                recent={freshness.recent}
                staleCount={freshness.staleCount}
                kindLabel={kindLabel}
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
  );
}
