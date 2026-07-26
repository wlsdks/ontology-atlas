"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Link } from "@/i18n/navigation";
import { useTranslations } from "next-intl";
import {
  buildEdgeTypeRows,
  buildInsightsReturnMarker,
  buildOntologyStudioNodeHrefFromGraphId,
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
  useVaultHealth,
} from "@/features/vault-ontology";
import { useDataSourceMode } from "@/features/data-source-mode";
import { useLocalVault } from "@/features/docs-vault-local";
import { buildDocsVaultHref } from "@/entities/docs-vault";
import { useOntologyKindLabel } from "@/entities/ontology-class";
import {
  buildOntologyTree,
  computeEdgeTypeDistribution,
  computeKindDistribution,
  rankAllByDegree,
} from "@/shared/lib/ontology-tree";
import { MountedGlobalSearch, useGlobalSearchHotkey } from "@/widgets/global-search";
import { AppSettingsMenu } from "@/widgets/app-settings-menu";
import { useNavRailSettingsSlot } from "@/widgets/app-nav-rail";
import { EmptyState, HexMark, TabBar } from "@/shared/ui";
import {
  DEFAULT_INSIGHTS_TAB,
  INSIGHTS_TABS,
  buildInsightsTabHref,
  parseInsightsTab,
  type InsightsTab,
} from "../lib/insights-tab-state";
import { computeDomainCapacityRows } from "../lib/domain-capacity";
import { buildImpactRanking } from "../lib/impact-ranking";
import { buildDoNextQueue, withDoNextVerification } from "../lib/do-next-queue";
import { buildDuplicatePairs, type DuplicatePairRow } from "../lib/duplicate-pairs";
import { buildInsightsVerdict } from "../lib/insights-verdict";
import { pickTodaysTouchUps, type TouchUpItem } from "../lib/todays-touch-ups";
import { countRecentEntries } from "@/shared/lib/agent-activity-log";
import { findDependencyCycles, type DependencyCycle } from "../lib/dependency-cycles";
import {
  isDoNextReviewId,
  resolveDoNextReviewState,
} from "../lib/review-loop";
import { computeCensusHealth } from "../lib/census-health";
import { buildVaultHealthRepair } from "../lib/vault-health-repair";
import { buildDomainCouplingSummary } from "../lib/domain-coupling-rows";
import { FRESHNESS_WINDOW_WEEKS, computeFreshnessSummary } from "../lib/freshness";
import { OverviewTab } from "./tabs/OverviewTab";
import { DoNextTab, type DoNextTouchUp } from "./tabs/DoNextTab";
import { ConnectionsTab, type ConnectionHubRow } from "./tabs/ConnectionsTab";
import { DomainCouplingCard } from "./tabs/DomainCouplingCard";
import { FreshnessTab } from "./tabs/FreshnessTab";
import { InsightsHandoffRow } from "./parts/InsightsHandoffRow";

const EMPTY_NODES: KnowledgeGraphNode[] = [];
const EMPTY_EDGES: KnowledgeGraphEdge[] = [];
const HUB_DISPLAY_LIMIT = 6;
/**
 * 영향 랭킹 표시 행 수 — 스크롤 계약(탭 ≤ 뷰포트 1.3배) 안에서 읽히는 상한.
 *
 * 12 인 이유는 이 카드가 나란한 두 카드를 합친 폭을 쓰기 때문이다. 6행을 두 배
 * 폭에 늘이면 이름(좌)과 막대(우) 사이가 1,100px 벌어져 한 행을 읽는 데 눈이
 * 화면을 가로지른다. 폭을 두 칸으로 접으면 행의 측정선(measure)이 옆 허브 카드와
 * 같아지고, 남는 자리는 빈 공간이 아니라 다음 6개 순위가 채운다 — 넓은 칸은
 * 데이터로 벌어야지 여백으로 벌지 않는다.
 */
const IMPACT_DISPLAY_LIMIT = 12;
/**
 * 중복 의심 표시 행 수. 상한을 넘는 쌍은 화면이 아니라 인계 payload 가
 * 담당한다 — 섹션 머리의 총계는 절단 전 규모를 그대로 말한다.
 *
 * 3행인 이유는 실측이다(1512×862, 도그푸드 294개념): 5행이면 「할 일」 탭이
 * 1,309px 로 스크롤 계약(뷰포트 1.3배 = 1,120px)을 189px 넘겼다. 다른 섹션을
 * 유형당 3행으로 함께 줄이고 이 카드를 3행으로 두면 1,1xx 로 들어온다 —
 * "중복이 있다"는 사실과 가장 의심스러운 3쌍을 보여주는 데는 충분하고,
 * 나머지는 `similar_nodes` 가 답한다.
 */
