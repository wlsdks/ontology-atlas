"use client";

import { useCallback, useEffect, useEffectEvent, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Link } from "@/i18n/navigation";
import { useSwapHeight } from "@/shared/lib/use-presence";
import { PAGE_FRAME, PAGE_HEADER_ROW, PAGE_TITLE_ROW } from "@/shared/ui/page-frame";
import { useTranslations } from "next-intl";
import {
  buildEdgeTypeRows,
  buildInsightsReturnMarker,
  buildTopologyMeaningEditorNodeHref,
  buildOntologyHealthActionTarget,
  buildOntologyHealthSignals,
  buildOntologyNodeHref,
  classifyRelationQuality,
  isEvidenceOnlyConcept,
  summarizeAgentReadiness,
  useEdgeTypeLabel,
  type KnowledgeGraphEdge,
  type KnowledgeGraphNode,
  type MeaningGapKind,
} from "@/entities/knowledge-graph";
import {
  useOntologyInsight,
  useVaultConceptFacts,
  useVaultDocFreshnessIndex,
  useVaultHealth,
  useVaultValidationSummary,
} from "@/features/vault-ontology";
import { isLlmChatBridgeAvailable } from "@/shared/lib/tauri-llm";
import { useDataSourceMode, VaultSourceHydrationBoundary } from "@/entities/vault-session";
import { useLocalVault } from "@/entities/vault-session";
import { OpenVaultCta } from "@/features/docs-vault-local";
import { buildDocsVaultHref } from "@/entities/docs-vault";
import { useOntologyKindLabel } from "@/entities/ontology-class";
import {
  buildOntologyTree,
  computeEdgeTypeDistribution,
  rankAllByDegree,
} from "@/entities/knowledge-graph/lib/ontology-tree";
import { MountedGlobalSearch, useGlobalSearchHotkey } from "@/widgets/global-search";
import { AppSettingsMenu } from "@/widgets/app-settings-menu";
import { useNavRailSettingsSlot } from "@/widgets/app-nav-rail";
import { EmptyState, TabBar } from "@/shared/ui";
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
import {
  buildDomainChoices,
  buildMeaningGapRows,
  type MeaningGapRow,
} from "../lib/meaning-gap-rows";
import { resolveSessionAbilities } from "../lib/session-abilities";
import type { QueueSectionKey } from "../lib/queue-work-groups";
import { buildInsightsVerdict } from "../lib/insights-verdict";
import { pickTodaysTouchUps, type TouchUpItem } from "../lib/todays-touch-ups";
import { countRecentEntries } from "@/shared/lib/agent-activity-log";
import { canonicalizeDomainRef } from "@/shared/lib/canonicalize-domain-ref";
import { findDependencyCycles, type DependencyCycle } from "../lib/dependency-cycles";
import {
  isDoNextReviewId,
  resolveDoNextReviewState,
} from "../lib/review-loop";
import { computeCensusHealth, computeInsightsCensus } from "../lib/census-health";
import { buildVaultHealthRepair } from "../lib/vault-health-repair";
import { buildDomainCouplingSummary } from "../lib/domain-coupling-rows";
import { FRESHNESS_WINDOW_WEEKS, computeFreshnessSummary } from "../lib/freshness";
import { OverviewTab } from "./tabs/OverviewTab";
import { DoNextTab, type DoNextTouchUp } from "./tabs/DoNextTab";
import type { MeaningGapLabels } from "./tabs/MeaningGapSection";
import { ConnectionsTab, type ConnectionHubRow } from "./tabs/ConnectionsTab";
import { DomainCouplingCard } from "./tabs/DomainCouplingCard";
import { FreshnessTab } from "./tabs/FreshnessTab";
import { FlowTab } from "./tabs/FlowTab";
import { buildBusinessFlowRequest } from "@/features/vault-agent";
import { buildBusinessFlowHref } from "@/entities/knowledge-graph";
import { useRouter } from "@/i18n/navigation";
import { isAcpBridgeAvailable } from "@/shared/lib/tauri-acp";
import { InsightsHandoffRow } from "./parts/InsightsHandoffRow";
import { controlClass } from '@/shared/ui/control-class';

const EMPTY_NODES: KnowledgeGraphNode[] = [];
const EMPTY_EDGES: KnowledgeGraphEdge[] = [];
const HUB_DISPLAY_LIMIT = 6;
/**
 * How many impact-ranking rows to show — the ceiling that still reads inside the
 * scroll contract (a tab is at most 1.3× the viewport).
 *
 * 12 because this card spans the combined width of the two cards beside it. Six
 * rows stretched across double width puts 1,100px between the name (left) and the
 * bar (right), so reading one row drags the eye across the screen. Folding the
 * width into two columns gives a row the same measure as the neighbouring hub
 * card, and the space left over is filled by the next six ranks rather than by
 * blank area — a wide column is earned with data, not with whitespace.
 */
const IMPACT_DISPLAY_LIMIT = 12;
/**
 * How many suspected-duplicate rows to show. Pairs beyond the limit are carried by
 * the handoff payload rather than the screen — the section heading's total states
 * the pre-truncation scale verbatim.
 *
 * Three rows is measured (1512×862, dogfood vault, 294 concepts): with five rows
 * the "to do" tab reached 1,309px, exceeding the scroll contract (1.3× viewport =
 * 1,120px) by 189px. Cutting every section to three rows per type brings the tab
 * back into the 1,1xx range — enough to say "there are duplicates" and show the
 * three most suspicious pairs, with the rest answered by `similar_nodes`.
 */
