"use client";

import { useCallback, useEffect, useEffectEvent, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Link, useRouter } from "@/i18n/navigation";
import { useSwapHeight } from "@/shared/lib/use-presence";
import { useDocumentTitle } from "@/shared/lib/use-document-title";
import { PAGE_FRAME, PAGE_HEADER_ROW, PAGE_TITLE_ROW } from "@/shared/ui/page-frame";
import { useLocale, useTranslations } from "next-intl";
import {
  buildEdgeTypeRows,
  buildInsightsReturnMarker,
  buildTopologyMeaningEditorNodeHref,
  buildOntologyNodeHref,
  isEvidenceOnlyConcept,
  useEdgeTypeLabel,
  type KnowledgeGraphEdge,
  type KnowledgeGraphNode,
  buildOntologyTree,
  computeEdgeTypeDistribution,
  rankAllByDegree,
  resolveNodeAgentTarget,
  type MeaningFindingGapKind,
} from "@/entities/knowledge-graph";
import {
  useOntologyInsight,
  useVaultConceptFacts,
  useVaultDocFreshnessIndex,
  useVaultHealth,
  useVaultHealthDocs,
  useVaultUnmatchedAsks,
  useVaultValidationSummary,
} from "@/features/vault-ontology";
import type { VaultDocumentIssue } from "@/shared/lib/validate-vault-document";
import {
  useDataSourceMode,
  VaultSourceHydrationBoundary,
  useLocalVault,
  useStaticVaultSource,
  useVaultIdentityScope,
} from "@/entities/vault-session";
import { OpenVaultCta } from "@/features/docs-vault-local";
import { buildDocsVaultHref } from "@/entities/docs-vault";
import { useOntologyKindLabel } from "@/entities/ontology-class";
import { AppSettingsMenu } from "@/widgets/app-settings-menu";
import { useNavRailSettingsSlot } from "@/widgets/app-nav-rail";
import { Button, EmptyState, TabBar, useToast } from "@/shared/ui";
import { SegmentedControl } from "@/shared/ui/segmented-control";
import {
  DEFAULT_INSIGHTS_TAB,
  INSIGHTS_CORES,
  ONTOLOGY_TABS,
  buildInsightsTabHref,
  coreOfTab,
  parseInsightsTab,
  tabOfCore,
  type InsightsTab,
} from "../lib/insights-tab-state";
import { buildUnmatchedBoard } from "../lib/unmatched-board";
import { useUnmatchedDismissals, writeUnmatchedDismissals } from "../lib/unmatched-dismissals";
import { UnmatchedTab, type UnmatchedTabLabels } from "./tabs/UnmatchedTab";
import { computeDomainCapacityRows } from "../lib/domain-capacity";
import {
  selectInsightsDocumentTitle,
  selectInsightsScopeTitle,
} from "../lib/insights-scope-title";
import {
  buildDoNextQueue,
  fillHandoffTemplate,
  withDoNextVerification,
} from "../lib/do-next-queue";
import { buildDuplicatePairs, type DuplicatePairRow } from "../lib/duplicate-pairs";
import {
  buildDomainChoices,
  buildMeaningGapRows,
  type MeaningGapRow,
} from "../lib/meaning-gap-rows";
import {
  insightsHandoffProse,
  type InsightsHandoffProse,
} from "../lib/handoff-prose";
import { resolveSessionAbilities } from "../lib/session-abilities";
import type { QueueSectionKey } from "../lib/queue-work-groups";
import { buildInsightsVerdict } from "../lib/insights-verdict";
import { buildBlockedDocumentRows, countBlockedDocuments } from "../lib/fix-list";
import { canonicalizeDomainRef } from "@/shared/lib/canonicalize-domain-ref";
import { findDependencyCycles, type DependencyCycle } from "../lib/dependency-cycles";
import {
  resolveDoNextReviewState,
} from "../lib/review-loop";
import { computeCensusHealth, computeInsightsCensus } from "../lib/census-health";
import { buildVaultHealthRepair } from "../lib/vault-health-repair";
import { buildDomainCouplingSummary } from "../lib/domain-coupling-rows";
import { FRESHNESS_WINDOW_WEEKS, computeFreshnessSummary } from "../lib/freshness";
import { OverviewTab } from "./tabs/OverviewTab";
import {
  InsightsCensusStrip,
  type InsightsCensusStripLabels,
} from "./parts/InsightsCensusStrip";
import { DoNextTab } from "./tabs/DoNextTab";
import { BriefTab } from "./tabs/BriefTab";
import { LibraryTab } from "./tabs/LibraryTab";
import { HarnessTab } from "./tabs/HarnessTab";
import { useInsightsBrief } from "../lib/brief/use-insights-brief";
import { buildDoNextGroupCounts, type DoNextGroupKey } from "../lib/do-next-groups";
import {
  buildContainmentPlan,
  buildContainmentProposals,
  runContainmentBatch,
  selectContainmentWrites,
  type ContainmentPlan,
  type ContainmentSkip,
} from "../lib/containment-batch";
import {
  ContainmentBatchSheet,
  type ContainmentBatchLabels,
  type ContainmentRowStatus,
} from "./parts/ContainmentBatchSheet";
import type { MeaningGapLabels } from "./tabs/MeaningGapSection";
import { ConnectionsTab, type ConnectionHubRow } from "./tabs/ConnectionsTab";
import { DomainCouplingCard } from "./tabs/DomainCouplingCard";
import { FreshnessTab } from "./tabs/FreshnessTab";
import { VaultHistorySection } from "./parts/VaultHistorySection";
import { useVaultHistory } from "../lib/use-vault-history";
import { FlowTab } from "./tabs/FlowTab";
import { buildBusinessFlowRequest } from "@/features/vault-agent";
import { getTauriVaultRootPath } from "@/shared/lib/tauri-vault-fs";
import {
  presentationRelationKeysForGraphEdge,
  analysisGraphFromInsight,
  currentAnalysisBasis,
  type AnalysisCaptureContext,
} from "@/features/acp-session";
import { InsightsHandoffRow } from "./parts/InsightsHandoffRow";
import { readAnalysisHistory, type AnalysisBasis, type AnalysisRecord } from "@/entities/analysis-record";
import { selectFlowVersions } from "../lib/flow-history";
import { InsightsAgentDock } from "./parts/InsightsAgentDock";
import { controlClass } from '@/shared/ui/control-class';
import { ICON_SIZE } from '@/shared/ui/icon-size';
import { MessageCircle } from 'lucide-react';
import {
  buildInsightsAgentPrompt,
  planInsightsAgentPrompt,
  type InsightsAgentPrefill,
  type InsightsAgentRoute,
} from '../lib/insights-agent';
import { useVaultAgentRuntime } from '@/widgets/acp-chat-panel';

const EMPTY_NODES: KnowledgeGraphNode[] = [];
const EMPTY_EDGES: KnowledgeGraphEdge[] = [];
const HUB_DISPLAY_LIMIT = 6;
/**
 * Impact rows shown. Twelve fold into two columns of six, so a row keeps the hub card's measure;
 * measured against the scroll contract (a tab is at most 1.3x the viewport).
 */
const IMPACT_DISPLAY_LIMIT = 12;
/**
 * Duplicate rows shown; the section total states the pre-truncation count and the handoff carries the rest.
 * Measured at 1512x862 (dogfood, 294 concepts): five rows pushed the tab 189px past the scroll contract.
 */