const DUPLICATE_DISPLAY_LIMIT = 3;
const RECENT_UPDATES_LIMIT = 8;

/** 탭이 답하는 질문을 에이전트의 실행 계획으로 그대로 옮긴 것. */
const HANDOFF_PAYLOAD: Record<InsightsTab, string> = {
  "do-next": 'query_ontology({operation:"maintenance_plan"}) → 항목별 실행 → query_ontology({operation:"health"}) 로 재확인',
  composition: 'list_kinds({}) → query_ontology({operation:"overview"}) → 빈 정의는 validate_vault({}) 의 warnings 로 확인',
  connections: 'query_ontology({operation:"centrality"}) → query_ontology({operation:"blast_radius", slug:"<hub-slug>"})',
  boundaries: 'query_ontology({operation:"domain_matrix"}) → 교차 예시는 query_ontology({operation:"match_edges"})',
  freshness: 'query_ontology({operation:"maintenance_plan"}) → find_orphans({}) → query_ontology({operation:"growth_plan"})',
};

interface InsightsBadgeInput {
  verdictTotal: number;
  totalNodes: number;
  totalEdges: number;
  crossDomainEdges: number;
}

/**
 * 탭 배지가 세는 대상 — 반복되는 슬롯이라 **다섯 자리 모두 같은 단위**여야
 * 한다. 신선도만 창 길이("12주")를 넣던 자리는 비운다: 길이는 개수가 아니고,
 * 그 창이 몇 주인지는 탭 안 「최근 12주 · 문서 갱신일」이 이미 말한다. 자리를
 * 비우는 것과 다른 단위를 채우는 것은 다르다 — 후자만 슬롯의 뜻을 깨뜨린다.
 */
const INSIGHTS_TAB_BADGE: Record<
  InsightsTab,
  (input: InsightsBadgeInput) => string | number | undefined
> = {
  "do-next": (i) => i.verdictTotal,
  composition: (i) => i.totalNodes,
  connections: (i) => i.totalEdges,
  boundaries: (i) => i.crossDomainEdges,
  freshness: () => undefined,
};

/**
 * `/ontology/insights` — 그래프 인사이트 정비 보드. 하단에 agent handoff 1행.
 *
 * 탭은 **질문 하나에 탭 하나**다: 할 일(지금 뭘 손보나) · 구성(뭐가 얼마나
 * 있나) · 연결(뭐가 중심인가) · 경계(도메인 사이가 얼마나 엮였나) · 신선도
 * (어디가 움직였나). 구 `구조` 탭은 앞의 세 질문을 한 방에 쌓아 뷰포트의
 * 2.2배로 자랐다 — 한 질문에 답하려고 무관한 두 화면을 지나쳐야 했다.
 *
 * 모든 숫자는 이 페이지가 이미 쓰던 데이터 소스(`useOntologyInsight`,
 * `shared/lib/ontology-tree`)에서 유도 — census 공식(총 노드/엣지/도메인 수)은
 * 토폴로지 크롬과 동일하다.
 */