const DUPLICATE_DISPLAY_LIMIT = 3;
/**
 * How many remaining duplicate pairs the collapsed disclosure layer carries.
 *
 * Measured 2026-07-27: the badge said "similar names 10" while the screen showed
 * three rows with no "show more". The other seven had **no way to be discovered**
 * on this screen. Printing a large total while quietly hiding the rest makes the
 * badge itself untrustworthy.
 *
 * The limit is a generous 24 because the expanded layer is **a fixed-height scroll
 * box** — the tab height does not grow with the row count (measured 1512×950,
 * dogfood: collapsed 982px, expanded 1,190px, both inside the scroll contract).
 * Screen space is not bought with rows here, so there is nothing to save; scale
 * beyond 24 is not something to skim on screen and is handed to the agent, as the
 * caption states.
 */
const DUPLICATE_DISCLOSURE_LIMIT = 24;
const RECENT_UPDATES_LIMIT = 8;
/**
 * How many rows the "recently updated" evidence layer expands to.
 *
 * Three is measured (1512×950, dogfood). Impact ranking puts four rows in the same
 * layer, but that card is a two-column grid so four rows fold into two lines. This
 * list is a single column, and at four rows the expanded "freshness" tab reaches
 * 1,102px in `en` — 18px short of the scroll contract (1,120px), so one longer
 * translation overflows it. Three rows returns to the 1,0xx range. The scale is
 * already stated by the toggle label and the truncation copy; what is needed here
 * is a sample of *what got demoted*.
 */
const RECENT_UPDATES_EVIDENCE_LIMIT = 3;

/** Each tab's question, transposed into an execution plan for the agent. */
const HANDOFF_PAYLOAD: Record<InsightsTab, string> = {
  "do-next": 'query_ontology({operation:"maintenance_plan"}) → 항목별 실행 → query_ontology({operation:"health"}) 로 재확인',
  composition: 'list_kinds({}) → query_ontology({operation:"overview"}) → 빈 정의는 validate_vault({}) 의 warnings 로 확인',
  connections: 'query_ontology({operation:"centrality"}) → query_ontology({operation:"blast_radius", slug:"<hub-slug>"})',
  boundaries: 'query_ontology({operation:"domain_matrix"}) → 교차 예시는 query_ontology({operation:"match_edges"})',
  freshness: 'query_ontology({operation:"maintenance_plan"}) → find_orphans({}) → query_ontology({operation:"growth_plan"})',
  // The only payload whose output is prose. It reads bodies rather than running an
  // operation, because a narrative rests on what the nodes say, not on a count.
  flow: 'list_concepts({summary:true}) → get_concepts({body:"full"}) 로 project 와 domain 본문 → 문단마다 슬러그 인용',
};

interface InsightsBadgeInput {
  verdictTotal: number;
  totalNodes: number;
  totalEdges: number;
  crossDomainEdges: number;
}

/**
 * What a tab badge counts. This is a repeating slot, so **all five must use the
 * same unit**. Freshness used to put a window length ("12 weeks") here; that slot
 * is now left empty, because a length is not a count and the tab body already says
 * how many weeks its window is. Leaving a slot empty and filling it with a
 * different unit are not the same thing — only the latter breaks the slot's meaning.
 */
const INSIGHTS_TAB_BADGE: Record<
  InsightsTab,
  (input: InsightsBadgeInput) => string | number | undefined
> = {
  "do-next": (i) => i.verdictTotal,
  composition: (i) => i.totalNodes,
  connections: (i) => i.totalEdges,
  boundaries: (i) => i.crossDomainEdges,
  // Prose, not a measurement — the same empty slot freshness uses, for the same
  // reason: a badge here would have to invent a unit the tab does not have.
  flow: () => undefined,
  freshness: () => undefined,
};

/**
 * `/ontology/insights` — the graph maintenance board, with one agent-handoff row
 * at the bottom.
 *
 * **One question per tab**: to do (what needs work now) · composition (what exists,
 * how much) · connections (what is central) · boundaries (how entangled the domains
 * are) · freshness (what moved). The former `structure` tab stacked the first three
 * questions into one column and grew to 2.2× the viewport — answering one question
 * meant scrolling past two unrelated screens.
 *
 * Every number derives from the data sources this page already used
 * (`useOntologyInsight`, `entities/knowledge-graph/lib/ontology-tree`); the census formula (total
 * nodes, edges, domains) is identical to the topology chrome's.
 */
