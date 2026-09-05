"use client";

import { useCallback, useEffect, useEffectEvent, useMemo, useState, useSyncExternalStore } from "react";
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
} from "@/entities/knowledge-graph";
import {
  useOntologyInsight,
  useVaultConceptFacts,
  useVaultDocFreshnessIndex,
  useVaultHealth,
  useVaultUnmatchedAsks,
  useVaultValidationSummary,
} from "@/features/vault-ontology";
import type { VaultDocumentIssue } from "@/shared/lib/validate-vault-document";
import {
  useAgentServer,
  useDataSourceMode,
  VaultSourceHydrationBoundary,
  useLocalVault,
  useVaultIdentityScope,
} from "@/entities/vault-session";
import { OpenVaultCta } from "@/features/docs-vault-local";
import { buildDocsVaultHref } from "@/entities/docs-vault";
import { useOntologyKindLabel } from "@/entities/ontology-class";
import { MountedGlobalSearch, useGlobalSearchHotkey } from "@/widgets/global-search";
import { AppSettingsMenu } from "@/widgets/app-settings-menu";
import { useNavRailSettingsSlot } from "@/widgets/app-nav-rail";
import { Button, EmptyState, TabBar, useToast } from "@/shared/ui";
import {
  DEFAULT_INSIGHTS_TAB,
  INSIGHTS_TABS,
  buildInsightsTabHref,
  parseInsightsTab,
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
import { buildImpactRanking } from "../lib/impact-ranking";
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
import { buildDoNextGroupCounts, type DoNextGroupKey } from "../lib/do-next-groups";
import type { MeaningGapLabels } from "./tabs/MeaningGapSection";
import { ConnectionsTab, type ConnectionHubRow } from "./tabs/ConnectionsTab";
import { DomainCouplingCard } from "./tabs/DomainCouplingCard";
import { FreshnessTab } from "./tabs/FreshnessTab";
import { FlowTab } from "./tabs/FlowTab";
import { buildBusinessFlowRequest } from "@/features/vault-agent";
import { detectAcpRuntimes, isAcpBridgeAvailable } from "@/shared/lib/tauri-acp";
import { getTauriVaultRootPath } from "@/shared/lib/tauri-vault-fs";
import {
  presentationRelationKeysForGraphEdge,
  analysisGraphFromInsight,
  type AnalysisCaptureContext,
  runtimeOwnsWriteGate,
  vaultMcpServers,
  vaultSelfReadSlot,
} from "@/features/acp-session";
import { InsightsHandoffRow } from "./parts/InsightsHandoffRow";
import { InsightsAgentDock } from "./parts/InsightsAgentDock";
import { controlClass } from '@/shared/ui/control-class';
import { ICON_SIZE } from '@/shared/ui/icon-size';
import { MessageCircle } from 'lucide-react';
import {
  buildInsightsAgentPrompt,
  planInsightsAgentPrompt,
  resolveInsightsAgentRoute,
  selectInsightsAgentRuntimes,
  type InsightsAgentPrefill,
} from '../lib/insights-agent';

const EMPTY_NODES: KnowledgeGraphNode[] = [];
const EMPTY_EDGES: KnowledgeGraphEdge[] = [];
const subscribeAcpBridge = () => () => undefined;
const readAcpBridge = () => isAcpBridgeAvailable();
const readServerAcpBridge = () => false;
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
/**
 * How many rows of one kind the "to do" list holds.
 *
 * Three was the ceiling that kept a **flat** list inside the scroll contract (at most 1.3× the
 * viewport) whatever the folder's size. Since 2026-09-06 each kind is a collapsed group, so the
 * viewport is bounded by the group heads rather than by the rows, and five rows is what an opened
 * group can show before its own remainder line takes over.
 */
const DO_NEXT_PER_KIND_LIMIT = 5;
/**
 * The validation codes that have a plain sentence of their own. An unlisted code falls back to
 * `blockedReason.other`, so a blocked row always says something rather than nothing.
 */
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

/**
 * Each tab's question, transposed into an execution plan for the agent — the
 * prose key per tab. The strings live in `../lib/handoff-prose` as typed
 * locale data (their MCP-call braces cannot enter the ICU message catalog).
 * They used to be hardcoded Korean, so an English-locale user copied Korean
 * operating instructions (bug sweep 2026-09-01).
 */
const HANDOFF_PAYLOAD_KEY: Record<InsightsTab, keyof InsightsHandoffProse> = {
  "do-next": "tabDoNext",
  unmatched: "tabUnmatched",
  composition: "tabComposition",
  connections: "tabConnections",
  boundaries: "tabBoundaries",
  freshness: "tabFreshness",
  // The only payload whose output is prose. It reads bodies rather than running an
  // operation, because a narrative rests on what the nodes say, not on a count.
  flow: "tabFlow",
};

interface InsightsBadgeInput {
  verdictTotal: number;
  totalNodes: number;
  totalEdges: number;
  crossDomainEdges: number;
  /**
   * What the vault says, not what this viewer left unhidden. A badge that shrank when
   * someone dismissed a row would report a preference as a measurement.
   */
  unmatchedTotal: number;
}

/**
 * What a tab badge counts. This is a repeating slot, so every populated badge must
 * use the same unit. Freshness used to put a window length ("12 weeks") here; that slot
 * is now left empty, because a length is not a count and the tab body already says
 * how many weeks its window is. Leaving a slot empty and filling it with a
 * different unit are not the same thing — only the latter breaks the slot's meaning.
 */
const INSIGHTS_TAB_BADGE: Record<
  InsightsTab,
  (input: InsightsBadgeInput) => string | number | undefined
> = {
  "do-next": (i) => i.verdictTotal,
  unmatched: (i) => i.unmatchedTotal,
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
 * are) · freshness (what moved) · flow (what this product is and how it moves). The former `structure` tab stacked the first three
 * questions into one column and grew to 2.2× the viewport — answering one question
 * meant scrolling past two unrelated screens.
 *
 * Every number derives from the data sources this page already used
 * (`useOntologyInsight`, `entities/knowledge-graph/lib/ontology-tree`); the census formula (total
 * nodes, edges, domains) is identical to the topology chrome's.
 */
export function OntologyInsightsPage() {
  const t = useTranslations("ontologyPages.insights");
  const toast = useToast();
  // Locale-resolved handoff prose — typed locale data in code, not messages:
  // the templates embed literal MCP-call braces the ICU catalog gate rejects.
  const locale = useLocale();
  const handoffProse = useMemo(() => insightsHandoffProse(locale), [locale]);
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
  const agentServer = useAgentServer();
  const acpBridgeAvailable = useSyncExternalStore(
    subscribeAcpBridge,
    readAcpBridge,
    readServerAcpBridge,
  );
  const gitVaultPath = vault.handle ? getTauriVaultRootPath(vault.handle) ?? null : null;
  const [acpRuntimes, setAcpRuntimes] = useState<ReturnType<typeof selectInsightsAgentRuntimes>>([]);
  const [acpRuntimeId, setAcpRuntimeId] = useState<string | null>(null);
  const [runtimeCheckComplete, setRuntimeCheckComplete] = useState(false);
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

  useEffect(() => {
    if (!acpBridgeAvailable) return;
    let cancelled = false;
    const apply = (list: Awaited<ReturnType<typeof detectAcpRuntimes>>) => {
      if (cancelled) return;
      const usable = selectInsightsAgentRuntimes(list);
      setAcpRuntimes(usable);
      setAcpRuntimeId((current) => (
        current && usable.some((runtime) => runtime.id === current)
          ? current
          : (usable[0]?.id ?? null)
      ));
    };
    void detectAcpRuntimes()
      .then((fast) => {
        apply(fast);
        return detectAcpRuntimes({ probeLogin: true });
      })
      .then(apply)
      .catch(() => apply(null))
      .finally(() => {
        if (!cancelled) setRuntimeCheckComplete(true);
      });
    return () => {
      cancelled = true;
    };
  }, [acpBridgeAvailable]);

  const acpRuntime = acpRuntimes.find((runtime) => runtime.id === acpRuntimeId) ?? null;
  const acpMcpServers = useMemo(() => {
    const registration = vaultSelfReadSlot(acpRuntimeId) === 'codex-config'
      ? {
          command: vault.agentConfigStatus?.codexRegisteredCommand ?? null,
          validForCurrentVault: vault.agentConfigStatus?.codexConfigValid === true,
        }
      : null;
    return vaultMcpServers(agentServer.launch, gitVaultPath, registration, {
      ownsWriteGate: runtimeOwnsWriteGate(acpRuntimeId),
    });
  }, [
    acpRuntimeId,
    agentServer.launch,
    gitVaultPath,
    vault.agentConfigStatus?.codexConfigValid,
    vault.agentConfigStatus?.codexRegisteredCommand,
  ]);
  const agentRoute = resolveInsightsAgentRoute({
    bridgeAvailable: acpBridgeAvailable,
    runtimeCheckComplete,
    serverCheckComplete: agentServer.launch !== null || agentServer.reason !== null,
    runtime: acpRuntime,
    vaultRoot: gitVaultPath,
    serverReady: agentServer.launch !== null,
  });

  // At lg+ the nav rail's bottom gear opens settings, matching the map. Below lg
  // the chrome tile in the top utility lane takes over (the width where the rail is
  // hidden). Both uncontrolled, so only the visible trigger is clickable and no
  // double portal appears.
  const navRailSettingsSlot = useMemo(
    () => <AppSettingsMenu mode={dataSourceMode} triggerVariant="rail-tile" />,
    [dataSourceMode],
  );
  useNavRailSettingsSlot(navRailSettingsSlot);

  /*
   * **The board must not call a bundled sample the person's folder** (2026-09-04).
   *
   * On the Online Store sample the tab read "My folder analysis · Ontology Atlas"
   * and the heading and lede said the same in both locales, while the map's INDEX
   * two clicks away said the sample is read-only and not theirs. Every number here
   * is the sample's, so the name is the sample's; the folder wording is untouched
   * for someone who actually opened a folder. Static export bakes one <title> per
   * route, so the sample tab title can only be applied on the client.
   */
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
  /** Is the tab body drawn at all? If it falls through to an empty state, the badge must not state a number either. */
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
  /*
   * Frontmatter validation, read through the **same** `summarizeVaultValidation` the settings
   * sheet uses. It used to feed a readiness meter that said "5 blocked" and named none of them;
   * with the one-list "to do" tab each blocked document is a row that names itself and links to
   * the file. A document that fails validation either never becomes a node or collides on
   * identity, so an agent cannot use it at all — which is why it counts on the blocking side of
   * the single verdict.
   */
  const vaultValidation = useVaultValidationSummary();
  const blockedDocuments = useMemo(
    () => buildBlockedDocumentRows(vaultValidation, DO_NEXT_PER_KIND_LIMIT),
    [vaultValidation],
  );
  const blockedDocumentCount = useMemo(
    () => countBlockedDocuments(vaultValidation),
    [vaultValidation],
  );
  const edgeTypeSummary = useMemo(
    () => edgeTypeRows.slice(0, 4).map((r) => ({ key: r.type, label: edgeTypeLabel(r.type), count: r.count })),
    [edgeTypeRows, edgeTypeLabel],
  );
  // CLI-parity health verdict (disconnected islands · missing domain containment) read from the
  // raw frontmatter, so the screen agrees with `node $ATLAS/cli/src/index.mjs health` instead of
  // falsely claiming there is nothing to repair. These used to be two counters in a band; they are
  // rows in the one list now, and the counts still feed the single verdict.
  const vaultHealth = useVaultHealth();
  const healthRepair = useMemo(
    () => buildVaultHealthRepair(vaultHealth, nodes),
    [vaultHealth, nodes],
  );

  /*
   * **What agents asked this folder for and did not get.** `vaultHealth` already walked
   * these references and kept only `summary.unresolvedEdges`, a number; the board needs
   * the names behind it. Both readings take the same manifest (`useHealthManifest`), so
   * the count and the list cannot describe different folders — and the list carries only
   * that one fact, because missing containment and unplaced concepts already raise the
   * Do-next badge and must not be counted twice on one screen (2026-08-07 (3)).
   *
   * Dismissals are this viewer's, in this browser, scoped to this vault
   * (`unmatched-dismissals.ts`). They never reach the folder, and they never move
   * `totalCount` or the tab badge — hiding a row is not fixing one.
   */
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
    }),
    [t],
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

  // The "to do" queue is a combination of already-loaded derivations (health signals,
  // degree, freshness).
  //
  // Three rows per type is the ceiling that stops the card pushing the viewport out
  // each time a type is added (suspected duplicates did exactly that). Each section
  // still states its top three rows, the total, and "N more", so the scale is not
  // lost; the full list is carried by the handoff payload rather than the screen
  // (the tab ≤ 1.3× viewport contract).
  const doNextQueue = useMemo(
    () =>
      buildDoNextQueue(nodes, edges, docFreshnessIndex, {
        perKindLimit: DO_NEXT_PER_KIND_LIMIT,
        prose: handoffProse,
      }),
    [nodes, edges, docFreshnessIndex, handoffProse],
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
    () =>
      buildMeaningGapRows(nodes, conceptFacts, {
        perKindLimit: DO_NEXT_PER_KIND_LIMIT,
        prose: handoffProse,
      }),
    [nodes, conceptFacts, handoffProse],
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
  /**
   * The scale of each finding group — the **same** `InsightsSignalCounts` the verdict is built
   * from, re-keyed. One argument means the ten group counts and the one title count cannot drift
   * apart; `tests/contract/do-next-group-sum.contract.test.ts` pins the equality.
   */
  const doNextGroupCounts = useMemo(
    () => buildDoNextGroupCounts(insightsSignalCounts),
    [insightsSignalCounts],
  );

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
    // One name per finding group. The sentence the rows inside repeat is said once, here.
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
    whyCycle: (length: number) => t("doNext.touchUpWhyCycle", { length }),
    whyDuplicate: (percent: number) => t("doNext.whyDuplicate", { percent }),
    whyMissingDefinition: t("doNext.whyMissingDefinition"),
    whyMissingDomain: t("doNext.whyMissingDomain"),
    whyIsland: t("doNext.whyIsland"),
    whyContainment: t("doNext.whyContainment"),
    whyBlockedDocument: (reason: string) => t("doNext.whyBlockedDocument", { reason }),
    // An unlisted code still gets a sentence. Silence on a row that says "your AI cannot read
    // this" would be the one place a reader most needs a reason.
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
  // Both gap kinds share every label: with one list there is no per-kind heading or hint left to
  // differ, and the row's sentence is passed to the component rather than carried in `labels`.
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
    <div className="relative flex min-h-0 flex-1 overflow-hidden">
      {/* The rail lives in the layout (AppShell) since the persistent-shell work. */}
      {/*
        * **The height chain** (measured 2026-08-12). The vertical flex must run unbroken down
        * to the `main` below, or the tab panel's `flex-1` never receives the remaining height.
        * While it was broken: the `flex-1` on the "composition" cards (designed to forbid empty
        * bands) never once stretched, and 614px below the "boundaries" empty state was dead
        * space (measured at 1512×900). It is a `min-h-full` chain, so long content still grows
        * and scrolling is unchanged.
        */}
      <div className="@container/insights flex min-w-0 flex-1 flex-col overflow-y-auto">
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
          // The `lg` breath moved into `PAGE_FRAME` on 2026-09-05 — stating it here as well
          // would be the second source the frame spec exists to remove. What stays is the
          // below-`lg` tab-bar reserve, which is the page's to decide.
          className={`${PAGE_FRAME} flex min-h-full shrink-0 flex-col max-lg:pb-[calc(var(--topology-mobile-bottom-tab-reserve)+var(--page-bottom-breath))]`}
        >
        <MountedGlobalSearch open={searchPaletteOpen} onOpenChange={setSearchPaletteOpen} />

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
            {/*
             * **The 11px monospace census line was removed on 2026-09-06.** It stated concepts,
             * relations and domains in the top-right corner, above the tab bar that already
             * carried the same three numbers as badges, in the smallest ink on the page. The
             * owner's reading of this board was that it shows work and not measurement; the
             * answer was not a smaller number in a corner but the four-tile strip below, which
             * states the same facts once, at the size a first glance can use.
             */}
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
        {/*
         * **The census strip leads the board** (owner, 2026-09-06: "isn't analysis supposed to
         * show indicators and flow?"). It sits above the tab bar because it answers the question
         * a person arrives with — how big is this folder and is it in trouble — before they pick
         * which of the seven questions to open. The audience banner that used to stand here
         * ("this board is for the people and agents who tend the map") went with it: a sentence
         * announcing who a screen is for is not a measurement, and the strip now occupies the one
         * band a reader looks at first.
         */}
        {insight && hasConcepts ? (
          <div className="mt-4">
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

        <nav className="mt-[var(--section-gap)]">
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
                    unmatchedTotal: unmatchedBoard.totalCount,
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
          <div ref={insightsSwapHostRef} className="flex flex-1 flex-col">
          <div
            key={tab}
            role="tabpanel"
            id={`insights-tabpanel-${tab}`}
            aria-labelledby={`insights-tab-${tab}`}
            className="insights-tab-crossfade mt-[var(--section-gap)] flex flex-1 flex-col"
          >
            {tab === "do-next" ? (
              <DoNextTab
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
                  domainChoices,
                  onWrite: writeMeaningGap,
                  definitionLabels: meaningGapDefinitionLabels,
                  domainLabels: meaningGapDomainLabels,
                }}
                labels={doNextLabels}
                // The read-only line says *"open your folder and you can finish these here"*, so
                // the control that does that sits in the same box (2026-08-07, a dead-end CTA).
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
                }}
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

        {/*
          * **Not on the "to do" tab or beside an open ACP conversation.** The to-do tab offers the agent
          * per row, with the sentence already written; a second, tab-wide "hand this to an AI"
          * band under it repeated the offer. The shared ACP dock now carries the same handoff for
          * every other tab, so keeping this row while the dock is open duplicates the action and,
          * at 1040×720, sits over the long Flow request. It returns when the dock closes and remains
          * the browser/copy-only path.
          */}
        {tab === "do-next" || agentOpen ? null : (
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