export function OntologyInsightsPage() {
  const t = useTranslations("ontologyPages.insights");
  const kindLabel = useOntologyKindLabel();
  const edgeTypeLabel = useEdgeTypeLabel();
  const searchParams = useSearchParams();
  const [tab, setTabState] = useState<InsightsTab>(() =>
    parseInsightsTab(searchParams.get("tab")),
  );
  const [reviewId, setReviewId] = useState<string | null>(() =>
    parseInsightsTab(searchParams.get("tab")) === "do-next"
      ? searchParams.get("review")
      : null,
  );

  useEffect(() => {
    const syncTabFromHistory = () => {
      const nextParams = new URL(window.location.href).searchParams;
      const nextTab = parseInsightsTab(nextParams.get("tab"));
      setTabState(nextTab);
      setReviewId(nextTab === "do-next" ? nextParams.get("review") : null);
    };
    window.addEventListener("popstate", syncTabFromHistory);
    return () => window.removeEventListener("popstate", syncTabFromHistory);
  }, []);

  // #15 설정 위치 통일 — 인사이트만 우상단 헤더 필 설정이었던 것을 다른
  // 표면(지도)과 같은 LNB 하단 톱니로 옮겼다(아래 `useNavRailSettingsSlot`).
  // AppSettingsMenu 는 자체적으로 ⌘K 를 받으면 시트를 닫으므로(line 331,
  // "one overlay owns one Escape"), 검색 팔레트(모달·스크림)와 설정이 겹쳐
  // 뜨는 경로가 없다 — 구 controlled 대칭 상호배제 상태는 필요 없어졌다.
  const [searchPaletteOpen, setSearchPaletteOpen] = useState(false);
  useGlobalSearchHotkey(searchPaletteOpen, setSearchPaletteOpen);

  // 지도 딥링크에 출처 마커(`via=insights:<tab>`)를 새긴다 — 지도(HomePage)가
  // 이 마커로 "인사이트로 돌아가기" 복귀 칩을 렌더하고, 클릭 시 이 탭으로
  // 돌아온다. 이 페이지의 모든 지도행 링크(허브/의존/신선도 행, 할 일 큐,
  // 수리 큐)가 같은 빌더를 지나므로 한 곳에서 스탬프.
  const mapNodeHref = useCallback(
    (nodeId: string, exactReviewId?: string) =>
      buildOntologyNodeHref(nodeId, {
        via: buildInsightsReturnMarker(exactReviewId ? "do-next" : tab),
        reviewId: exactReviewId,
      }),
    [tab],
  );

  const { insight, error } = useOntologyInsight();
  const docFreshnessIndex = useVaultDocFreshnessIndex();
  const vault = useLocalVault();
  const dataSourceMode = useDataSourceMode();

  // #15 설정 위치 통일 — 지도(HomePage)와 동일하게 lg+ 는 나브레일 하단
  // rail-tile 톱니로 설정을 연다. <lg 는 아래 상단 유틸 레인의 chrome-tile
  // (레일이 숨는 폭)이 담당. 둘 다 uncontrolled 라 보이는 트리거만 클릭돼
  // 이중 포털이 나지 않는다.
  const navRailSettingsSlot = useMemo(
    () => <AppSettingsMenu mode={dataSourceMode} triggerVariant="rail-tile" />,
    [dataSourceMode],
  );
  useNavRailSettingsSlot(navRailSettingsSlot);

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
  const domainRows = useMemo(() => computeDomainCapacityRows(nodes, edges), [nodes, edges]);

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
  // C1 — CLI-parity health verdict (disconnected islands · missing domain
  // containment) read from the raw frontmatter, so the repair queue agrees with
  // `ontology-atlas health` instead of falsely claiming "수리할 것 없음".
  const vaultHealth = useVaultHealth();
  const healthRepair = useMemo(
    () => buildVaultHealthRepair(vaultHealth, nodes),
    [vaultHealth, nodes],
  );
  const healthQueue = useMemo(
    () => ({
      staleCount: healthSignals.stale.length,
      orphanCount: healthSignals.orphan.length,
      promotionCount: healthSignals.promotion.length,
      islandCount: healthRepair.islandCount,
      missingContainmentCount: healthRepair.missingContainmentCount,
      // CLI-parity issues rank above the statistical stale/orphan/promotion
      // signals — they're what flip the CLI to needs_attention.
      actionTarget: healthRepair.actionTarget ?? buildOntologyHealthActionTarget(healthSignals),
      builderHref: buildOntologyStudioNodeHrefFromGraphId,
      ontologyHref: mapNodeHref,
    }),
    [healthSignals, healthRepair, mapNodeHref],
  );

  // 랭크 #12 (14-lens audit) — computeDomainCouplingMatrix 는 이미 존재하고
  // 단위 테스트도 있었지만 어떤 UI 소비자도 없었다(CLI/MCP 왕복으로만 확인
  // 가능). 구조 탭에 "도메인 결합" 카드로 처음 표면화.
  const domainCoupling = useMemo(() => buildDomainCouplingSummary(nodes, edges), [nodes, edges]);

  const hubRanking = useMemo(() => rankAllByDegree(nodes, edges), [nodes, edges]);
  const hubs = useMemo<ConnectionHubRow[]>(
    () =>
      hubRanking.slice(0, HUB_DISPLAY_LIMIT).map(({ node, degree }) => ({
        id: node.id,
        // 과제 ⑩ — 허브 랭킹 표시용 짧은 제목.
        title: node.display ?? node.title,
        kind: node.kind,
        degree,
      })),
    [hubRanking],
  );

  // 영향 랭킹 — "이걸 바꾸면 어디까지 다시 봐야 하나". 계산은 지도 드로어·
  // 변경점 diff 와 같은 `computeOntologyDependents`(= MCP blast_radius 의미론)
  // 를 그대로 부른다. 전 노드 BFS 라 nodes/edges 가 바뀔 때만 다시 돈다.
  const impact = useMemo(
    () => buildImpactRanking(nodes, edges, IMPACT_DISPLAY_LIMIT),
    [nodes, edges],
  );

  // 중복 의심 쌍 — 이름/소속/이웃이 얼마나 겹치는지. MCP `similar_nodes` 를
  // 그대로 옮긴 미러라 화면이 지목하는 쌍과 에이전트가 답하는 쌍이 같다.
  const duplicates = useMemo(
    () => buildDuplicatePairs(nodes, edges, DUPLICATE_DISPLAY_LIMIT),
    [nodes, edges],
  );
  const duplicateHandoff = (row: DuplicatePairRow): string =>
    withDoNextVerification(
      `merge_concepts({fromSlug:"${row.dissolveSlug}", intoSlug:"${row.keepSlug}"}) 로 합칠 결과 미리보기 → 같은 뜻이 맞으면 같은 호출에 confirm:true 를 더해 실행`,
      `get_concept({slug:"${row.keepSlug}"}) 로 합쳐진 원문 확인`,
    );

  const freshness = useMemo(
    () => computeFreshnessSummary(nodes, edges, docFreshnessIndex, new Date(), { recentLimit: RECENT_UPDATES_LIMIT }),
    [nodes, edges, docFreshnessIndex],
  );

  // B3 — 활동 다이제스트: 로컬 vault 의 감사 로그 tail (static 모드 null).
  // 기준 시각은 마운트 스냅샷 — 렌더 중 Date.now 금지 (저장소 purity 관례).
  const [digestNowMs] = useState(() => Date.now());
  const activityDigest = useMemo(() => {
    const log = vault.agentActivityLog ?? [];
    if (log.length === 0) return null;
    const latest = log.slice(-3).reverse().map((entry) => ({
      at: entry.at,
      summary: entry.summary,
      agent: entry.agent,
      // P4-② (2026-07-21 리텐션 라운드) — add_relation 의 --why 는 이미
      // activity.jsonl 에 저장되지만 어떤 UI 표면에도 안 나왔다("근거를
      // 쓰게 해놓고 읽을 곳이 없음"). digest 카드가 요약 옆에 truncate 로
      // 함께 보여준다.
      why: entry.why,
    }));
    return { todayCount: countRecentEntries(log, digestNowMs), latest };
  }, [vault.agentActivityLog, digestNowMs]);

  // S5 — "할 일" 큐: 이미 로드된 파생(healthSignals·degree·freshness)의 조합.
  //
  // 유형당 3행 — 큐 카드에 유형이 하나 늘 때마다(중복 의심이 그랬다) 카드가
  // 뷰포트를 밀어내지 않도록 정한 상한이다. 각 섹션은 상위 3행 + 총계 + "외
  // N개"를 그대로 말하므로 규모는 안 줄고, 전체 목록은 화면이 아니라 인계
  // payload 가 담당한다(탭 ≤ 뷰포트 1.3배 계약).
  const doNextQueue = useMemo(
    () => buildDoNextQueue(nodes, edges, docFreshnessIndex, { perKindLimit: 3 }),
    [nodes, edges, docFreshnessIndex],
  );

  // 의존 사이클(전략 verdict B 후보 ④) — depends_on 방향 그래프의 순환. 이미
  // 로드된 nodes/edges 에서 client 계산(MCP `cycles` 파생과 같은 의미).
  const dependencyCycles = useMemo(() => findDependencyCycles(nodes, edges), [nodes, edges]);
  const nodeById = useMemo(() => new Map(nodes.map((node) => [node.id, node])), [nodes]);
  const cycleNodeTitle = (nodeId: string): string => nodeById.get(nodeId)?.title ?? nodeId;
  // graph id → vault slug(evidenceIds[0]) — MCP 핸드오프는 vault slug 를 쓴다.
  const cycleMcpRef = (nodeId: string): string =>
    nodeById.get(nodeId)?.evidenceIds[0] ?? nodeId.split(":").pop() ?? nodeId;
  const sourceHref = (nodeId: string, exactReviewId?: string): string | null => {
    const sourceSlug = nodeById.get(nodeId)?.evidenceIds[0];
    return sourceSlug
      ? buildDocsVaultHref({
          slug: sourceSlug,
          via: exactReviewId ? buildInsightsReturnMarker("do-next") : null,
          reviewId: exactReviewId,
        })
      : null;
  };
  const builderHref = (nodeId: string, exactReviewId?: string): string =>
    buildOntologyStudioNodeHrefFromGraphId(nodeId, {
      via: exactReviewId ? buildInsightsReturnMarker("do-next") : null,
      reviewId: exactReviewId,
    });
  const cycleHandoff = (cycle: DependencyCycle): string => {
    const closed = [...cycle.nodeIds.map(cycleMcpRef), cycleMcpRef(cycle.nodeIds[0])].join(" → ");
    return withDoNextVerification(
      `의존 사이클: ${closed}. query_ontology({operation:"cycles"}) 로 확인 → 어느 방향을 끊을지 판단 → patch_concept 로 dependencies 수정`,
      'query_ontology({operation:"cycles"}) 로 사이클 해소 확인',
    );
  };

  const setTab = (next: string) => {
    // 같은 문서의 query view만 바뀐다. Next router navigation은 WebView에서
    // 포커스를 document root로 옮기므로 native history 통합으로 URL state만
    // 갱신한다. 화면 state와 URL을 같은 이벤트에서 맞추므로 TabBar의 roving
    // focus를 끊지 않고, 재진입·공유 링크는 URL을 다시 초기 진실원으로 읽는다.
    const nextTab = next as InsightsTab;
    setTabState(nextTab);
    setReviewId(null);
    window.history.replaceState(
      window.history.state,
      "",
      buildInsightsTabHref(nextTab, window.location.pathname),
    );
  };

  const activeReviewIds = useMemo(
    () =>
      new Set([
        ...doNextQueue.activeRowIds,
        ...dependencyCycles.activeCycleIds.map((id) => `cycle:${id}`),
      ]),
    [doNextQueue.activeRowIds, dependencyCycles.activeCycleIds],
  );
  const titleByReviewId = useMemo(() => {
    const titles = new Map<string, string>();
    for (const row of doNextQueue.rows) titles.set(row.id, row.title);
    for (const cycle of dependencyCycles.cycles) {
      const firstNodeId = cycle.nodeIds[0];
      titles.set(
        `cycle:${cycle.id}`,
        nodeById.get(firstNodeId)?.title ?? firstNodeId,
      );
    }
    return titles;
  }, [doNextQueue.rows, dependencyCycles.cycles, nodeById]);
  const reviewAuthoritative =
    dataSourceMode === "local"
      ? vault.status === "loaded"
      : vault.status === "idle" || vault.status === "unsupported";
  const reviewState = useMemo(
    () =>
      resolveDoNextReviewState({
        reviewId,
        authoritative: reviewAuthoritative,
        activeReviewIds,
        titleByReviewId,
        cycleInventoryLimited: dependencyCycles.limited,
      }),
    [
      reviewId,
      reviewAuthoritative,
      activeReviewIds,
      titleByReviewId,
      dependencyCycles.limited,
    ],
  );
  const onReviewStart = useCallback(
    (candidate: { id: string; title: string }) => {
      setReviewId(candidate.id);
      const next = new URL(window.location.href);
      next.searchParams.delete("tab");
      next.searchParams.set("review", candidate.id);
      window.history.replaceState(
        window.history.state,
        "",
        `${next.pathname}?${next.searchParams.toString()}${next.hash}`,
      );
    },
    [],
  );

  // ③ 오늘의 손질 — 순수 함수가 우선순위/절단/콜드스타트 가드를 처리하고,
  // 표면 문구(why)만 여기서 입힌다. 절단 결과가 3건일 때만 채워진다.
  const touchUpWhy = (item: TouchUpItem): string => {
    switch (item.reason.kind) {
      case "neglected-hub":
        // 「이유 ·」 뒤에는 문장이 와야 한다. 예전엔 수리 큐 칩과 같은
        // 지표 문구("연결 8 · 50일째 그대로")를 그대로 써서, 왜 이 항목이
        // 뽑혔는지는 숫자를 읽는 사람만 알 수 있었다.
        return t("doNext.touchUpWhyNeglectedHub", {
          degree: item.reason.degree,
          days: item.reason.agoDays,
        });
      case "cycle":
        return t("doNext.touchUpWhyCycle", { length: item.reason.length });
      case "promotion":
        return t("doNext.touchUpWhyPromotion");
    }
  };
  // #63 — 이 화면의 단일 판정. 탭 배지 · 빈 상태 문구 · 건강 주장이 모두
  // 여기서 나와야 같은 데이터에 서로 다른 말을 하지 않는다.
  const insightsVerdict = useMemo(
    () =>
      buildInsightsVerdict({
        islands: healthRepair.islandCount,
        missingContainment: healthRepair.missingContainmentCount,
        cycles: dependencyCycles.totalCycles,
        neglectedHubs: doNextQueue.counts.neglectedHub,
        orphans: doNextQueue.counts.orphan,
        promotions: doNextQueue.counts.promotion,
      }),
    [healthRepair, dependencyCycles.totalCycles, doNextQueue.counts],
  );

  const doNextTouchUps: DoNextTouchUp[] = pickTodaysTouchUps(doNextQueue, dependencyCycles, {
    totalNodes,
    cycleTitle: cycleNodeTitle,
    cycleHandoff,
    reviewId: isDoNextReviewId(reviewId) ? reviewId : null,
  }).map((item) => ({
    id: item.id,
    source: item.source,
    nodeId: item.nodeId,
    title: item.title,
    nodeKind: item.nodeKind,
    why: touchUpWhy(item),
    handoffPayload: item.handoffPayload,
  }));

  const heroLabels = {
    concepts: t("heroConcepts"),
    relations: t("heroRelations"),
    health: t("heroHealth"),
    orphan: t("healthOrphan"),
    cycle: t("healthCycle"),
    membershipLabel: t("heroMembershipLabel"),
    densityGloss: t("heroDensityGloss", { ratio: health.edgesPerConcept.toFixed(2) }),
    evidenceLinked: t("healthEvidenceLinked"),
    islands: t("healthIslands"),
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
  const connectionsLabels = {
    relationTypesTitle: t("relationTypesTitle"),
    relationTypesCaption: t("relationTypesCaption"),
    noRelationTypes: t("noRelationTypes"),
    noRelationTypesHint: t("noRelationTypesHint"),
    hubsTitle: t("hubsTitle"),
    noHubs: t("noHubs"),
    noHubsHint: t("noHubsHint"),
    hubTruncated: (shown: number, total: number) => t("hubTruncated", { shown, total }),
    hubDegreeCaption: t("hubDegreeCaption"),
  };
  const impactLabels = {
    title: t("impactTitle"),
    caption: t("impactCaption"),
    directLabel: t("impactDirectLabel"),
    transitiveLabel: t("impactTransitiveLabel"),
    empty: t("impactEmpty"),
    emptyHint: t("impactEmptyHint"),
    truncated: (shown: number, total: number) => t("impactTruncated", { shown, total }),
  };
  const domainCouplingLabels = {
    title: t("domainCouplingTitle"),
    countUnit: t("domainCouplingCountUnit"),
    boundaryCountUnit: t("domainCouplingBoundaryCountUnit"),
    emptyTitle: t("domainCouplingEmptyTitle"),
    emptyDescription: t("domainCouplingEmptyDescription"),
    emptyAction: t("domainCouplingEmptyAction"),
    emptyActionHref: "/ontology/studio/",
    boundaryTitle: t("domainCouplingBoundaryTitle"),
    boundarySelfLabel: t("domainCouplingSelfLabel"),
    boundaryCrossLabel: t("domainCouplingCrossLabel"),
    boundaryCaption: t("domainCouplingBoundaryCaption"),
    gridCaption: t("domainCouplingGridCaption"),
    gridSelectHint: t("domainCouplingGridSelectHint"),
    gridTruncated: (shown: number, total: number) =>
      t("domainCouplingGridTruncated", { shown, total }),
    gridHiddenCross: (count: number) => t("domainCouplingGridHiddenCross", { count }),
    gridCellAria: (from: string, to: string, count: number) =>
      t("domainCouplingGridCellAria", { from, to, count }),
    gridSelfAria: (domain: string, count: number) =>
      t("domainCouplingGridSelfAria", { domain, count }),
  };
  const doNextLabels = {
    agentReadinessTitle: t("agentReadinessTitle"),
    agentReadinessHint: t("agentReadinessHint"),
    agentReadinessReady: t("agentReadinessReady"),
    agentReadinessPreflight: t("agentReadinessPreflight"),
    agentReadinessReview: t("agentReadinessReview"),
    repairQueueTitle: t("repairQueueTitle"),
    repairQueueStale: t("repairQueueStale"),
    repairQueueOrphan: t("repairQueueOrphan"),
    repairQueuePromotion: t("repairQueuePromotion"),
    repairQueueIsland: t("repairQueueIsland"),
    repairQueueMissingContainment: t("repairQueueMissingContainment"),
    repairQueueEmpty: t("repairQueueEmpty"),
    repairQueueActionKindStale: t("repairQueueActionKindStale"),
    repairQueueActionKindOrphan: t("repairQueueActionKindOrphan"),
    repairQueueActionKindPromotion: t("repairQueueActionKindPromotion"),
    repairQueueActionKindIsland: t("repairQueueActionKindIsland"),
    repairQueueActionKindContainment: t("repairQueueActionKindContainment"),
    repairQueueOpenBuilder: t("repairQueueOpenBuilder"),
    repairQueueOpenOntology: t("repairQueueOpenOntology"),
    queueTitle: t("doNext.queueTitle"),
    sectionNeglectedHub: t("doNext.sectionNeglectedHub"),
    sectionOrphan: t("doNext.sectionOrphan"),
    sectionPromotion: t("doNext.sectionPromotion"),
    sectionCycle: t("doNext.sectionCycle"),
    sectionDuplicate: t("doNext.sectionDuplicate"),
    hintDuplicate: t("doNext.hintDuplicate"),
    duplicateMetric: (percent: number) => t("doNext.duplicateMetric", { percent }),
    hintNeglectedHub: t("doNext.hintNeglectedHub"),
    hintOrphan: t("doNext.hintOrphan"),
    hintPromotion: t("doNext.hintPromotion"),
    promotionMetric: (count: number) => t("doNext.promotionMetric", { count }),
    cycleMoreNodes: (count: number) => t("doNext.cycleMoreNodes", { count }),
    neglectedHubMetric: (degree: number, agoDays: number) =>
      t("doNext.neglectedHubMetric", { degree, days: agoDays }),
    cycleMetric: (length: number) => t("doNext.cycleMetric", { length }),
    openMap: t("doNext.openMap"),
    openSource: t("doNext.openSource"),
    openBuilder: t("doNext.openBuilder"),
    handoffCopy: t("doNext.handoffCopy"),
    handoffCopied: t("agentCopied"),
    emptyQueue: t("doNext.emptyQueue"),
    moreCount: (count: number) => t("doNext.moreCount", { count }),
    digestTitle: t("doNext.digestTitle"),
    digestToday: (count: number) => t("doNext.digestToday", { count }),
    digestApproveHint: t("doNext.digestApproveHint"),
    digestWhyPrefix: t("doNext.digestWhyPrefix"),
    touchUpBandTitle: t("doNext.touchUpBandTitle"),
    touchUpPriorityCount: (count: number) => t("doNext.touchUpPriorityCount", { count }),
    touchUpFlowHint: t("doNext.touchUpFlowHint"),
    rowMenuTrigger: t("doNext.rowMenuTrigger"),
    reviewChecking: (title: string | null) =>
      t("doNext.reviewChecking", { title: title ?? t("doNext.reviewFallback") }),
    reviewActive: (title: string | null) =>
      t("doNext.reviewActive", { title: title ?? t("doNext.reviewFallback") }),
    reviewCleared: (title: string | null) =>
      t("doNext.reviewCleared", { title: title ?? t("doNext.reviewFallback") }),
    reviewUnverified: (title: string | null) =>
      t("doNext.reviewUnverified", { title: title ?? t("doNext.reviewFallback") }),
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
    weekCell: (weeksAgo: number, count: number) => t("weekCell", { weeks: weeksAgo, count }),
    weekCellCurrent: (count: number) => t("weekCellCurrent", { count }),
    recentUpdatesTitle: t("recentUpdatesTitle"),
    noRecentUpdates: t("noRecentUpdates"),
    staleCountLabel: t("staleCountLabel"),
    trendTitle: t("trendTitle"),
    trendCaption: t("trendCaption", { weeks: FRESHNESS_WINDOW_WEEKS }),
  };

  return (
    <div className="flex min-h-full w-full">
      {/* 레일은 perf/persistent-shell 이후 layout(AppShell) 상주. */}
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-end gap-2 px-4 pt-3 md:px-6">
          <LiveActivityIndicator agentActivityStatus={vault.agentActivityStatus} />
          {/* #15 — 설정은 lg+ 에선 나브레일 하단 톱니가 담당. 레일이 숨는
              <lg 에서만 chrome-tile 로 노출(지도와 동일 계약). */}
          <div className="lg:hidden">
            <AppSettingsMenu mode={dataSourceMode} triggerVariant="chrome-tile" />
          </div>
        </div>
        <main id="main" className="mx-auto w-full max-w-[var(--page-max)] px-6 py-8 max-lg:pb-[calc(var(--topology-mobile-bottom-tab-reserve)+24px)] md:px-10">
        <MountedGlobalSearch open={searchPaletteOpen} onOpenChange={setSearchPaletteOpen} />

        <header className="flex flex-wrap items-end gap-4">
          <h1 className="inline-flex items-center gap-2 text-display font-[var(--font-weight-signature)] tracking-[-0.015em] text-[color:var(--color-text-primary)]">
            <HexMark size={13} className="shrink-0 text-[color:var(--color-text-tertiary)]" />
            {t("title")}
          </h1>
          <p className="max-w-xl pb-0.5 text-body text-[color:var(--color-text-tertiary)]">{t("subtitle")}</p>
          {insight ? (
            <span className="ml-auto pb-0.5 font-mono text-label tracking-[0.1em] text-[color:var(--topology-v2-numeral-face)]">
              {totalNodes} {t("censusConcepts")}
              <span className="mx-1.5 text-[color:var(--color-text-quaternary)]">·</span>
              {totalEdges} {t("censusRelations")}
              <span className="mx-1.5 text-[color:var(--color-text-quaternary)]">·</span>
              {domainCount} {t("censusDomains")}
            </span>
          ) : null}
        </header>
        {/* Toss I1 — 이 표면은 파워유저(온톨로지를 관리하는 사람·AI 에이전트)용
            정비 보드다. 카피 전면 개편 대신 청중을 정직하게 선언해 기대치를
            맞춘다 — 일반 방문자가 여기서 "내 프로젝트" 같은 걸 찾다가 헤매지
            않도록. */}
        <p className="mt-1 max-w-2xl text-label text-[color:var(--color-text-quaternary)]">
          {t("audienceBanner")}
        </p>

        <nav className="mt-4">
          <TabBar
            ariaLabel={t("tabsAriaLabel")}
            activeKey={tab}
            onSelect={setTab}
            items={INSIGHTS_TABS.map((key) => ({
              key,
              label: t(`tab.${key}`),
              // 배지는 그 탭이 답하는 질문의 규모 — 탭마다 세는 대상이 다르다.
              // #63 — 할 일 배지는 단일 판정 모델(`insights-verdict`)에서 나온다.
              // 예전엔 do-next 통계 신호만 세고 CLI-parity 신호(분리된 섬 ·
              // 누락된 연결)를 빠뜨려, 수리 큐가 1건을 보여주는데 배지는 0
              // 이라고 말하는 모순이 났다.
              count: INSIGHTS_TAB_BADGE[key]({
                verdictTotal: insightsVerdict.total,
                totalNodes,
                totalEdges,
                crossDomainEdges: domainCoupling.crossDomainEdgeCount,
              }),
              // 라벨 없는 숫자가 무엇을 세는지 — hover/보조기술에만 뜨는 한 마디.
              countTitle: key === "freshness" ? undefined : t(`tabCountTitle.${key}`),
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
            key={tab}
            role="tabpanel"
            id={`insights-tabpanel-${tab}`}
            aria-labelledby={`insights-tab-${tab}`}
            className="insights-tab-crossfade mt-[var(--section-gap)] flex min-h-0 flex-1 flex-col"
          >
            {tab === "do-next" ? (
              <DoNextTab
                queue={doNextQueue}
                touchUps={doNextTouchUps}
                cycles={dependencyCycles}
                duplicates={duplicates.rows}
                duplicateTotal={duplicates.suspectCount}
                duplicateHandoff={duplicateHandoff}
                agentReadiness={agentReadiness}
                healthQueue={healthQueue}
                mapHref={mapNodeHref}
                sourceHref={sourceHref}
                builderHref={builderHref}
                nodeTitle={cycleNodeTitle}
                cycleHandoff={cycleHandoff}
                activityDigest={activityDigest}
                reviewState={reviewState}
                onReviewStart={onReviewStart}
                labels={doNextLabels}
              />
            ) : null}
            {tab === "composition" ? (
              <OverviewTab
                totalNodes={totalNodes}
                totalEdges={totalEdges}
                health={health}
                islandCount={healthRepair.islandCount}
                kindRows={kindRows}
                domainRows={domainRows}
                edgeTypeSummary={edgeTypeSummary}
                kindLabel={kindLabel}
                labels={overviewLabels}
              />
            ) : null}
            {tab === "connections" ? (
              <ConnectionsTab
                edgeTypeRows={edgeTypeRows}
                totalEdges={totalEdges}
                edgeTypeLabel={edgeTypeLabel}
                hubs={hubs}
                hubTotalCount={hubRanking.length}
                kindLabel={kindLabel}
                hubLink={{
                  href: mapNodeHref,
                  ariaLabel: (title) => t("hubRowAriaLabel", { title }),
                }}
                labels={connectionsLabels}
                impact={impact}
                impactLink={{
                  href: mapNodeHref,
                  // 막대는 aria-hidden 이라 두 수를 링크 이름에 실어 보낸다 —
                  // 화면에 있는 사실이 스크린리더에서 사라지면 안 된다.
                  ariaLabel: ({ title, direct, total }) =>
                    t("impactRowAriaLabel", { title, direct, total }),
                }}
                impactLabels={impactLabels}
              />
            ) : null}
            {tab === "boundaries" ? (
              <DomainCouplingCard
                domainCount={domainCoupling.domainCount}
                crossDomainEdgeCount={domainCoupling.crossDomainEdgeCount}
                pairs={domainCoupling.pairs}
                grid={domainCoupling.grid}
                boundaries={domainCoupling.boundaries}
                isColdStart={domainCoupling.isColdStart}
                edgeTypeLabel={edgeTypeLabel}
                nodeLink={{
                  href: mapNodeHref,
                  ariaLabel: (title) => t("hubRowAriaLabel", { title }),
                }}
                labels={domainCouplingLabels}
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
                  href: mapNodeHref,
                  ariaLabel: (title) => t("freshnessRowAriaLabel", { title }),
                }}
              />
            ) : null}
          </div>
        )}

        <InsightsHandoffRow
          label={t("handoffLabel")}
          caption={t("handoffCaption")}
          payload={HANDOFF_PAYLOAD[tab] ?? HANDOFF_PAYLOAD[DEFAULT_INSIGHTS_TAB]}
          copyLabel={t("handoffCopy")}
          copiedLabel={t("agentCopied")}
        />
        </main>
      </div>
    </div>
  );
}