export function OntologyInsightsPage() {
  const t = useTranslations("ontologyPages.insights");
  const kindLabel = useOntologyKindLabel();
  const edgeTypeLabel = useEdgeTypeLabel();
  const searchParams = useSearchParams();
  const [tab, setTabState] = useState<InsightsTab>(() =>
    parseInsightsTab(searchParams.get("tab")),
  );
  const { hostRef: insightsSwapHostRef, capture: captureInsightsHeight } = useSwapHeight(tab);
  const [reviewId, setReviewId] = useState<string | null>(() =>
    parseInsightsTab(searchParams.get("tab")) === "do-next"
      ? searchParams.get("review")
      : null,
  );

  const syncTabFromHistory = useEffectEvent(() => {
    const nextParams = new URL(window.location.href).searchParams;
    const nextTab = parseInsightsTab(nextParams.get("tab"));
    captureInsightsHeight();
    setTabState(nextTab);
    setReviewId(nextTab === "do-next" ? nextParams.get("review") : null);
  });

  useEffect(() => {
    window.addEventListener("popstate", syncTabFromHistory);
    return () => window.removeEventListener("popstate", syncTabFromHistory);
  }, []);

  // Settings moved from a top-right header pill to the same nav-rail gear the map
  // uses (see `useNavRailSettingsSlot` below). `AppSettingsMenu` closes its own
  // sheet on ⌘K ("one overlay owns one Escape"), so the search palette (a modal
  // with a scrim) and settings can never be open at once — the old controlled
  // mutual-exclusion state is unnecessary.
  const [searchPaletteOpen, setSearchPaletteOpen] = useState(false);
  useGlobalSearchHotkey(searchPaletteOpen, setSearchPaletteOpen);

  // Stamp the origin marker (`via=insights:<tab>`) onto map deeplinks. The map
  // (HomePage) reads it to render a "back to insights" chip that returns to this
  // tab. Every map-bound link on this page (hub, dependency, and freshness rows,
  // the to-do queue, the repair queue) goes through this one builder.
  const mapNodeHref = useCallback(
    (nodeId: string, exactReviewId?: string) =>
      buildOntologyNodeHref(nodeId, {
        via: buildInsightsReturnMarker(exactReviewId ? "do-next" : tab),
        reviewId: exactReviewId,
      }),
    [tab],
  );

  const router = useRouter();
  const { insight, error } = useOntologyInsight();
  const docFreshnessIndex = useVaultDocFreshnessIndex();
  const vault = useLocalVault();
  const dataSourceMode = useDataSourceMode();

  // At lg+ the nav rail's bottom gear opens settings, matching the map. Below lg
  // the chrome tile in the top utility lane takes over (the width where the rail is
  // hidden). Both uncontrolled, so only the visible trigger is clickable and no
  // double portal appears.
  const navRailSettingsSlot = useMemo(
    () => <AppSettingsMenu mode={dataSourceMode} triggerVariant="rail-tile" />,
    [dataSourceMode],
  );
  useNavRailSettingsSlot(navRailSettingsSlot);

  const nodes = insight?.nodes ?? EMPTY_NODES;
  const edges = insight?.edges ?? EMPTY_EDGES;
  const {
    conceptCount: totalNodes,
    relationCount: totalEdges,
    kindDistribution: kindDist,
  } = useMemo(
    () => computeInsightsCensus(nodes, edges),
    [nodes, edges],
  );
  /** Is the tab body drawn at all? If it falls through to an empty state, the badge must not state a number either. */
  const hasConcepts = totalNodes > 0;

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
  // Readiness counts relation quality **and validation errors** together. Counting
  // only edges made the meter 100% indigo even in a folder with five errors (the
  // risk segment measured 0px) — the single element on screen that speaks in colour
  // was saying exactly the opposite. A document that fails validation either never
  // becomes a node or collides on identity, so an agent cannot use it.
  const vaultValidation = useVaultValidationSummary();
  const agentReadiness = useMemo(() => {
    const counts = { strong: 0, supported: 0, weak: 0, review: 0 };
    for (const edge of edges) {
      counts[classifyRelationQuality(edge)] += 1;
    }
    return summarizeAgentReadiness(counts, vaultValidation.errorCount);
  }, [edges, vaultValidation.errorCount]);
  const edgeTypeSummary = useMemo(
    () => edgeTypeRows.slice(0, 4).map((r) => ({ key: r.type, label: edgeTypeLabel(r.type), count: r.count })),
    [edgeTypeRows, edgeTypeLabel],
  );
  // The repair queue, moved here from the map's left-rail health mode. It reuses the
  // same entities-level functions as the map's health chip
  // (`buildOntologyHealthSignals` / `buildOntologyHealthActionTarget`) and handles
  // only ontology-graph-level signals computed from the `nodes`/`edges` this page
  // already holds. The project-level stale/orphan detection behind the `/projects`
  // cards is out of scope — that is a project-entity lens reading a different source.
  const healthSignals = useMemo(() => buildOntologyHealthSignals(nodes, edges), [nodes, edges]);
  // CLI-parity health verdict (disconnected islands · missing domain containment)
  // read from the raw frontmatter, so the repair queue agrees with
  // `node $ATLAS/cli/src/index.mjs health` instead of falsely claiming there is nothing to repair.
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
      actionTargets: healthRepair.actionTargets,
      builderHref: buildTopologyMeaningEditorNodeHref,
      ontologyHref: mapNodeHref,
    }),
    [healthSignals, healthRepair, mapNodeHref],
  );

  // `computeDomainCouplingMatrix` existed with unit tests but had no UI consumer —
  // it could only be inspected through a CLI/MCP round trip. This card is its first
  // surface.
  const domainCoupling = useMemo(() => buildDomainCouplingSummary(nodes, edges), [nodes, edges]);

  const hubRanking = useMemo(() => rankAllByDegree(nodes, edges), [nodes, edges]);
  const hubs = useMemo<ConnectionHubRow[]>(
    () =>
      hubRanking.slice(0, HUB_DISPLAY_LIMIT).map(({ node, degree }) => ({
        id: node.id,
        // The short display title, for the hub ranking.
        title: node.display ?? node.title,
        kind: node.kind,
        degree,
        evidenceOnly: isEvidenceOnlyConcept(node),
      })),
    [hubRanking],
  );

  // Impact ranking — "if I change this, how far do I have to re-read?". It calls the
  // same `computeOntologyDependents` (the semantics of MCP `blast_radius`) as the map
  // drawer and the change diff. It is a full-node BFS, so it re-runs only when
  // nodes/edges change.
  const impact = useMemo(
    () => buildImpactRanking(nodes, edges, IMPACT_DISPLAY_LIMIT),
    [nodes, edges],
  );

  // Suspected duplicate pairs — how much the names, parents, and neighbours overlap.
  // A faithful mirror of MCP `similar_nodes`, so the pairs the screen names are the
  // pairs the agent answers with.
  const duplicates = useMemo(
    () =>
      buildDuplicatePairs(
        nodes,
        edges,
        DUPLICATE_DISPLAY_LIMIT,
        undefined,
        DUPLICATE_DISCLOSURE_LIMIT,
      ),
    [nodes, edges],
  );
  const duplicateHandoff = (row: DuplicatePairRow): string =>
    withDoNextVerification(
      `merge_concepts({fromSlug:"${row.dissolveSlug}", intoSlug:"${row.keepSlug}"}) 로 합칠 결과 미리보기 → 같은 뜻이 맞으면 같은 호출에 confirm:true 를 더해 실행`,
      `get_concept({slug:"${row.keepSlug}"}) 로 합쳐진 원문 확인`,
    );

  const freshness = useMemo(
    () =>
      computeFreshnessSummary(nodes, edges, docFreshnessIndex, new Date(), {
        recentLimit: RECENT_UPDATES_LIMIT,
        recentEvidenceLimit: RECENT_UPDATES_EVIDENCE_LIMIT,
      }),
    [nodes, edges, docFreshnessIndex],
  );

  // The activity digest reads the local vault's audit log tail (null in static mode).
  // The reference time is a mount snapshot — no `Date.now` during render.
  const [digestNowMs] = useState(() => Date.now());
  const activityDigest = useMemo(() => {
    const log = vault.agentActivityLog ?? [];
    if (log.length === 0) return null;
    const latest = log.slice(-3).reverse().map((entry) => ({
      at: entry.at,
      summary: entry.summary,
      agent: entry.agent,
  // `add_relation`'s `--why` was already stored in activity.jsonl but appeared on no
  // UI surface at all — users were asked to write a rationale with nowhere to read it.
  // The digest card shows it truncated beside the summary.
      why: entry.why,
    }));
    return { todayCount: countRecentEntries(log, digestNowMs), latest };
  }, [vault.agentActivityLog, digestNowMs]);

  // The "to do" queue is a combination of already-loaded derivations (health signals,
  // degree, freshness).
  //
  // Three rows per type is the ceiling that stops the card pushing the viewport out
  // each time a type is added (suspected duplicates did exactly that). Each section
  // still states its top three rows, the total, and "N more", so the scale is not
  // lost; the full list is carried by the handoff payload rather than the screen
  // (the tab ≤ 1.3× viewport contract).
  const doNextQueue = useMemo(
    () => buildDoNextQueue(nodes, edges, docFreshnessIndex, { perKindLimit: 3 }),
    [nodes, edges, docFreshnessIndex],
  );

  // What this session can actually do right now — the only input to the "mine first"
  // ordering and to the action labels. It invents no roles or accounts and uses only
  // facts the app already knows.
  const abilities = useMemo(
    () =>
      resolveSessionAbilities({
        dataSourceMode,
        vaultStatus: vault.status,
        reloadingSameVault: vault.isReloadingSameVault,
        agentActivity: vault.agentActivityStatus,
      }),
    [
      dataSourceMode,
      vault.status,
      vault.isReloadingSameVault,
      vault.agentActivityStatus,
    ],
  );

  // Work that ends in one sentence comes only from frontmatter facts in vault
  // documents (the source text, not a graph derivation). A derived concept with no
  // document never appears here.
  const conceptFacts = useVaultConceptFacts();
  const meaningGapResult = useMemo(
    () => buildMeaningGapRows(nodes, conceptFacts, { perKindLimit: 3 }),
    [nodes, conceptFacts],
  );
  const domainChoices = useMemo(() => buildDomainChoices(nodes), [nodes]);

  /**
   * Inline save of **one frontmatter field**. The file to write is only the `ownSlug`
   * the row carried in (decided by `resolveNodeDocument`); the path is never
   * re-inferred here — inferring it reopens the accident of writing into someone
   * else's document.
   *
   * `expectedMtime` is passed along so the save is refused if a person or an agent
   * edited the same file in between (no silent overwrite). A refusal is reported
   * inside the row, and the file is re-read so the next save works from current state.
   */
  const writeMeaningGap = useCallback(
    async (row: MeaningGapRow, value: string) => {
      const key = row.gap === "missing-definition" ? "description" : "domain";
      const written = row.gap === "missing-domain" ? canonicalizeDomainRef(value) : value;
      try {
        await vault.updateFrontmatter(
          row.ownSlug,
          { [key]: written },
          row.mtime === null ? {} : { expectedMtime: row.mtime },
        );
      } catch (error) {
        // On a conflict, re-read the current state so the next save is not blocked
        // again by a stale baseline. The error is rethrown so the row can say so honestly.
        if (error instanceof Error && error.name === "VaultConflictError") {
          await vault.refresh();
        }
        throw error;
      }
    },
    [vault],
  );

  // Dependency cycles — loops in the directed `depends_on` graph, computed on the
  // client from the already-loaded nodes/edges (the same semantics as MCP `cycles`).
  const dependencyCycles = useMemo(() => findDependencyCycles(nodes, edges), [nodes, edges]);
  const nodeById = useMemo(() => new Map(nodes.map((node) => [node.id, node])), [nodes]);
  const cycleNodeTitle = (nodeId: string): string => nodeById.get(nodeId)?.title ?? nodeId;
  // graph id → vault slug (evidenceIds[0]) — an MCP handoff uses the vault slug.
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
  /**
   * The address that hands this row to the map's agent. It carries **the kind of
   * intent, not a sentence**: the destination (the map) composes the sentence in the
   * screen's language with its opening-line generator, so the chips in an empty
   * conversation and a prefill arriving from here write one sentence. The address goes
   * through the same builder as every other map-bound link and keeps the return
   * marker, so the way back is never cut.
   */
  const askAgentHref = (nodeId: string, gap: MeaningGapKind): string | null =>
    // The agent surface exists only in the desktop app; this item is not emitted in a
    // browser. A link that goes somewhere and does nothing is a betrayal, not guidance.
    isLlmChatBridgeAvailable()
      ? buildOntologyNodeHref(nodeId, {
          via: buildInsightsReturnMarker("do-next"),
          ask: gap,
        })
      : null;
  const builderHref = (nodeId: string, exactReviewId?: string): string =>
    buildTopologyMeaningEditorNodeHref(nodeId, {
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
    // Only the query view of the same document changes. A Next router navigation moves
    // focus to the document root in the WebView, so the URL state is updated through
    // native history integration instead. Screen state and URL are aligned in the same
    // event, which keeps the TabBar's roving focus intact, and a re-entry or shared link
    // reads the URL back as the initial source of truth.
    const nextTab = next as InsightsTab;
    captureInsightsHeight();
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

  // Today's touch-ups: a pure function handles priority, truncation, and the
  // cold-start guard, and only the surface copy (`why`) is applied here. It is filled
  // only when truncation leaves exactly three items.
  const touchUpWhy = (item: TouchUpItem): string => {
    switch (item.reason.kind) {
      case "neglected-hub":
        // What follows "reason ·" must be a sentence. It used to reuse the repair
        // queue's metric copy ("8 connections · unchanged for 50 days"), so only
        // someone reading the numbers could tell why this item was picked.
        return t("doNext.touchUpWhyNeglectedHub", {
          degree: item.reason.degree,
          days: item.reason.agoDays,
        });
      case "cycle":
        return t("doNext.touchUpWhyCycle", { length: item.reason.length });
      case "promotion":
        // State the reference count verbatim — "several places" made three rows repeat
        // one phrase, and the number was already carried by the queue row.
        return t("doNext.touchUpWhyPromotion", { count: item.reason.fanIn });
    }
  };
  /**
   * Per-section totals for the "to do" queue — **the single source on this screen.**
   *
   * Both the verdict (the tab badge) and the group badges branch from here. They used
   * to keep separate lists, and duplicate pairs were missing from the verdict side, so
   * one screen showed the tab reading "to do 7" beside a group badge reading "8"
   * (measured 2026-08-07, sample vault).
   */
  const queueSectionTotals = useMemo<Record<QueueSectionKey, number>>(
    () => ({
      "missing-definition": meaningGapResult.counts.missingDefinition,
      "missing-domain": meaningGapResult.counts.missingDomain,
      duplicate: duplicates.suspectCount,
      promotion: doNextQueue.counts.promotion,
      "neglected-hub": doNextQueue.counts.neglectedHub,
      orphan: doNextQueue.counts.orphan,
      cycle: dependencyCycles.totalCycles,
    }),
    [
      meaningGapResult.counts,
      duplicates.suspectCount,
      doNextQueue.counts,
      dependencyCycles.totalCycles,
    ],
  );

  // The single verdict for this screen. The tab badge, the empty-state copy, and the
  // health claim must all come from here, or they say different things about one dataset.
  const insightsVerdict = useMemo(
    () =>
      buildInsightsVerdict({
        islands: healthRepair.islandCount,
        missingContainment: healthRepair.missingContainmentCount,
        sections: queueSectionTotals,
      }),
    [healthRepair, queueSectionTotals],
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
    noDomainsBody: t("noDomainsBody"),
    noDomainsAction: t("noDomainsAction"),
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
    evidenceBadge: t("evidenceBadge"),
    evidenceBadgeHint: t("evidenceBadgeHint"),
  };
  const impactLabels = {
    title: t("impactTitle"),
    caption: t("impactCaption"),
    directLabel: t("impactDirectLabel"),
    transitiveLabel: t("impactTransitiveLabel"),
    empty: t("impactEmpty"),
    emptyHint: t("impactEmptyHint"),
    truncated: (shown: number, total: number) => t("impactTruncated", { shown, total }),
    evidenceShow: (count: number) => t("evidenceShow", { count }),
    evidenceHide: t("evidenceHide"),
    evidenceCaption: t("impactEvidenceCaption"),
    evidenceTruncated: (shown: number, total: number) =>
      t("evidenceTruncated", { shown, total }),
    evidenceBadge: t("evidenceBadge"),
    evidenceBadgeHint: t("evidenceBadgeHint"),
    unknownTitle: t("impactUnknownTitle"),
    unknownDetail: (declared: number, rationale: number) =>
      t("impactUnknownDetail", { declared, rationale }),
    structureLink: t("impactStructureLink"),
  };
  const domainCouplingLabels = {
    title: t("domainCouplingTitle"),
    countUnit: t("domainCouplingCountUnit"),
    boundaryCountUnit: t("domainCouplingBoundaryCountUnit"),
    emptyTitle: t("domainCouplingEmptyTitle"),
    emptyDescription: t("domainCouplingEmptyDescription"),
    emptyAction: t("domainCouplingEmptyAction"),
    emptyActionHref: "/topology/?workbench=create",
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
    agentReadinessBlocked: t("agentReadinessBlocked"),
    agentReadinessBlockedBreakdown: (documents: number, relations: number) =>
      t("agentReadinessBlockedBreakdown", { documents, relations }),
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
    repairQueueRestShow: (count: number) => t("repairQueueRestShow", { count }),
    repairQueueRestHide: t("repairQueueRestHide"),
    queueTitle: t("doNext.queueTitle"),
    sectionNeglectedHub: t("doNext.sectionNeglectedHub"),
    sectionOrphan: t("doNext.sectionOrphan"),
    sectionPromotion: t("doNext.sectionPromotion"),
    sectionCycle: t("doNext.sectionCycle"),
    sectionDuplicate: t("doNext.sectionDuplicate"),
    hintDuplicate: t("doNext.hintDuplicate"),
    duplicateMetric: (percent: number) => t("doNext.duplicateMetric", { percent }),
    duplicateRestShow: (count: number) => t("doNext.duplicateRestShow", { count }),
    duplicateRestHide: t("doNext.duplicateRestHide"),
    duplicateTruncated: (shown: number, total: number) =>
      t("doNext.duplicateTruncated", { shown, total }),
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
    handoffCopyFailed: t("agentCopyFailed"),
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
    askAgent: t("doNext.askAgent"),
    reviewChecking: (title: string | null) =>
      t("doNext.reviewChecking", { title: title ?? t("doNext.reviewFallback") }),
    reviewActive: (title: string | null) =>
      t("doNext.reviewActive", { title: title ?? t("doNext.reviewFallback") }),
    reviewCleared: (title: string | null) =>
      t("doNext.reviewCleared", { title: title ?? t("doNext.reviewFallback") }),
    reviewUnverified: (title: string | null) =>
      t("doNext.reviewUnverified", { title: title ?? t("doNext.reviewFallback") }),
    evidenceBadge: t("evidenceBadge"),
    evidenceBadgeHint: t("evidenceBadgeHint"),
    openBuilderReadOnly: t("doNext.openBuilderReadOnly"),
    handoffCopyIdle: t("doNext.handoffCopyIdle"),
    handoffCopiedHint: t("doNext.handoffCopiedHint"),
    groupMeaningTitle: t("doNext.groupMeaningTitle"),
    groupMeaningTitleReadOnly: t("doNext.groupMeaningTitleReadOnly"),
    groupMeaningHint: t("doNext.groupMeaningHint"),
    groupMeaningHintReadOnly: t("doNext.groupMeaningHintReadOnly"),
    groupCodeTitle: t("doNext.groupCodeTitle"),
    groupCodeHint: t("doNext.groupCodeHint"),
  };
  // Copy for the inline write sections — the action labels (kebab, handoff) use the
  // **same keys** as the queue. Calling one action by different names per surface makes
  // a user read it as two features.
  const meaningGapCommon = {
    openSource: doNextLabels.openSource,
    openBuilder: doNextLabels.openBuilder,
    openBuilderReadOnly: doNextLabels.openBuilderReadOnly,
    handoffCopy: doNextLabels.handoffCopy,
    handoffCopyIdle: doNextLabels.handoffCopyIdle,
    handoffCopied: doNextLabels.handoffCopied,
    handoffCopyFailed: doNextLabels.handoffCopyFailed,
    handoffCopiedHint: doNextLabels.handoffCopiedHint,
    rowMenuTrigger: doNextLabels.rowMenuTrigger,
    askAgent: doNextLabels.askAgent,
    openMap: doNextLabels.openMap,
    writeHere: t("doNext.inlineWriteHere"),
    writeHereClose: t("doNext.inlineWriteHereClose"),
    definitionPlaceholder: t("doNext.inlineDefinitionPlaceholder"),
    domainLegend: t("doNext.inlineDomainLegend"),
    confirmDefinition: (file: string) => t("doNext.inlineConfirmDefinition", { file }),
    confirmDomain: (file: string, value: string) =>
      t("doNext.inlineConfirmDomain", { file, value }),
    save: t("doNext.inlineSave"),
    saving: t("doNext.inlineSaving"),
    cancel: t("doNext.inlineCancel"),
    cancelArmed: t("doNext.inlineCancelArmed"),
    saved: t("doNext.inlineSaved"),
    failed: (message: string) => t("doNext.inlineFailed", { message }),
    conflict: t("doNext.inlineConflict"),
    needsText: t("doNext.inlineNeedsText"),
    needsDomain: t("doNext.inlineNeedsDomain"),
    readOnlyHint: t("doNext.inlineReadOnlyHint"),
  };
  const meaningGapDefinitionLabels: MeaningGapLabels = {
    ...meaningGapCommon,
    sectionTitle: t("doNext.sectionMissingDefinition"),
    hint: t("doNext.hintMissingDefinition"),
  };
  const meaningGapDomainLabels: MeaningGapLabels = {
    ...meaningGapCommon,
    sectionTitle: t("doNext.sectionMissingDomain"),
    hint: t("doNext.hintMissingDomain"),
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
    // The toggle and badge copy of the evidence layer uses the **same strings** as the
    // "connections" tab — naming one layer differently per tab makes a learner read it as
    // something else. Only the caption differs per tab: there it is "what the number means",
    // here "whose date this is".
    evidenceShow: (count: number) => t("evidenceShow", { count }),
    evidenceHide: t("evidenceHide"),
    evidenceCaption: t("freshnessEvidenceCaption"),
    evidenceTruncated: (shown: number, total: number) =>
      t("evidenceTruncated", { shown, total }),
    evidenceBadge: t("evidenceBadge"),
    evidenceBadgeHint: t("evidenceBadgeHint"),
  };

  return (
    <VaultSourceHydrationBoundary>
    <div className="flex min-h-full w-full">
      {/* The rail lives in the layout (AppShell) since the persistent-shell work. */}
      {/*
        * **The height chain** (measured 2026-08-12). The vertical flex must run unbroken down
        * to the `main` below, or the tab panel's `flex-1` never receives the remaining height.
        * While it was broken: the `flex-1` on the "composition" cards (designed to forbid empty
        * bands) never once stretched, and 614px below the "boundaries" empty state was dead
        * space (measured at 1512×900). It is a `min-h-full` chain, so long content still grows
        * and scrolling is unchanged.
        */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/*
         * ⚠️ **The live indicator was removed** (2026-08-03, owner report — same reason as the
         * project list). "Live · N changed" is **the map's object**: it draws what changed onto
         * the nodes, so there the number leads to a next action. The maintenance board already
         * has its own numbers (to do · composition · connections · boundaries · freshness), and
         * another change count on top of them blurs **which number to read** while taking the
         * strongest ink in the top right.
         *
         * The row itself is `lg:hidden` because at the width where the rail carries settings there
         * is nothing left in this row, and an empty row holding space is a defect, not whitespace.
         */}
        <div className="flex items-center justify-end gap-2 px-4 pt-3 md:px-6 lg:hidden">
          <AppSettingsMenu mode={dataSourceMode} triggerVariant="chrome-tile" />
        </div>
        <main
          id="main"
      tabIndex={-1}
          data-insights-surface="maintenance-board"
          data-insights-question-model="one-tab-one-question"
          className={`${PAGE_FRAME} flex min-h-0 flex-1 flex-col pb-[calc(var(--topology-mobile-bottom-tab-reserve)+24px)] lg:pb-8`}
        >
        <MountedGlobalSearch open={searchPaletteOpen} onOpenChange={setSearchPaletteOpen} />

        <header className={PAGE_HEADER_ROW}>
          <div className={PAGE_TITLE_ROW}>
            <h1 className="text-display font-[var(--font-weight-signature)] tracking-[var(--tracking-card)] text-[color:var(--color-text-primary)]">
              {t("title")}
            </h1>
            <p className="max-w-xl text-body text-[color:var(--color-text-tertiary)]">
              {t("subtitle")}
            </p>
          </div>
          {insight ? (
            <span className="font-mono text-label tracking-[var(--tracking-caps-10)] text-[color:var(--topology-v2-numeral-face)]">
              {totalNodes} {t("censusConcepts")}
              <span className="mx-1.5 text-[color:var(--color-text-quaternary)]">·</span>
              {totalEdges} {t("censusRelations")}
              <span className="mx-1.5 text-[color:var(--color-text-quaternary)]">·</span>
              {domainCount} {t("censusDomains")}
            </span>
          ) : null}
        </header>
        {/* This surface is a maintenance board for power users — people who curate an ontology,
            and AI agents. Rather than rewriting all the copy, it declares its audience honestly so
            expectations match, and an ordinary visitor does not wander here looking for something
            like "my projects". */}
        <p className="mt-1 max-w-2xl text-body text-[color:var(--color-text-quaternary)]">
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
              // A badge is the scale of the question that tab answers, so each tab counts
              // something different.
              // The to-do badge comes from the single verdict model (`insights-verdict`). It used
              // to count only the do-next statistical signals and omit the CLI-parity ones
              // (disconnected islands, missing containment), producing the contradiction of a
              // repair queue showing one item beside a badge reading 0.
              // With zero concepts this page draws an empty state instead of the tab body. A badge
              // stating a number then makes **the screen contradict itself** — reproduced on a
              // vault connection 2026-07-28: a "to do 14" badge above a body reading "no ontology
              // concepts yet". That is the exact inverse of the earlier accident recorded above
              // (queue 1, badge 0).
              //
              // A badge is "the scale of the question that tab answers", and if the tab body that
              // would answer it is not drawn at all, that scale is 0.
              count: hasConcepts
                ? INSIGHTS_TAB_BADGE[key]({
                    verdictTotal: insightsVerdict.total,
                    totalNodes,
                    totalEdges,
                    crossDomainEdges: domainCoupling.crossDomainEdgeCount,
                  })
                : 0,
              // What an unlabelled number counts — one line, surfaced only on hover and to assistive tech.
              countTitle:
                key === "freshness" || key === "flow" ? undefined : t(`tabCountTitle.${key}`),
            }))}
          />
        </nav>

        {error ? (
          <div
            role="alert"
            className="mt-6 rounded-card border border-[color:var(--color-danger-a32)] bg-[color:var(--color-danger-a08)] px-5 py-4 text-body-lg text-[color:var(--color-status-danger)]"
          >
            {t("errorAlert", { message: error.message })}
          </div>
        ) : null}

        {!insight ? (
          <div
            role="status"
            aria-live="polite"
            className="mt-6 rounded-card border border-[color:var(--color-divider)] bg-[color:var(--color-overlay-1)] px-6 py-10 text-center text-body-lg text-[color:var(--color-text-tertiary)]"
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
                  <Link href={"/docs/"} className={controlClass({ shape: "link", className: "text-[color:var(--color-indigo-text-strong)] underline" })}>
                    {t("emptyTitleLink")}
                  </Link>
                  {t("emptyTitleAfter")}
                </>
              }
            />
          </div>
        ) : (
          // The content crossfades in while **the box jumped in one frame** (measured 878.5 →
          // 605px, a 246px jump for the whole document). The height is set one step (base) later
          // so the crossfade wraps the reflow.
          <div ref={insightsSwapHostRef} className="flex min-h-0 flex-1 flex-col">
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
                duplicateRest={duplicates.restRows}
                duplicateTotal={duplicates.suspectCount}
                duplicateHandoff={duplicateHandoff}
                agentReadiness={agentReadiness}
                healthQueue={healthQueue}
                mapHref={mapNodeHref}
                sourceHref={sourceHref}
                builderHref={builderHref}
                askAgentHref={askAgentHref}
                nodeTitle={cycleNodeTitle}
                cycleHandoff={cycleHandoff}
                activityDigest={activityDigest}
                reviewState={reviewState}
                onReviewStart={onReviewStart}
                abilities={abilities}
                meaningGaps={{
                  definitionRows: meaningGapResult.definitionRows,
                  domainRows: meaningGapResult.domainRows,
                  counts: meaningGapResult.counts,
                  domainChoices,
                  onWrite: writeMeaningGap,
                  definitionLabels: meaningGapDefinitionLabels,
                  domainLabels: meaningGapDomainLabels,
                }}
                labels={doNextLabels}
          // The read-only group heading says *"if you open your folder …"*, so the control that
          // does that is placed in the same box (2026-08-07, a dead-end CTA).
                openVaultAction={<OpenVaultCta testId="do-next-open-vault" />}
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
                domainLink={{
                  href: mapNodeHref,
                  // The bar is `aria-hidden`, so the row's three numbers are carried in the link
                  // name — a fact present on screen must not vanish for a screen reader (the same
                  // discipline as `impactRowAriaLabel` on the "connections" tab). The destination
                  // phrasing reuses the set the hub and freshness rows already use
                  // (`… : view on the map`); all this row adds is figures, so no new copy key is
                  // introduced. The order follows what is visible on screen (name → total →
                  // capabilities and elements).
                  ariaLabel: (row) =>
                    t("hubRowAriaLabel", {
                      title: `${row.title} ${row.total} · ${kindLabel("capability")} ${row.capabilityCount} · ${kindLabel("element")} ${row.elementCount}`,
                    }),
                }}
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
                  // The bar is `aria-hidden`, so the two numbers are carried in the link name — a
                  // fact present on screen must not vanish for a screen reader.
                  ariaLabel: ({ title, direct, total }) =>
                    t("impactRowAriaLabel", { title, direct, total }),
                  // The evidence layer reads the same number with a different meaning — not risk,
                  // but "how many concepts cite this name as evidence".
                  evidenceAriaLabel: ({ title, total }) =>
                    t("impactEvidenceRowAriaLabel", { title, total }),
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
                boundaryTotalCount={domainCoupling.boundaryTotalCount}
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
                recentEvidence={freshness.recentEvidence}
                recentEvidenceTotal={freshness.recentEvidenceTotal}
                staleCount={freshness.staleCount}
                weeklyTotals={freshness.weeklyTotals}
                kindLabel={kindLabel}
                recentLink={{
                  href: mapNodeHref,
                  ariaLabel: (title) => t("freshnessRowAriaLabel", { title }),
                }}
              />
            ) : null}
            {tab === "flow" ? (
              <FlowTab
                labels={{
                  title: t("flow.title"),
                  lead: t("flow.lead"),
                  action: t("flow.action"),
                  actionHint: t("flow.actionHint"),
                  requestLabel: t("flow.requestLabel"),
                  unavailableTitle: t("flow.unavailableTitle"),
                  unavailableBody: t("flow.unavailableBody"),
                  copy: t("flow.copy"),
                  copied: t("flow.copied"),
                  noVaultTitle: t("flow.noVaultTitle"),
                  noVaultBody: t("flow.noVaultBody"),
                }}
                request={buildBusinessFlowRequest({ request: t("flow.request") })}
                hasGraph={totalNodes > 0}
                hasOwnFolder={vault.status === "loaded"}
                canLaunchAgent={isAcpBridgeAvailable()}
                onPrefill={() => {
                  // The conversation lives beside the map, so pressing travels
                  // there and the request is rebuilt on arrival. The return
                  // marker is stamped so the map can offer the way back.
                  router.push(buildBusinessFlowHref(buildInsightsReturnMarker("flow")));
                }}
              />
            ) : null}
          </div>
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
    </VaultSourceHydrationBoundary>
  );
}