const DUPLICATE_DISPLAY_LIMIT = 3;
/**
 * Rows the collapsed duplicate layer carries, so every pair the badge counts is reachable.
 * The layer is a fixed-height scroll box, so the tab height does not grow with this limit.
 */
const DUPLICATE_DISCLOSURE_LIMIT = 24;
/**
 * Rows per kind in the to-do list. Each kind is a collapsed group, so the viewport is bounded by
 * group heads; five rows is what an opened group shows before its remainder line.
 */
const DO_NEXT_PER_KIND_LIMIT = 5;

/**
 * What a group's "show all" raises the limit to. The queue is built to this limit, so the rows the
 * control reveals exist; the group head keeps the true count and the remainder line covers the rest.
 */
const DO_NEXT_SHOW_ALL_LIMIT = 50;
/** Codes with their own sentence; any other code falls back to `blockedReason.other`, so a blocked row always says why. */
const BLOCKED_REASON_KEYS: ReadonlySet<VaultDocumentIssue["code"]> = new Set([
  "unclosed-frontmatter",
  "malformed-frontmatter-line",
  "malformed-quoted-scalar",
  "empty-kind",
  "missing-uid",
  "invalid-uid",
  "invalid-merged-uids",
  "duplicate-uid",
]);
const RECENT_UPDATES_LIMIT = 8;
/**
 * Rows the recent-updates evidence layer expands to. Measured at 1512x950 (dogfood): four rows left the `en`
 * growth tab 18px short of the scroll contract, so a longer translation would overflow it.
 */
const RECENT_UPDATES_EVIDENCE_LIMIT = 3;

/**
 * Each tab's agent handoff prose key. The strings live in `../lib/handoff-prose` as typed locale data
 * because their MCP-call braces cannot enter the ICU message catalog.
 */
const HANDOFF_PAYLOAD_KEY: Record<InsightsTab, keyof InsightsHandoffProse> = {
  // The brief, library and harness draw no generic handoff row; these keys only complete the record.
  brief: "tabDoNext",
  library: "tabDoNext",
  harness: "tabDoNext",
  "do-next": "tabDoNext",
  unmatched: "tabUnmatched",
  composition: "tabComposition",
  connections: "tabConnections",
  boundaries: "tabBoundaries",
  growth: "tabGrowth",
  flow: "tabFlow",
};

interface InsightsBadgeInput {
  verdictTotal: number;
  totalNodes: number;
  totalEdges: number;
  crossDomainEdges: number;
  /** What the vault says, not what this viewer hid: a badge that shrank on dismissal would report a preference. */
  unmatchedTotal: number;
}

/**
 * A tab badge is a repeating slot, so every populated badge counts in the same unit;
 * a tab without a count leaves the slot empty rather than filling it with another unit.
 */
const INSIGHTS_TAB_BADGE: Record<
  InsightsTab,
  (input: InsightsBadgeInput) => string | number | undefined
> = {
  // The brief, library and harness have no single count; their panels carry their own.
  brief: () => undefined,
  library: () => undefined,
  harness: () => undefined,
  "do-next": (i) => i.verdictTotal,
  unmatched: (i) => i.unmatchedTotal,
  composition: (i) => i.totalNodes,
  connections: (i) => i.totalEdges,
  boundaries: (i) => i.crossDomainEdges,
  // Flow is prose; a badge would have to invent a unit the tab does not have.
  flow: () => undefined,
  growth: () => undefined,
};

/** `/ontology/insights`: the graph maintenance board, one question per tab, with one agent-handoff row at the bottom. */
export function OntologyInsightsPage() {
  const t = useTranslations("ontologyPages.insights");
  const toast = useToast();
  // Handoff prose is typed locale data, not messages: its MCP-call braces fail the ICU catalog gate.
  const locale = useLocale();
  const handoffProse = useMemo(() => insightsHandoffProse(locale), [locale]);
  const kindLabel = useOntologyKindLabel();
  const edgeTypeLabel = useEdgeTypeLabel();
  const searchParams = useSearchParams();
  const [tab, setTabState] = useState<InsightsTab>(() =>
    parseInsightsTab(searchParams.get("tab")),
  );
  const { hostRef: insightsSwapHostRef, capture: captureInsightsHeight } = useSwapHeight(tab);
  const insightsPanelRef = useRef<HTMLDivElement>(null);
  /** Set only by a brief destination, so the question row's roving focus is never disturbed. */
  const focusPanelAfterSwitch = useRef(false);
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

  // Settings use the nav-rail gear (`useNavRailSettingsSlot`); the search palette is the shell's (`ShellKeyboardSurfaces`).

  // Every map-bound link here stamps `via=insights:<tab>`, which the map reads to draw a "back to insights" chip.
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
  const staticVaultSource = useStaticVaultSource();
  const gitVaultPath = vault.handle ? getTauriVaultRootPath(vault.handle) ?? null : null;
  // Connectors stay off: this page never handed the session its connectors.
  const vaultAgent = useVaultAgentRuntime(gitVaultPath, { connectors: false });
  // Counted from the manifest the board draws, not only the local one, and classified by the history's path rule,
  // so the present and the past are counted the same way; the local manifest is empty on the bundled sample.
  const historyManifest =
    dataSourceMode === "static" ? staticVaultSource.manifest : vault.manifest;
  const vaultHistory = useVaultHistory(
    gitVaultPath,
    historyManifest?.docs,
    historyManifest?.sources?.map((source) => source.path),
  );
  const acpRuntimes = vaultAgent.runtimes;
  const setAcpRuntimeId = vaultAgent.setRuntimeId;
  const [agentOpen, setAgentOpen] = useState(false);
  const [agentDraftPresent, setAgentDraftPresent] = useState(false);
  const [agentPrefill, setAgentPrefill] = useState<InsightsAgentPrefill | null>(null);
  const analysisContext = useMemo<AnalysisCaptureContext>(() => {
    const projects = (insight?.nodes ?? []).filter((node) => node.kind === 'project');
    const projectSlug = projects.length === 1 ? resolveNodeAgentTarget(projects[0]).ref : null;
    const project = vault.manifest?.docs.find((doc) => doc.slug === projectSlug);
    return {
      mode: 'meaning', surface: 'analysis', handle: dataSourceMode === 'local' ? vault.handle : null,
      writable: dataSourceMode === 'local' && vault.status === 'loaded', fileHandles: vault.fileHandles,
      scope: { projectSlug, projectUid: typeof project?.frontmatter.uid === 'string' ? project.frontmatter.uid : null, targetSlugs: [], profileSlug: null },
      graph: analysisGraphFromInsight(insight), sourceFingerprint: null, profileHash: null,
    };
  }, [insight, vault.manifest, vault.handle, vault.status, vault.fileHandles, dataSourceMode]);


  const acpRuntime = vaultAgent.runtime;
  const acpMcpServers = vaultAgent.mcpServers;
  // The shared hook says `unavailable`; this page calls it `clipboard`.
  const agentRoute: InsightsAgentRoute = vaultAgent.route === 'unavailable' ? 'clipboard' : vaultAgent.route;

  // At lg+ the nav-rail gear opens settings; below lg the top utility tile does. Both are uncontrolled,
  // so only the visible trigger is clickable and no double portal appears.
  const navRailSettingsSlot = useMemo(
    () => <AppSettingsMenu mode={dataSourceMode} triggerVariant="rail-tile" />,
    [dataSourceMode],
  );
  useNavRailSettingsSlot(navRailSettingsSlot);

  // A bundled sample is not the person's folder, so the scope title names the sample. Static export
  // bakes one <title> per route, so the sample title can only be applied on the client.
  const scopeTitle = selectInsightsScopeTitle(dataSourceMode, {
    sample: t("titleSample"),
    folder: t("title"),
  });
  const scopeSubtitle = selectInsightsScopeTitle(dataSourceMode, {
    sample: t("subtitleSample"),
    folder: t("subtitle"),
  });
  useDocumentTitle(selectInsightsDocumentTitle(dataSourceMode, t("documentTitleSample")));

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
  /** When the tab body falls through to an empty state, the badge must not state a number either. */
  const hasConcepts = totalNodes > 0;
  const agentSlugByNodeId = useMemo(
    () => new Map(nodes.map((node) => [
      node.id,
      resolveNodeAgentTarget(node).ref ?? node.id,
    ])),
    [nodes],
  );
  const agentNodeIdBySlug = useMemo(
    () => new Map([...agentSlugByNodeId].map(([nodeId, slug]) => [slug, nodeId])),
    [agentSlugByNodeId],
  );
  const agentKnownSlugs = useMemo(
    () => new Set(agentSlugByNodeId.values()),
    [agentSlugByNodeId],
  );
  const agentKindByNodeId = useMemo(
    () => new Map(nodes.map((node) => [node.id, node.kind])),
    [nodes],
  );
  const agentKnownRelations = useMemo(
    () => new Set(edges.flatMap((edge) => presentationRelationKeysForGraphEdge({
      from: agentSlugByNodeId.get(edge.from) ?? edge.from,
      to: agentSlugByNodeId.get(edge.to) ?? edge.to,
      type: edge.type,
      toKind: agentKindByNodeId.get(edge.to) ?? null,
    }))),
    [agentKindByNodeId, agentSlugByNodeId, edges],
  );
  const flowRequest = useMemo(
    () => buildBusinessFlowRequest({ request: t('flow.request') }),
    [t],
  );
  const agentPromptForTab = useCallback(
    (kind: InsightsTab) => buildInsightsAgentPrompt({
      locale,
      kind,
      handoff: handoffProse[HANDOFF_PAYLOAD_KEY[kind]],
      flowRequest,
    }),
    [flowRequest, handoffProse, locale],
  );
  const commitAgentPrefill = useCallback((request: InsightsAgentPrefill) => {
    setAgentPrefill(request);
    setAgentOpen(true);
  }, []);
  const openAgentForTab = useCallback((kind: InsightsTab) => {
    if (agentRoute !== 'agent') return;
    const plan = planInsightsAgentPrompt({
      current: agentPrefill,
      draftPresent: agentDraftPresent,
      kind,
      text: agentPromptForTab(kind),
    });
    if (plan.action === 'open-current') {
      setAgentOpen(true);
      return;
    }
    if (plan.action === 'seat') {
      commitAgentPrefill(plan.request);
      return;
    }
    setAgentOpen(true);
    toast.show(t('agentDraftHeld'), 'info', {
      label: t('agentReplaceDraft'),
      onClick: () => commitAgentPrefill(plan.request),
    });
  }, [
    agentDraftPresent,
    agentPrefill,
    agentPromptForTab,
    agentRoute,
    commitAgentPrefill,
    t,
    toast,
  ]);
  // The flow tab reads completed analysis turns recorded beside the vault back as versions.
  const [flowArchive, setFlowArchive] = useState<{
    handle: FileSystemDirectoryHandle | null;
    records: readonly AnalysisRecord[];
    basis: AnalysisBasis | null;
  }>({ handle: null, records: [], basis: null });
  const flowHandle = tab === "flow" ? analysisContext.handle : null;
  useEffect(() => {
    if (!flowHandle) return;
    let cancelled = false;
    const load = () => {
      void Promise.all([
        readAnalysisHistory(flowHandle, { limit: 20 }).catch(() => null),
        currentAnalysisBasis(analysisContext, []).catch(() => null),
      ]).then(([page, basis]) => {
        // An unreadable archive is no versions, never a wrong one.
        if (!cancelled) setFlowArchive({ handle: flowHandle, records: page?.records ?? [], basis });
      });
    };
    load();
    window.addEventListener("atlas-analysis-records-changed", load);
    return () => {
      cancelled = true;
      window.removeEventListener("atlas-analysis-records-changed", load);
    };
  }, [flowHandle, analysisContext]);
  // A folder that closed or changed never keeps the previous folder's versions on screen.
  const flowVersions = useMemo(
    () =>
      flowArchive.handle && flowArchive.handle === flowHandle
        ? selectFlowVersions(flowArchive.records, analysisContext, flowArchive.basis)
        : [],
    [flowArchive, flowHandle, analysisContext],
  );

  const agentContextLabel = agentPrefill
    ? t('agentContext', { tab: t(`tab.${agentPrefill.kind}`) })
    : '';
  const openPresentationOnMap = useCallback((slug: string) => {
    const nodeId = agentNodeIdBySlug.get(slug);
    if (!nodeId) return;
    router.push(mapNodeHref(nodeId));
  }, [agentNodeIdBySlug, mapNodeHref, router]);

  const kindRows = useMemo(
    () =>
      Array.from(kindDist.entries())
        .map(([kind, count]) => ({ kind, count }))
        .sort((a, b) => b.count - a.count),
    [kindDist],
  );

  const treeResult = useMemo(() => buildOntologyTree(nodes, edges), [nodes, edges]);
  const health = useMemo(() => computeCensusHealth(nodes, edges, treeResult), [nodes, edges, treeResult]);
  const domainRows = useMemo(() => computeDomainCapacityRows(nodes, edges), [nodes, edges]);

  const edgeTypeDist = useMemo(() => computeEdgeTypeDistribution(edges), [edges]);
  const edgeTypeRows = useMemo(() => buildEdgeTypeRows(edgeTypeDist), [edgeTypeDist]);
  // Validated by the same `summarizeVaultValidation` the settings sheet uses. A document that fails validation
  // is unusable to an agent, so it counts on the blocking side of the verdict.
  const vaultValidation = useVaultValidationSummary();

  /** Raised once, by a group asking for its whole list. Kinds share one supply, so all groups gain. */
  const [doNextShowAllRows, setDoNextShowAllRows] = useState(false);
  const doNextPerKindLimit = doNextShowAllRows ? DO_NEXT_SHOW_ALL_LIMIT : DO_NEXT_PER_KIND_LIMIT;

  const blockedDocuments = useMemo(
    () => buildBlockedDocumentRows(vaultValidation, doNextPerKindLimit),
    [vaultValidation, doNextPerKindLimit],
  );
  const blockedDocumentCount = useMemo(
    () => countBlockedDocuments(vaultValidation),
    [vaultValidation],
  );
  const edgeTypeSummary = useMemo(
    () => edgeTypeRows.slice(0, 4).map((r) => ({ key: r.type, label: edgeTypeLabel(r.type), count: r.count })),
    [edgeTypeRows, edgeTypeLabel],
  );
  // CLI-parity health (islands, missing containment) from raw frontmatter, so the screen agrees with the CLI `health` command.
  const vaultHealth = useVaultHealth();
  const healthRepair = useMemo(
    () => buildVaultHealthRepair(vaultHealth, nodes),
    [vaultHealth, nodes],
  );

  // Documents from the manifest the health verdict used (`useVaultHealthDocs`), so the repair touches only the folder
  // the verdict measured. `buildContainmentProposals` decides nothing: both halves of each write are already on disk.
  const healthDocs = useVaultHealthDocs();
  const containmentProposals = useMemo(
    () => buildContainmentProposals(vaultHealth.missingContainment, healthDocs),
    [vaultHealth.missingContainment, healthDocs],
  );
  // Rows and write plan freeze when the sheet opens. A live list would drop the "written" row after the re-read,
  // and an mtime read at Apply would compare a changed file against itself and pass.
  const [containmentPlan, setContainmentPlan] = useState<ContainmentPlan | null>(null);
  const [containmentSheetOpen, setContainmentSheetOpen] = useState(false);
  const [containmentRunning, setContainmentRunning] = useState(false);
  const [containmentFinished, setContainmentFinished] = useState(false);
  const [containmentStatuses, setContainmentStatuses] = useState<
    ReadonlyMap<string, ContainmentRowStatus>
  >(() => new Map());

  // References agents asked for and did not get, from the same manifest as `vaultHealth` (`useHealthManifest`), so count
  // and list describe one folder. Dismissals are per viewer and vault (`unmatched-dismissals.ts`).
  const unmatchedAsks = useVaultUnmatchedAsks();
  const vaultScope = useVaultIdentityScope();
  const [unmatchedDismissed, setUnmatchedDismissed] = useUnmatchedDismissals(vaultScope);
  const unmatchedBoard = useMemo(
    () =>
      buildUnmatchedBoard({ asks: unmatchedAsks.asks }, unmatchedDismissed),
    [unmatchedAsks, unmatchedDismissed],
  );
  const unmatchedLabels: UnmatchedTabLabels = useMemo(
    () => ({
      title: t("unmatched.title"),
      caption: t("unmatched.caption"),
      occurrences: (count) => t("unmatched.occurrences", { count }),
      askedByPrefix: t("unmatched.askedByPrefix"),
      writtenUnder: (keys) => t("unmatched.writtenUnder", { keys }),
      dismiss: (name) => t("unmatched.dismiss", { name }),
      hiddenMarker: (count) => t("unmatched.hiddenMarker", { count }),
      hiddenNote: (count) => t("unmatched.hiddenNote", { count }),
      pending: t("unmatched.pending"),
      footnote: t("unmatched.footnote"),
      emptyTitle: t("unmatched.emptyTitle"),
      emptyDescription: t("unmatched.emptyDescription"),
      emptyAction: t("unmatched.emptyAction"),
    }),
    [t],
  );

  const domainCoupling = useMemo(() => buildDomainCouplingSummary(nodes, edges), [nodes, edges]);

  const hubRanking = useMemo(() => rankAllByDegree(nodes, edges), [nodes, edges]);
  const hubs = useMemo<ConnectionHubRow[]>(
    () =>
      hubRanking.slice(0, HUB_DISPLAY_LIMIT).map(({ node, degree }) => ({
        id: node.id,
        title: node.display ?? node.title,
        kind: node.kind,
        degree,
        evidenceOnly: isEvidenceOnlyConcept(node),
      })),
    [hubRanking],
  );

  // Mirrors MCP `similar_nodes`, so the pairs the screen names are the pairs the agent answers with.
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
      fillHandoffTemplate(handoffProse.duplicate, {
        dissolve: row.dissolveSlug,
        keep: row.keepSlug,
      }),
      fillHandoffTemplate(handoffProse.duplicateProof, { keep: row.keepSlug }),
      handoffProse.verificationGate,
    );

  const freshness = useMemo(
    () =>
      computeFreshnessSummary(nodes, edges, docFreshnessIndex, new Date(), {
        recentLimit: RECENT_UPDATES_LIMIT,
        recentEvidenceLimit: RECENT_UPDATES_EVIDENCE_LIMIT,
      }),
    [nodes, edges, docFreshnessIndex],
  );

  // Each section states its top rows, total and "N more"; the handoff payload carries the full list (tab <= 1.3x viewport).
  const doNextQueue = useMemo(
    () =>
      buildDoNextQueue(nodes, edges, docFreshnessIndex, {
        perKindLimit: doNextPerKindLimit,
        prose: handoffProse,
      }),
    [nodes, edges, docFreshnessIndex, handoffProse, doNextPerKindLimit],
  );

  // What this session can do now: the only input to "mine first" ordering and the action labels.
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

  // Only frontmatter facts in vault documents; a derived concept with no document never appears here.
  const conceptFacts = useVaultConceptFacts();
  const meaningGapResult = useMemo(
    () =>
      buildMeaningGapRows(nodes, conceptFacts, {
        perKindLimit: doNextPerKindLimit,
        prose: handoffProse,
      }),
    [nodes, conceptFacts, handoffProse, doNextPerKindLimit],
  );
  const domainChoices = useMemo(() => buildDomainChoices(nodes), [nodes]);

  /**
   * Saves one frontmatter field to the row's `ownSlug` only; re-inferring the path could write someone else's document.
   * The expected mtime refuses the save if the file changed in between; the row reports it and the file is re-read.
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
        // Re-read so the next save does not hit the stale baseline; rethrow so the row can say so.
        if (error instanceof Error && error.name === "VaultConflictError") {
          await vault.refresh();
        }
        throw error;
      }
    },
    [vault],
  );

  /**
   * Applies repairs one document at a time; the plan groups writes per file, or the second write
   * to a file fails its own `expected_mtime` guard. A conflict is refused, not overwritten, and the run continues over independent documents.
   */
  const applyContainmentBatch = useCallback(
    async (accepted: ReadonlySet<string>) => {
      if (!containmentPlan) return;
      const run = selectContainmentWrites(containmentPlan, accepted, healthDocs);
      if (run.writes.length === 0 && run.skipped.length === 0) return;
      setContainmentRunning(true);
      await runContainmentBatch(run, {
        write: (write) =>
          vault.updateFrontmatter(
            write.domainSlug,
            { [write.key]: write.members },
            { skipRefresh: true, expectedMtime: write.expectedMtime },
          ),
        skipMessage: (skip: ContainmentSkip) =>
          skip.reason === "unknown-mtime"
            ? t("doNext.containmentBatch.statusSkippedUnknownTime", { domain: skip.domainPath })
            : t("doNext.containmentBatch.statusSkippedDomainChanged", { domain: skip.domainPath }),
        onStatuses: (statuses) => setContainmentStatuses(statuses),
      });
      // One reload at the end (`skipRefresh` held it off), also after a conflict, so a retry starts from disk.
      await vault.refresh();
      setContainmentRunning(false);
      setContainmentFinished(true);
    },
    [containmentPlan, healthDocs, t, vault],
  );

  // Same semantics as MCP `cycles`.
  const dependencyCycles = useMemo(() => findDependencyCycles(nodes, edges), [nodes, edges]);
  const nodeById = useMemo(() => new Map(nodes.map((node) => [node.id, node])), [nodes]);
  const cycleNodeTitle = (nodeId: string): string => nodeById.get(nodeId)?.title ?? nodeId;
  // MCP handoffs use the vault slug (`evidenceIds[0]`), not the graph id.
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
    buildTopologyMeaningEditorNodeHref(nodeId, {
      via: exactReviewId ? buildInsightsReturnMarker("do-next") : null,
      reviewId: exactReviewId,
    });
  const cycleHandoff = (cycle: DependencyCycle): string => {
    const closed = [...cycle.nodeIds.map(cycleMcpRef), cycleMcpRef(cycle.nodeIds[0])].join(" → ");
    return withDoNextVerification(
      fillHandoffTemplate(handoffProse.cycle, { cycle: closed }),
      handoffProse.cycleProof,
      handoffProse.verificationGate,
    );
  };

  // Stable identity: a brief destination composes on it, and the panel-focus effect is keyed off it.
  const setTab = useCallback((next: string) => {
    // Only the query changes; a Next router navigation would move WebView focus to the document root and break the
    // TabBar's roving focus, so native history updates the URL in the same event.
    const nextTab = next as InsightsTab;
    captureInsightsHeight();
    setTabState(nextTab);
    setReviewId(null);
    window.history.replaceState(
      window.history.state,
      "",
      buildInsightsTabHref(nextTab, window.location.pathname),
    );
  }, [captureInsightsHeight]);

  /** Opens another question from a brief line and moves focus to the new panel, which is re-keyed on every switch. */
  const openTabFromBrief = useCallback((next: InsightsTab) => {
    focusPanelAfterSwitch.current = true;
    setTab(next);
  }, [setTab]);

  useLayoutEffect(() => {
    if (!focusPanelAfterSwitch.current) return;
    focusPanelAfterSwitch.current = false;
    insightsPanelRef.current?.focus();
  }, [tab]);

  const findingReviewRows = useMemo(
    () => Object.values(meaningGapResult.findingRows).flat(),
    [meaningGapResult.findingRows],
  );
  const activeReviewIds = useMemo(
    () =>
      new Set([
        ...doNextQueue.activeRowIds,
        ...dependencyCycles.activeCycleIds.map((id) => `cycle:${id}`),
        ...findingReviewRows.map((row) => row.id),
      ]),
    [doNextQueue.activeRowIds, dependencyCycles.activeCycleIds, findingReviewRows],
  );
  // A finding section cut to its display limit cannot say a row past the cut is gone.
  const limitedReviewPrefixes = useMemo(
    () =>
      new Set(
        (Object.keys(meaningGapResult.findingRows) as MeaningFindingGapKind[]).filter(
          (kind) =>
            meaningGapResult.counts.findings[kind] > meaningGapResult.findingRows[kind].length,
        ),
      ),
    [meaningGapResult.findingRows, meaningGapResult.counts.findings],
  );
  const titleByReviewId = useMemo(() => {
    const titles = new Map<string, string>();
    for (const row of doNextQueue.rows) titles.set(row.id, row.title);
    for (const row of findingReviewRows) titles.set(row.id, row.title);
    for (const cycle of dependencyCycles.cycles) {
      const firstNodeId = cycle.nodeIds[0];
      titles.set(
        `cycle:${cycle.id}`,
        nodeById.get(firstNodeId)?.title ?? firstNodeId,
      );
    }
    return titles;
  }, [doNextQueue.rows, dependencyCycles.cycles, nodeById, findingReviewRows]);
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
        limitedPrefixes: limitedReviewPrefixes,
      }),
    [
      reviewId,
      reviewAuthoritative,
      activeReviewIds,
      titleByReviewId,
      dependencyCycles.limited,
      limitedReviewPrefixes,
    ],
  );
  const onReviewStart = useCallback(
    (candidate: { id: string; title: string }) => {
      setReviewId(candidate.id);
      const next = new URL(window.location.href);
      // Keep `tab`: the board opens on the brief, so dropping it would reload a review on the wrong question.
      next.searchParams.set("review", candidate.id);
      window.history.replaceState(
        window.history.state,
        "",
        `${next.pathname}?${next.searchParams.toString()}${next.hash}`,
      );
    },
    [],
  );

  /** Per-section to-do totals, the single source for both the tab badge and the group badges, so they cannot disagree. */
  const queueSectionTotals = useMemo<Record<QueueSectionKey, number>>(
    () => ({
      "missing-definition": meaningGapResult.counts.missingDefinition,
      "missing-boundary": meaningGapResult.counts.findings["missing-boundary"],
      "missing-uncertainty": meaningGapResult.counts.findings["missing-uncertainty"],
      "epistemic-exclusion": meaningGapResult.counts.findings["epistemic-exclusion"],
      "slug-outside-kind-folder":
        meaningGapResult.counts.findings["slug-outside-kind-folder"],
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

  // The single verdict: tab badge, empty-state copy and health claim all come from here, or they contradict each other.
  const insightsSignalCounts = useMemo(
    () => ({
      islands: healthRepair.islandCount,
      missingContainment: healthRepair.missingContainmentCount,
      blockedDocuments: blockedDocumentCount,
      sections: queueSectionTotals,
    }),
    [healthRepair, blockedDocumentCount, queueSectionTotals],
  );
  const insightsVerdict = useMemo(
    () => buildInsightsVerdict(insightsSignalCounts),
    [insightsSignalCounts],
  );
  const briefNodes = useMemo(
    () =>
      (insight?.nodes ?? []).map((node) => ({
        id: node.id,
        kind: node.kind,
        title: node.title,
        createdBy: node.createdBy ?? null,
        docSlug: node.evidenceIds[0] ?? null,
      })),
    [insight],
  );
  const brief = useInsightsBrief({
    nodes: briefNodes,
    repairCount: insightsVerdict.total,
    unmatchedCount: unmatchedBoard.totalCount,
    // The library and harness panels read the same model.
    enabled: tab === "brief" || tab === "library" || tab === "harness",
  });
  const measuredHarness = tab === "harness" && brief.harnessDetail.availability === "measured";
  // Where the handoff row is drawn the panel takes its content height, so the row sits under the content
  // instead of being pinned to the bottom across empty background.
  const handoffShown = coreOfTab(tab) === "ontology" && tab !== "do-next" && !agentOpen;
  const panelFills = measuredHarness || !handoffShown;
  /**
   * Group counts re-key the verdict's `InsightsSignalCounts`, so groups and title cannot drift; the
   * contract `tests/contract/do-next-group-sum.contract.test.ts` pins the equality.
   */
  const doNextGroupCounts = useMemo(
    () => buildDoNextGroupCounts(insightsSignalCounts),
    [insightsSignalCounts],
  );

  const containmentBatchLabels: ContainmentBatchLabels = {
    title: (count: number) => t("doNext.containmentBatch.title", { count }),
    lede: t("doNext.containmentBatch.lede"),
    row: (concept: string, domain: string, key: string) =>
      t("doNext.containmentBatch.row", { concept, domain, key }),
    rowTarget: (domainPath: string, conceptSlug: string) =>
      t("doNext.containmentBatch.rowTarget", { domain: domainPath, concept: conceptSlug }),
    apply: (count: number) => t("doNext.containmentBatch.apply", { count }),
    applying: t("doNext.containmentBatch.applying"),
    cancel: t("doNext.containmentBatch.cancel"),
    close: t("doNext.containmentBatch.close"),
    statusDone: t("doNext.containmentBatch.statusDone"),
    statusConflict: t("doNext.containmentBatch.statusConflict"),
    statusFailed: (message: string) => t("doNext.containmentBatch.statusFailed", { message }),
    outcome: (done: number, failed: number) =>
      failed > 0
        ? t("doNext.containmentBatch.outcomeWithLeft", { done, failed })
        : t("doNext.containmentBatch.outcome", { done }),
  };

  const censusStripLabels: InsightsCensusStripLabels = {
    concepts: t("heroConcepts"),
    relations: t("heroRelations"),
    health: t("heroHealth"),
    orphan: t("healthOrphan"),
    cycle: t("healthCycle"),
    membershipLabel: t("heroMembershipLabel"),
    densityGloss: t("heroDensityGloss", { ratio: health.edgesPerConcept.toFixed(2) }),
    evidenceLinked: t("healthEvidenceLinked"),
    islands: t("healthIslands"),
    relationsHidden: (hidden: number) => t("heroRelationsHidden", { count: hidden }),
    relationsHiddenRoute: t("heroRelationsHiddenRoute"),
    statusHealthy: t("statusHealthy"),
    statusNeedsAttention: t("statusNeedsAttention"),
    statusBlocking: t("statusBlocking"),
    statusAdvisory: t("statusAdvisory"),
    recentTitle: t("recentWindowTitle", { weeks: FRESHNESS_WINDOW_WEEKS }),
    recentThisWeek: (count: number) => t("recentThisWeek", { count }),
    recentBarsAria: (weeks: number, total: number) =>
      t("recentBarsAria", { weeks, total }),
    recentBarsStart: (weeks: number) => t("recentBarsStart", { weeks }),
    recentBarsEnd: t("recentBarsEnd"),
  };
  const overviewLabels = {
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
    emptyAction: t("domainCouplingEmptyAction"),
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
    emptyAction: t("domainCouplingEmptyAction"),
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
    listTitle: (count: number) => t("doNext.listTitle", { count }),
    moreCount: (count: number) => t("doNext.moreCount", { count }),
    showAll: t("doNext.showAll"),
    // The sentence the rows inside repeat is said once, here.
    groupName: (group: DoNextGroupKey) => t(`doNext.group.${group}`),
    groupToggle: (name: string, count: number) =>
      t("doNext.groupToggle", { name, count }),
    emptyQueue: t("doNext.emptyQueue"),
    readOnlyHint: t("doNext.groupMeaningHintReadOnly"),
    openDocument: t("doNext.openDocument"),
    fixHere: t("doNext.fixHere"),
    viewOnMap: t("doNext.viewOnMap"),
    whyNeglectedHub: (degree: number, agoDays: number) =>
      t("doNext.touchUpWhyNeglectedHub", { degree, days: agoDays }),
    whyOrphan: t("doNext.whyOrphan"),
    whyPromotion: (count: number) => t("doNext.touchUpWhyPromotion", { count }),
    whyPromotionNamed: (names: string) => t("doNext.whyPromotionNamed", { names }),
    whyPromotionNamedMore: (names: string, count: number) =>
      t("doNext.whyPromotionNamedMore", { names, count }),
    whyCycle: (length: number) => t("doNext.touchUpWhyCycle", { length }),
    whyDuplicate: (percent: number) => t("doNext.whyDuplicate", { percent }),
    whyMissingDefinition: t("doNext.whyMissingDefinition"),
    whyMissingDomain: t("doNext.whyMissingDomain"),
    // Keyed like `groupName`, so a finding's name and sentence are added together or not at all.
    whyMeaningFinding: (group: DoNextGroupKey) => t(`doNext.whyFinding.${group}`),
    whyIsland: t("doNext.whyIsland"),
    whyContainment: t("doNext.whyContainment"),
    whyBlockedDocument: (reason: string) => t("doNext.whyBlockedDocument", { reason }),
    // An unlisted code still gets a sentence; a blocked row must always give a reason.
    blockedReason: (code: VaultDocumentIssue["code"]) =>
      BLOCKED_REASON_KEYS.has(code)
        ? t(`doNext.blockedReason.${code}` as "doNext.blockedReason.other")
        : t("doNext.blockedReason.other"),
    cycleMoreNodes: (count: number) => t("doNext.cycleMoreNodes", { count }),
    openSource: t("doNext.openSource"),
    openBuilder: t("doNext.openBuilder"),
    handoffCopy: t("doNext.handoffCopy"),
    handoffCopied: t("agentCopied"),
    handoffCopyFailed: t("agentCopyFailed"),
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
  };
  // Action labels reuse the queue's keys; one action under two names reads as two features.
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
    fixHere: doNextLabels.fixHere,
    viewOnMap: doNextLabels.viewOnMap,
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
  };
  // Both gap kinds share every label; the row's sentence is passed to the component.
  const meaningGapDefinitionLabels: MeaningGapLabels = meaningGapCommon;
  const meaningGapDomainLabels: MeaningGapLabels = meaningGapCommon;
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
    noDomainsAction: t("noDomainsAction"),
    noRecentUpdates: t("noRecentUpdates"),
    recentHidden: (hidden: number) => t("recentUpdatesHidden", { count: hidden }),
    recentHiddenRoute: t("recentUpdatesHiddenRoute"),
    staleCountLabel: t("staleCountLabel"),
    // Evidence toggle and badge copy match the connections tab, so one layer has one name; only the caption differs.
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
    <div className="relative flex min-h-0 flex-1 overflow-hidden">
      {/* The vertical flex chain must reach `main` unbroken or the panel's `flex-1` never gets the remaining height.
         It is a `min-h-full` chain, so long content still grows and scrolls. */}
      <div className="@container/insights flex min-w-0 flex-1 flex-col overflow-y-auto max-lg:scroll-pb-[calc(var(--topology-mobile-bottom-tab-reserve)+var(--page-bottom-breath))]">
        {/* No live change count here: that number belongs to the map, where it leads to an action.
           The row is `lg:hidden` because at lg+ the rail carries settings and nothing else is left in it. */}
        <div className="flex items-center justify-end gap-2 px-4 pt-3 md:px-6 lg:hidden">
          <AppSettingsMenu mode={dataSourceMode} triggerVariant="chrome-tile" />
        </div>
        <main
          id="main"
      tabIndex={-1}
          data-insights-surface="maintenance-board"
          data-insights-question-model="one-tab-one-question"
          // The `lg` breath lives in `PAGE_FRAME`; only the below-`lg` tab-bar reserve is this page's.
          className={`${PAGE_FRAME} flex flex-col max-lg:pb-[calc(var(--topology-mobile-bottom-tab-reserve)+var(--page-bottom-breath))] ${measuredHarness ? 'h-full min-h-0 flex-1 overflow-hidden' : 'min-h-full shrink-0'}`}
        >
        <header className={PAGE_HEADER_ROW}>
          <div className={PAGE_TITLE_ROW}>
            <h1 className="text-display font-[var(--font-weight-signature)] tracking-[var(--tracking-card)] text-[color:var(--color-text-primary)]">
              {scopeTitle}
            </h1>
            <p className="max-w-xl text-body text-[color:var(--color-text-tertiary)]">
              {scopeSubtitle}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-3">
            {agentRoute === 'agent' && hasConcepts && tab !== 'flow' ? (
              <Button
                variant="outline"
                size="sm"
                aria-label={t('agentOpenAria', { tab: t(`tab.${tab}`) })}
                aria-pressed={agentOpen}
                data-testid="insights-agent-open"
                onClick={() => openAgentForTab(tab)}
              >
                <MessageCircle size={ICON_SIZE.sm} aria-hidden />
                {t('agentOpen')}
              </Button>
            ) : null}
          </div>
        </header>
        {/* Two rows: the subject (brief, ontology, library, harness), then the ontology's own questions. */}
        {/* The subject is a mode (segmented control); the questions are sections (tabs). Two identical tab rows make the
           active state ambiguous. Only the ontology subject draws the question row. */}
        <div className="mt-[var(--section-gap)] flex flex-col gap-2">
          <div className="self-start">
          <SegmentedControl
            ariaLabel={t("coreAriaLabel")}
            value={coreOfTab(tab)}
            onChange={(key) => setTab(tabOfCore(key))}
            options={INSIGHTS_CORES.map((key) => ({ value: key, label: t(`core.${key}`), testId: `insights-core-${key}` }))}
            testId="insights-core-switch"
          />
          </div>
          {/*
           * **The census strip sits between the two rows** (owner, 2026-09-06: "isn't analysis
           * supposed to show indicators and flow?"). It answers the question a person arrives
           * with — how big is this folder and is it in trouble — before they pick which of the
           * seven questions to open, which is what that decision asked for and is still true
           * here. The audience banner that used to stand in this band went with it: a sentence
           * announcing who a screen is for is not a measurement.
           *
           * ⚠️ **It may not lead the board any more, because the board gained a first row.** The
           * strip is drawn for the concepts subject only, so standing above the subject control
           * it pushed that control from y=104 to y=292 the moment a reader picked concepts — the
           * control moved out from under the pointer that had just clicked it, and the screen
           * stated 125 and 258 before naming whose numbers they were (design audit, 2026-09-20,
           * identical at 1512 and 1920). Below the subject row the control never moves, and the
           * decided clause — "four equal-height census tiles above the tab bar" — is still
           * literally true, so that decision stands rather than being overturned.
           */}
          {insight && hasConcepts && coreOfTab(tab) === "ontology" ? (
            <div className="my-2">
              <InsightsCensusStrip
                totalNodes={totalNodes}
                totalEdges={totalEdges}
                health={health}
                islandCount={healthRepair.islandCount}
                verdict={insightsVerdict}
                weeklyTotals={freshness.weeklyTotals}
                kindsSummary={kindRows.map((row) => ({
                  key: row.kind,
                  label: kindLabel(row.kind),
                  count: row.count,
                }))}
                relationsSummary={edgeTypeSummary}
                relationsTotal={edgeTypeRows.length}
                onSeeAllRelations={() => setTab("connections")}
                labels={censusStripLabels}
              />
            </div>
          ) : null}
          {coreOfTab(tab) === "ontology" ? (
          <TabBar
            ariaLabel={t("tabsAriaLabel")}
            activeKey={tab}
            onSelect={setTab}
            items={ONTOLOGY_TABS.map((key) => ({
              key,
              label: t(`tab.${key}`),
              // Each badge is the scale of its tab's question; the to-do badge comes from the single verdict (`insights-verdict`).
              // With zero concepts the body is an empty state, so a badge must not state a number beside it.
              count: hasConcepts
                ? INSIGHTS_TAB_BADGE[key]({
                    verdictTotal: insightsVerdict.total,
                    totalNodes,
                    totalEdges,
                    crossDomainEdges: domainCoupling.crossDomainEdgeCount,
                    unmatchedTotal: unmatchedBoard.totalCount,
                  })
                : 0,
              // What an unlabelled number counts, surfaced only on hover and to assistive tech.
              countTitle:
                key === "growth" || key === "flow" ? undefined : t(`tabCountTitle.${key}`),
            }))}
          />
          ) : null}
        </div>

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
          // The height is set one step later than the content so the crossfade wraps the reflow instead of a one-frame jump.
          <div ref={insightsSwapHostRef} className={`flex flex-col ${panelFills ? 'flex-1' : ''} ${measuredHarness ? 'min-h-0 overflow-hidden' : ''}`}>
          <div
            key={tab}
            ref={insightsPanelRef}
            // `tabIndex={-1}` so a brief destination can move focus here: the link pressed leaves the DOM with the old panel.
            // Only that path moves focus; the question row keeps its own roving focus.
            tabIndex={-1}
            // The question row's panel is a `tabpanel` named by its tab. The other subjects have no tab (the subject row is a
            // radiogroup), so they are named regions; pointing at a missing tab id would give no name.
            {...(coreOfTab(tab) === "ontology"
              ? ({ role: "tabpanel", "aria-labelledby": `insights-tab-${tab}` } as const)
              : ({ role: "region", "aria-label": t(`core.${coreOfTab(tab)}`) } as const))}
            id={`insights-tabpanel-${tab}`}
            data-insights-panel={tab}
            className={`insights-tab-crossfade mt-[var(--section-gap)] flex flex-col ${panelFills ? 'flex-1' : ''} ${measuredHarness ? 'min-h-0 overflow-hidden' : ''}`}
          >
            {tab === "library" ? <LibraryTab detail={brief.library} nowMs={brief.nowMs} /> : null}
            {tab === "harness" ? <HarnessTab detail={brief.harnessDetail} /> : null}
            {tab === "brief" ? (
              <BriefTab
                brief={brief}
                onOpenTab={openTabFromBrief}
                onAskAgent={
                  agentRoute === 'agent'
                    ? (request) => {
                        const plan = planInsightsAgentPrompt({
                          current: agentPrefill,
                          draftPresent: agentDraftPresent,
                          kind: 'brief',
                          text: request,
                        });
                        if (plan.action === 'open-current') {
                          setAgentOpen(true);
                          return;
                        }
                        if (plan.action === 'seat') {
                          commitAgentPrefill(plan.request);
                          return;
                        }
                        setAgentOpen(true);
                        toast.show(t('agentDraftHeld'), 'info', {
                          label: t('agentReplaceDraft'),
                          onClick: () => commitAgentPrefill(plan.request),
                        });
                      }
                    : undefined
                }
              />
            ) : null}
            {tab === "do-next" ? (
              <DoNextTab
                onShowAllRows={() => setDoNextShowAllRows(true)}
                totalCount={insightsVerdict.total}
                queue={doNextQueue}
                groupCounts={doNextGroupCounts}
                cycles={dependencyCycles}
                duplicates={duplicates.rows}
                duplicateHandoff={duplicateHandoff}
                blockedDocuments={blockedDocuments}
                docHref={(slug) => buildDocsVaultHref({ slug })}
                repairTargets={healthRepair.actionTargets}
                mapHref={mapNodeHref}
                sourceHref={sourceHref}
                builderHref={builderHref}
                nodeTitle={cycleNodeTitle}
                cycleHandoff={cycleHandoff}
                reviewState={reviewState}
                onReviewStart={onReviewStart}
                abilities={abilities}
                meaningGaps={{
                  definitionRows: meaningGapResult.definitionRows,
                  domainRows: meaningGapResult.domainRows,
                  findingRows: meaningGapResult.findingRows,
                  domainChoices,
                  onWrite: writeMeaningGap,
                  definitionLabels: meaningGapDefinitionLabels,
                  domainLabels: meaningGapDomainLabels,
                }}
                labels={doNextLabels}
                // The only whole-group action, on the one group whose repair two facts on disk fully determine;
                // a session that cannot write the folder is not offered it.
                groupAction={(group) =>
                  group === "containment" &&
                  abilities.canWriteVault &&
                  containmentProposals.length > 0 ? (
                    <Button
                      variant="outline"
                      size="sm"
                      data-testid="do-next-group-batch"
                      onClick={() => {
                        // The plan is read from the documents as they are now; it decides everything Apply may do.
                        setContainmentPlan(buildContainmentPlan(containmentProposals, healthDocs));
                        setContainmentStatuses(new Map());
                        setContainmentFinished(false);
                        setContainmentSheetOpen(true);
                      }}
                    >
                      {t("doNext.containmentBatch.open")}
                    </Button>
                  ) : null
                }
                // The read-only line promises "open your folder and finish these here", so the control sits in the same box.
                openVaultAction={<OpenVaultCta testId="do-next-open-vault" />}
              />
            ) : null}
            {tab === "unmatched" ? (
              <UnmatchedTab
                board={unmatchedBoard}
                // No manifest yet is not "nothing is missing"; the tab says which it is.
                pending={!unmatchedAsks.manifestRead}
                onDismiss={(id) => setUnmatchedDismissed(id, true)}
                onRestoreAll={() => writeUnmatchedDismissals(vaultScope, new Set())}
                sourceHref={(slug) => buildDocsVaultHref({ slug })}
                labels={unmatchedLabels}
              />
            ) : null}
            {tab === "composition" ? (
              <OverviewTab
                totalNodes={totalNodes}
                kindRows={kindRows}
                domainRows={domainRows}
                kindLabel={kindLabel}
                domainLink={{
                  href: mapNodeHref,
                  // The bar is `aria-hidden`, so the link name carries the row's three numbers in on-screen order.
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
                impactNodes={nodes}
                impactEdges={edges}
                impactLimit={IMPACT_DISPLAY_LIMIT}
                impactLink={{
                  href: mapNodeHref,
                  // The bar is `aria-hidden`, so the link name carries both numbers.
                  ariaLabel: ({ title, direct, total }) =>
                    t("impactRowAriaLabel", { title, direct, total }),
                  // The evidence layer reads the same number as citations, not risk.
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
            {tab === "growth" ? (
              // The panel is a gapless `flex-col`, so blocks need `--card-gap` between them, as in `FreshnessTab`.
              <div className="flex min-h-0 flex-1 flex-col gap-[var(--card-gap)]">
              {/* The growth tab opens with what the folder has grown into (layers counted from paths);
                 file update dates follow as the table of when files were last written. */}
              <VaultHistorySection state={vaultHistory} t={t} />
              <FreshnessTab
                labels={freshnessLabels}
                domainRows={freshness.domainRows}
                recent={freshness.recent}
                recentTotal={freshness.recentTotal}
                recentEvidence={freshness.recentEvidence}
                recentEvidenceTotal={freshness.recentEvidenceTotal}
                staleCount={freshness.staleCount}
                kindLabel={kindLabel}
                recentLink={{
                  href: mapNodeHref,
                  ariaLabel: (title) => t("freshnessRowAriaLabel", { title }),
                }}
              />
              </div>
            ) : null}
            {tab === "flow" ? (
              <FlowTab
                labels={{
                  title: t("flow.title"),
                  lead: t("flow.lead"),
                  action: t("flow.action"),
                  actionHint: t("flow.actionHint"),
                  checking: t("flow.checking"),
                  requestLabel: t("flow.requestLabel"),
                  unavailableTitle: t("flow.unavailableTitle"),
                  unavailableBody: t("flow.unavailableBody"),
                  copy: t("flow.copy"),
                  copied: t("flow.copied"),
                  noVaultTitle: t("flow.noVaultTitle"),
                  noVaultBody: t("flow.noVaultBody"),
                  writtenAt: (values) => t("flow.writtenAt", values),
                  standingCurrent: t("flow.standingCurrent"),
                  standingStale: t("flow.standingStale"),
                  standingUnknown: t("flow.standingUnknown"),
                  ungrounded: t("flow.ungrounded"),
                  changedTitle: t("flow.changedTitle"),
                  changeAdded: t("flow.changeAdded"),
                  changeRemoved: t("flow.changeRemoved"),
                  changeRewritten: t("flow.changeRewritten"),
                  noVersionTitle: t("flow.noVersionTitle"),
                  noVersionBody: t("flow.noVersionBody"),
                  rewrite: t("flow.rewrite"),
                  versionsLabel: (count) => t("flow.versionsLabel", { count }),
                }}
                versions={flowVersions}
                request={flowRequest}
                hasGraph={totalNodes > 0}
                hasOwnFolder={vault.status === "loaded"}
                canLaunchAgent={agentRoute === 'agent'}
                agentChecking={agentRoute === 'checking'}
                onPrefill={() => openAgentForTab('flow')}
              />
            ) : null}
          </div>
          </div>
        )}

        {/* Not on the to-do tab (rows offer the agent) or beside an open ACP dock (it carries the same handoff);
           it returns when the dock closes as the browser/copy-only path. */}
        {!handoffShown ? null : (
        <InsightsHandoffRow
          label={t("handoffLabel")}
          caption={t("handoffCaption")}
          payload={handoffProse[HANDOFF_PAYLOAD_KEY[tab] ?? HANDOFF_PAYLOAD_KEY[DEFAULT_INSIGHTS_TAB]]}
          copyLabel={t("handoffCopy")}
          copiedLabel={t("agentCopied")}
        />
        )}
        </main>
      </div>
      <ContainmentBatchSheet
        open={containmentSheetOpen}
        proposals={containmentPlan?.proposals ?? []}
        statuses={containmentStatuses}
        running={containmentRunning}
        finished={containmentFinished}
        onApply={applyContainmentBatch}
        onClose={() => setContainmentSheetOpen(false)}
        labels={containmentBatchLabels}
      />
      {acpRuntime && gitVaultPath ? (
        <InsightsAgentDock
          open={agentOpen}
          runtime={acpRuntime}
          runtimes={acpRuntimes}
          onRuntimeChange={setAcpRuntimeId}
          vaultRoot={gitVaultPath}
          mcpServers={acpMcpServers}
          prefillRequest={agentPrefill}
          contextLabel={agentContextLabel}
          knownSlugs={agentKnownSlugs}
          knownRelations={agentKnownRelations}
          analysisContext={analysisContext}
          onEvidence={(slug) => router.push(buildDocsVaultHref({ slug }))}
          onDraftPresenceChange={setAgentDraftPresent}
          onPresentationOpenMap={openPresentationOnMap}
          onClose={() => setAgentOpen(false)}
        />
      ) : null}
    </div>
    </VaultSourceHydrationBoundary>
  );
}
