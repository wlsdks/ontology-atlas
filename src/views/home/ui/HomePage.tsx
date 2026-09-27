"use client";
import { useTopologyAgentActivity } from "../model/use-topology-agent-activity";
import { useTopologyAgentOrchestration } from "../model/use-topology-agent-orchestration";
import { useTopologyAnalysisReview } from "../model/use-topology-analysis-review";
import { useTopologyAssetPreload } from "../model/use-topology-asset-preload";
import { useTopologyAuthoring } from "../model/use-topology-authoring";
import { useTopologyCanvasFocus } from "../model/use-topology-canvas-focus";
import { useTopologyCreateIntent } from "../model/use-topology-create-intent";
import { useTopologyExplorationLenses } from "../model/use-topology-exploration-lenses";
import { useTopologyIndexPresentation } from "../model/use-topology-index-presentation";
import { useTopologyInspectorState } from "../model/use-topology-inspector-state";
import { useTopologyKeyboardTour } from "../model/use-topology-keyboard-tour";
import { useTopologyNavigationActions } from "../model/use-topology-navigation-actions";
import { useTopologyPreferences } from "../model/use-topology-preferences";
import { useTopologyRouteControls } from "../model/use-topology-route-controls";
import { useTopologySceneControls } from "../model/use-topology-scene-controls";
import { useTopologySourceActions } from "../model/use-topology-source-actions";
import { useTopologySourceReadiness } from "../model/use-topology-source-readiness";
import { useTopologyVaultReadModel } from "../model/use-topology-vault-read-model";
import { TopologyAgentDock } from "./TopologyAgentDock";
import { TopologyCanvasSurface } from "./TopologyCanvasSurface";
import { TopologyCommandChrome } from "./TopologyCommandChrome";
import { TopologyIndexSlot } from "./TopologyIndexSlot";
import { TopologyInspectorSurfaces } from "./TopologyInspectorSurfaces";
import { TopologyUtilityOverlays } from "./TopologyUtilityOverlays";

import { VaultSourceHydrationBoundary } from "@/entities/vault-session";
import { useChatSuggestions } from "@/features/acp-session";
import { useFirstRunSampleModeSettled } from "@/features/first-run-starter";
import { useProjects } from "@/features/project-data-source";
import { useRouter } from "@/i18n/navigation";
import { cancelMapNavigation, readMapNavigationPending } from "@/shared/lib/map-navigation-pending";
import { useArrivalMemory } from "@/shared/lib/route-arrival-memory";
import { useAgentDockDefaultOpen } from "@/shared/lib/use-agent-dock-default";
import { useDocumentTitle } from "@/shared/lib/use-document-title";
import { useFailureSentence } from "@/shared/lib/use-failure-sentence";
import { useLocalStorageBoolean } from "@/shared/lib/use-local-storage-boolean";
import { useHeldValue } from "@/shared/lib/use-presence";
import { LiveAnnouncer, WidgetErrorFallback, useToast } from "@/shared/ui";
import { ErrorBoundary } from "@/shared/ui/error-boundary";
import { MapEntryLoadingVisual } from "@/shared/ui/map-entry-loading-visual";
import { useNavRailContextHrefs, useNavRailSettingsSlot } from "@/widgets/app-nav-rail";
import { GestureHint } from "@/widgets/gesture-hint";
import { useTranslations } from "next-intl";
import { startTransition, useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { useAcpRuntimeController } from "../model/use-acp-runtime-controller";
import { useHomeRouteState } from "../model/use-home-route-state";
import { useMapViewSync } from "../model/use-map-view-sync";
import { useHomeWorkbenchController } from "../model/use-home-workbench-controller";
import { useNodeDatasheetModel } from "../model/use-node-datasheet-model";
import { useTopologyGraphProjection } from "../model/use-topology-graph-projection";

import { useGuidedTourAutoStartReady } from "@/features/guided-tour";
import { AppSettingsMenu } from "@/widgets/app-settings-menu";
import { refreshIndexDependentTokens } from "@/widgets/ontology-map";
import { type IndexPanelState } from "@/widgets/topology-index-panel";
import { buildNavRailContextHrefs } from "../lib/nav-rail-context-hrefs";
import { useFootprintTrail } from "../model/use-footprint-trail";
import { usePastTrails } from "../model/use-past-trails";
import { TopologyBlockingOverlays } from "./TopologyBlockingOverlays";



const LEFT_PANEL_COLLAPSED_KEY = "demo:left-panel-collapsed:v2";
/**
 * Boot render gate: the first client commit renders only the server fallback's shared loading
 * visual, and the body renders in a following `startTransition`, whose lane yields about every 5 ms
 * and splits the largest boot long task. Server and client share `MapEntryLoadingVisual`, so markup
 * cannot drift. SSG goes straight to the body (no `window`), which suspends on `useSearchParams`,
 * keeping the export byte-identical.
 */
export function HomePage() {
  const tMapEntry = useTranslations('mapEntry');
  const tMapError = useTranslations('topology.widgetError');
  const [mapEntryTicket] = useState(() => readMapNavigationPending()?.id ?? null);
  // Only the first load splits: later arrivals already hold the map's code and graph, and
  // splitting them crossfades into a loading visual. `shared/lib/route-arrival-memory.ts` is empty
  // during static render and hydration, so the exported HTML and first commit are unchanged.
  const [bootedOnce, rememberBooted] = useArrivalMemory("home-map-booted", false);
  const [bootRenderReady, setBootRenderReady] = useState(bootedOnce);
  useEffect(() => {
    rememberBooted(true);
    if (bootRenderReady) return;
    startTransition(() => setBootRenderReady(true));
  }, [bootRenderReady, rememberBooted]);
  if (!bootRenderReady) {
    return (
      <MapEntryLoadingVisual
        title={tMapEntry('mapComing')}
        description={tMapEntry('loadingDetail')}
        headline={tMapEntry('headline')}
        lede={tMapEntry('lede')}
      />
    );
  }
  return <ErrorBoundary
    onError={() => cancelMapNavigation(mapEntryTicket)}
    fallback={({ error, reset }) => (
      <WidgetErrorFallback error={error} onReset={reset} title={tMapError('mapTitle')} body={tMapError('body')} retryLabel={tMapError('retry')} className="h-full w-full" />
    )}
  ><HomePageImpl mapEntryTicket={mapEntryTicket} /></ErrorBoundary>;
}

function HomePageImpl({ mapEntryTicket }: { mapEntryTicket: number | null }) {
  const topologyPreferences = useTopologyPreferences();
  const { t, audiencePlain, setAudiencePlain, siteT, relationLabelInRegister, activeLocale, view3d, galaxy } = topologyPreferences;
  const [localGraphStack, setLocalGraphStack] = useState<string[]>([]);
  // Held through the exit window, or the pill empties as it leaves. Keyed by the flattened stack,
  // since the array identity changes every render.
  const heldLocalGraphStack =
    useHeldValue(localGraphStack.length > 0 ? localGraphStack : null, localGraphStack.join('>')) ??
    [];
  const localGraphRoot =
    localGraphStack.length > 0 ? localGraphStack[localGraphStack.length - 1] : null;
  const [fitViewToken, setFitViewToken] = useState(0);
  const [growthReplayToken, setGrowthReplayToken] = useState(0);
  /**
   * Reported by the map loop, so the control's active tone and `aria-pressed` last exactly as long
   * as the motion.
   */
  const [growthReplaying, setGrowthReplaying] = useState(false);
  const [topologyVisibleCount, setTopologyVisibleCount] = useState<number | null>(null);
  // The corner readout's orientation label; the "zoom in to see elements" hint drops at "element".
  const [mapZoomTier, setMapZoomTier] = useState<"spine" | "circuit" | "element">(
    "spine",
  );
  const [topologyGraphStats, setTopologyGraphStats] = useState<{
    key: string;
    nodes: number;
    relations: number;
  } | null>(null);
  const router = useRouter();
  // Local mode syncs from the vault manifest, static mode from the build-time manifest.
  const projectsQuery = useProjects();
  const projects = projectsQuery.projects;
  const projectsError = projectsQuery.error;
  // Held across its exit window; a primitive needs no key.
  const heldProjectsError = useHeldValue(projectsError);
  const [routeState, setRouteState] = useHomeRouteState();
  useMapViewSync(routeState.mapView, setRouteState);
  /**
   * One attention surface at a time: opening the agent dock retires the search palette and the
   * composer.
   */
  const homeWorkbenchController = useHomeWorkbenchController();
  const { setAcpChatOpen, acpDockFrameOpen, meaningWorkbenchOpen, reviewUsesSheet } = homeWorkbenchController;
  /**
   * True only in the installed app with a key present (`null` = not known yet): a locked panel on a
   * machine without a key breaks the intent of "in view".
   */
  const agentDockDefaultOpen = useAgentDockDefaultOpen();
  /**
   * The user's own open or close beats the default, or a closed dock reopens when the key lookup
   * resolves.
   */
  const agentDockTouchedRef = useRef(false);
  // Opening goes through the one door (`openAgentChat`), which picks the branch, or two panels
  // open.
  // A first line handed in lands in the input unsent; `nonce` lets the same sentence land again.
  const [vaultAgentPrefill, setVaultAgentPrefill] = useState<{
    text: string;
    nonce: number;
  } | null>(null);
  // ⌘K on a project page leaves a sessionStorage flag; the lazy initializer opens the palette on
  // the first render. It runs only on the client, so SSR and hydration both see `false`.
  const [ontologySearchOpen, setOntologySearchOpen] = useState(() => {
    if (typeof window === "undefined") return false;
    try {
      if (window.sessionStorage.getItem("demo:open-search") === "1") {
        window.sessionStorage.removeItem("demo:open-search");
        return true;
      }
    } catch {
      // Private mode: skip.
    }
    return false;
  });
  const [shortcutsOpen, setShortcutsOpen] = useState(() => {
    if (typeof window === "undefined") return false;
    try {
      if (window.sessionStorage.getItem("demo:open-shortcuts") === "1") {
        window.sessionStorage.removeItem("demo:open-shortcuts");
        return true;
      }
    } catch {
      // Private mode.
    }
    return false;
  });
  const [docsDrawerOpen, setDocsDrawerOpen] = useState(false);
  // Not read in a `useState` initializer, which mismatches hydration on the className;
  // `useSyncExternalStore` applies the stored value after mount.
  const leftPanelCollapsed = useLocalStorageBoolean(LEFT_PANEL_COLLAPSED_KEY, true);
  const [topologyRelayoutToken, setTopologyRelayoutToken] = useState(0);

  /**
   * An arrow key with nowhere to go gets one self-dismissing line through the existing toast, not a
   * new surface. The widget filters repeats (`shouldAnnounceDeadEnd`).
   */
  const toast = useToast();
  /** Scaffold failures reach a person as a sentence, not a thrown string. */
  const failureSentence = useFailureSentence();

  const prefetchedProjectHrefsRef = useRef(new Set<string>());
  const preloadedImageUrlsRef = useRef(new Set<string>());
  const {
    activeCategory,
    selectedSlug,
    impactMode,
    analysisMode,
    pathSourceSlug,
    pathTargetSlug,
    createNodeIntent,
    meaningEditorIntent,
    meaningEditParam,
    indexState,
    insightsReturnTab,
    insightsReturnReviewId,
    expandedParents: expandedParentSlugs,
    realmSlug,
    recentWindow,
  } = routeState;
  /** A session view that does not persist to URL or settings. */
  const [expandAllActive, setExpandAllActive] = useState(false);
  const renderProjects = projects;
  const topologyRouteControls = useTopologyRouteControls({
    expandedParentSlugs, expandAllActive, setExpandAllActive, setRouteState, setFitViewToken, indexState,
    analysisMode, selectedSlug, renderProjects, topologyPreferences
  });
  const { selectedProject, indexPanelCollapsedStored, handleChangeIndexDefaultCollapsed } = topologyRouteControls;
  const topologyVaultReadModel = useTopologyVaultReadModel({
    router, recentWindow, pathSourceSlug, pathTargetSlug, expandAllActive, setRouteState, setFitViewToken,
    selectedSlug, projectsQuery, toast, topologyRouteControls, topologyPreferences
  });
  const {
    vault, selectedOntologyNode, ontologyInsight, recentChanges, docFreshnessIndex, docFileDateIndex, docDatesReading,
    updatedAgoNowMs, spotlightOn, changedSlugs, dustySlugs, deeplinkSourceReady, handoffSource, vaultIdentity
  } = topologyVaultReadModel;
  // `AppNavRail` lives in the layout, so this page registers its settings node
  // through `useNavRailSettingsSlot`. The memo sits after `vault` and `ontologyChangeset`, which
  // the history tile reads.
  const navRailSettingsSlot = useMemo(
    () => (
      <>
        {/* Map-only screen state enters the single settings sheet through `screenControls`. */}
        <AppSettingsMenu
          mode={vault.status === 'loaded' ? 'local' : 'static'}
          triggerVariant="rail-tile"
          screenControls={{
            audiencePlain,
            onAudiencePlainChange: setAudiencePlain,
            indexCollapsed: indexPanelCollapsedStored,
            onIndexCollapsedChange: handleChangeIndexDefaultCollapsed,
          }}
        />
      </>
    ),
    [
      indexPanelCollapsedStored,
      handleChangeIndexDefaultCollapsed,
      audiencePlain,
      setAudiencePlain,
      vault.status,
    ],
  );
  useNavRailSettingsSlot(navRailSettingsSlot);
  // In sample mode a quiet "switch to my data ⌘O" pill stays in the top row until a real vault
  // connects.
  const sampleModeSettled = useFirstRunSampleModeSettled();
  // Without File System Access the pill and ⌘O open the same sheet in its unsupported mode,
  // instead of silently doing nothing.
  const fsaUnsupported = vault.status === "unsupported";
  const [unsupportedGuideOpen, setUnsupportedGuideOpen] = useState(false);
  const requestVaultOpen = useCallback(() => {
    if (fsaUnsupported) {
      setUnsupportedGuideOpen(true);
      return;
    }
    void vault.open();
  }, [fsaUnsupported, vault, setUnsupportedGuideOpen]);
  // Accepts both the sample and a real folder settling (`use-auto-start-ready.ts`).
  const tourAutoStartReady = useGuidedTourAutoStartReady();
  const topologyAuthoring = useTopologyAuthoring({ setRouteState, meaningEditorIntent, meaningEditParam, toast, topologyVaultReadModel, topologyPreferences });
  const {
    canCreateNode, createNodeOpen, bootstrapOpen, nodeEditTarget, agentActivityStatus, agentFocusNodeId,
    closeCreateNode, setBootstrapOpen, bootstrapPlan, runBootstrap, createNodePanelRef,
    handleCreateNodePanelKeyDown, createNode, createNodeDomainOptions, createNodeProposal,
    createNodeConfirming, setCreateNodeProposal, confirmCreateNode
  } = topologyAuthoring;
  const combinedFitToken = fitViewToken;
  // Static export cannot vary page metadata, so the selected context reaches the tab title here.
  useDocumentTitle(
    Array.from(
      new Set(
        [
          selectedProject?.name,
          selectedOntologyNode?.display ?? selectedOntologyNode?.title,
          t('documentTitle'),
          siteT('siteName'),
        ].filter((value): value is string => Boolean(value)),
      ),
    ).join(" · ") || null,
  );
  // Captured once so relative times do not shift on re-render.
  const [mountNowMs] = useState<number>(() => Date.now());
  const topologyGraphProjection = useTopologyGraphProjection({
    projects: renderProjects,
    localGraphRoot,
    insight: ontologyInsight,
    spotlightOn,
    recentNodeIds: recentChanges.recentNodeIds,
    changedSlugs,
    dustySlugs,
    selectedProject,
    selectedOntologyNodeId: selectedOntologyNode?.id ?? null,
    selectedSlug,
    deeplinkSourceReady,
    projectsLoaded: projectsQuery.loaded,
    realmSlug,
  });
  const { reverseDeps, ontologyMapGraph, canvasSelectedSlug } = topologyGraphProjection;
  const topologyExplorationLenses = useTopologyExplorationLenses({ routeState, setRouteState, topologyVaultReadModel, topologyGraphProjection, topologyRouteControls });

  const {
    setFootprintTrail,
    lastVisitedNodeRef,
    footprintNodeLookup,
    footprintTrailEntries,
    footprintTrailStepCaptions,
    footprintVisitedIds,
    footprintPacketCopied,
    copyFootprintPacket,
    footprintLensActiveRef,
    footprintBrushNodeIdRef,
    handleFootprintLens,
    handleFootprintBrush,
  } = useFootprintTrail({
    canvasSelectedSlug,
    graphNodes: ontologyMapGraph.nodes,
    insightNodes: ontologyInsight?.nodes,
    dustySlugs,
    // Read so the trail can say why one step follows another.
    insightEdges: ontologyInsight?.edges,
    relationLabelOf: relationLabelInRegister,
  });
  const {
    pastWalkRows,
    pastTrailNotice,
    clearFootprintTrail,
    handleDeletePastWalk,
    handleClearPastWalks,
    replayPastWalk,
  } = usePastTrails({
    vaultHandle: vault.status === "loaded" ? vault.handle : null,
    vaultLoaded: vault.status === "loaded",
    footprintTrailEntries,
    footprintNodeLookup,
    mountNowMs,
    setFootprintTrail,
    lastVisitedNodeRef,
  });
  const topologyCanvasFocus = useTopologyCanvasFocus({ topologyVaultReadModel });
  const topologyCreateIntent = useTopologyCreateIntent({
    analysisMode, createNodeIntent, ontologySearchOpen, shortcutsOpen, setOntologySearchOpen,
    setShortcutsOpen, setDocsDrawerOpen, setRouteState, topologyAuthoring, topologyCanvasFocus
  });
  const { createNodePending, createNodeDefaultKind, createNodeSeedDomain } = topologyCreateIntent;
  // The parser preserves unknown keys, so this needs no schema change.
  const authoredSignificance = useMemo(() => {
    const value = nodeEditTarget?.frontmatter?.significance;
    return typeof value === "string" ? value : null;
  }, [nodeEditTarget]);
  const formatUpdatedLabel = useCallback(
    (key: string, count: number) => t(`nodeDatasheet.updated_${key}`, { count }),
    [t],
  );
  // Same `editProvenance` namespace as `DocFrontmatterBlock`, so the two cannot drift.
  const tEditProvenance = useTranslations("editProvenance");
  const tSummaryFreshness = useTranslations("summaryFreshness");
  const formatEditAgeLabel = useCallback(
    (key: string, count: number) => tEditProvenance(`age.${key}`, { count }),
    [tEditProvenance],
  );
  const { nodeFocus, v2DatasheetModel } = useNodeDatasheetModel({
    selectedOntologyNode,
    insight: ontologyInsight,
    handoffSource,
    authoredSignificance,
    docFreshnessIndex,
    docFileDateIndex,
    docDatesReading,
    editBaselineScopeKey: deeplinkSourceReady ? vaultIdentity : null,
    updatedAgoNowMs,
    formatUpdatedLabel,
    agentActivityStatus,
    agentFocusNodeId,
    selfEditTimestamps: vault.selfEditTimestamps,
    formatEditAgeLabel,
  });
  const topologySourceReadiness = useTopologySourceReadiness({ topologyVaultReadModel, topologyPreferences });
  const { projectSourceReadiness } = topologySourceReadiness;
  // Reuses the datasheet's `documentHref` so the rail's documents entry opens the selection; null
  // keeps the default.
  const navRailContextHrefs = useMemo(
    () => buildNavRailContextHrefs(v2DatasheetModel?.documentHref ?? null),
    [v2DatasheetModel?.documentHref],
  );
  // Ambient chrome yields to a surface being read: the datasheet or either right dock.
  const readoutStepsAside = Boolean(v2DatasheetModel) || acpDockFrameOpen || meaningWorkbenchOpen;
  useNavRailContextHrefs(navRailContextHrefs);
  const topologyIndexPresentation = useTopologyIndexPresentation({
    v2DatasheetModel, analysisMode, setRouteState, routeState, meaningEditorIntent, indexState,
    topologyCanvasFocus, topologyRouteControls, topologyVaultReadModel, homeWorkbenchController,
    topologyAuthoring
  });
  const { indexSlotSwap, renderedIndexState } = topologyIndexPresentation;
  // Names only verified runtimes right after a folder opens; unmeasured ones would read as a
  // guarantee.
  // `isGuardedRuntime` is the one decision, shared with the Agents destination.
  const acpRuntimeController = useAcpRuntimeController(setAcpChatOpen);
  const { chatWidth, acpRuntime } = acpRuntimeController;
  // Derived from this folder's state here, so the chat panel needs no `LocalVaultProvider`.
  const chatSuggestions = useChatSuggestions(projectSourceReadiness.state);
  const acpRuntimeLabel = acpRuntime?.label ?? null;
  const topologyAgentActivity = useTopologyAgentActivity({ topologyVaultReadModel, acpRuntimeController, topologyAuthoring });

  const indexSlotFrames: ReadonlyArray<{ state: IndexPanelState; exiting: boolean }> =
    indexSlotSwap.leaving === null
      ? [{ state: renderedIndexState, exiting: false }]
      : [
        { state: indexSlotSwap.leaving, exiting: true },
        { state: renderedIndexState, exiting: false },
      ];
  useEffect(() => {
    const root = document.documentElement;
    root.dataset.topologyIndex = renderedIndexState;
    // Refreshes only `--map-safe-inset-left`: a blanket cache drop on every selection forces a
    // costly style recalc.
    refreshIndexDependentTokens(root);
    let cancelled = false;
    // A microtask avoids a synchronous setState (cascading-render warning). The dome and Galaxy
    // skip this re-fit, since it runs on every selection and Galaxy keeps the reader's pan and
    // zoom.
    if (!view3d && !galaxy && !acpDockFrameOpen) {
      window.queueMicrotask(() => {
        if (!cancelled) setFitViewToken((count) => count + 1);
      });
    }
    return () => {
      cancelled = true;
      delete root.dataset.topologyIndex;
    };
  }, [renderedIndexState, view3d, galaxy, acpDockFrameOpen]);
  const topologySourceActions = useTopologySourceActions({ toast, v2DatasheetModel, topologyPreferences, topologySourceReadiness, topologyCanvasFocus });
  const topologyInspectorState = useTopologyInspectorState({
    setExpandAllActive, setRouteState, nodeFocus, v2DatasheetModel, analysisMode, selectedSlug,
    topologyCanvasFocus, topologyVaultReadModel, topologyAuthoring, homeWorkbenchController,
    topologyIndexPresentation
  });
  const topologyAgentOrchestration = useTopologyAgentOrchestration({
    setOntologySearchOpen, setVaultAgentPrefill, routeState, agentDockTouchedRef, setRouteState,
    agentDockDefaultOpen, topologyVaultReadModel, topologyGraphProjection, acpRuntimeController,
    homeWorkbenchController, topologyAuthoring, topologyPreferences, topologyIndexPresentation
  });
  const { agentDockOpen, runtimeChatOpen } = topologyAgentOrchestration;
  const topologyNavigationActions = useTopologyNavigationActions({
    setExpandAllActive, setRouteState, replayPastWalk, topologyCanvasFocus, topologyPreferences,
    topologyAuthoring, topologyGraphProjection, topologyIndexPresentation, topologySourceReadiness,
    topologyAgentOrchestration, topologyInspectorState
  });
  const topologyKeyboardTour = useTopologyKeyboardTour({
    setOntologySearchOpen, setShortcutsOpen, setDocsDrawerOpen, tourAutoStartReady, ontologySearchOpen,
    localGraphRoot, setLocalGraphStack, setRouteState, sampleModeSettled, requestVaultOpen,
    topologyGraphProjection, topologyNavigationActions, topologyAuthoring, topologyCanvasFocus,
    topologyInspectorState, topologyRouteControls, topologyExplorationLenses, topologyAgentOrchestration
  });
  const topologySceneControls = useTopologySceneControls({
    pathSourceSlug, pathTargetSlug, analysisMode, expandAllActive, setRouteState, setExpandAllActive,
    setFitViewToken, toast, failureSentence, mapEntryTicket, localGraphRoot, topologyGraphStats,
    projectsQuery, activeCategory, topologyVisibleCount, setTopologyGraphStats, topologyExplorationLenses,
    topologyVaultReadModel, topologyGraphProjection, topologyRouteControls, topologyPreferences,
    topologyAuthoring, topologyCanvasFocus
  });
  const { drawerOpen } = topologySceneControls;
  useTopologyAssetPreload({ prefetchedProjectHrefsRef, router, preloadedImageUrlsRef, selectedSlug, topologyGraphProjection });
  const topologyAnalysisReview = useTopologyAnalysisReview({
    router, setExpandAllActive, setRouteState, topologyVaultReadModel, homeWorkbenchController,
    topologyAuthoring, topologyPreferences, topologyCanvasFocus, topologyNavigationActions
  });

  return (
    <VaultSourceHydrationBoundary>
      <main
        id="main"
        tabIndex={-1}
        // The right-pinned inspector stands in by the panel's width (`app/globals.css`), so the
        // two never cover each other.
        data-agent-panel-open={agentDockOpen ? 'true' : 'false'}
        // The coding-agent panel is sized by drag and writes nothing to `--agent-panel-width`,
        // which the reservation reads, so the right number is filled in here. The two branches
        // never open at once.
        style={
          acpDockFrameOpen || runtimeChatOpen || meaningWorkbenchOpen
            ? ({ '--agent-panel-width': `${chatWidth.width}px` } as CSSProperties)
            : undefined
        }
        className="relative flex h-full w-full overflow-hidden bg-[color:var(--color-canvas)]"
      >
        <div className="relative h-full flex-1 overflow-hidden" inert={reviewUsesSheet && (meaningWorkbenchOpen || acpDockFrameOpen)}>
          {/* Landmark and SEO h1; the canvas-first design has nowhere to show one. */}
          <h1 className="sr-only">
            {t('srHeading')}
          </h1>
          <GestureHint
            disabled={drawerOpen}
          />
          <LiveAnnouncer
            message={(() => {
              if (!selectedProject) return "";
              const deps = selectedProject.dependencies.length;
              // `reverseDeps` is memoised, so this is an O(1) lookup.
              const referenced = reverseDeps.get(selectedProject.slug)?.length ?? 0;
              return t('selectionAnnouncement', {
                name: selectedProject.name,
                deps,
                referenced,
              });
            })()}
          />
          <>
            <TopologyCommandChrome
              routeState={routeState}
              setRouteState={setRouteState}
              setVaultAgentPrefill={setVaultAgentPrefill}
              setOntologySearchOpen={setOntologySearchOpen}
              setTopologyRelayoutToken={setTopologyRelayoutToken}
              toast={toast}
              expandAllActive={expandAllActive}
              insightsReturnTab={insightsReturnTab}
              insightsReturnReviewId={insightsReturnReviewId}
              analysisMode={analysisMode}
              footprintTrailEntries={footprintTrailEntries}
              footprintTrailStepCaptions={footprintTrailStepCaptions}
              footprintPacketCopied={footprintPacketCopied}
              copyFootprintPacket={copyFootprintPacket}
              clearFootprintTrail={clearFootprintTrail}
              handleFootprintLens={handleFootprintLens}
              handleFootprintBrush={handleFootprintBrush}
              pastWalkRows={pastWalkRows}
              pastTrailNotice={pastTrailNotice}
              handleDeletePastWalk={handleDeletePastWalk}
              handleClearPastWalks={handleClearPastWalks}
              agentDockTouchedRef={agentDockTouchedRef}
              sampleModeSettled={sampleModeSettled}
              requestVaultOpen={requestVaultOpen}
              v2DatasheetModel={v2DatasheetModel}
              topologyPreferences={topologyPreferences}
              topologyInspectorState={topologyInspectorState}
              topologyAuthoring={topologyAuthoring}
              topologyCanvasFocus={topologyCanvasFocus}
              topologyVaultReadModel={topologyVaultReadModel}
              topologyGraphProjection={topologyGraphProjection}
              topologyAgentOrchestration={topologyAgentOrchestration}
              topologySceneControls={topologySceneControls}
              topologyRouteControls={topologyRouteControls}
              topologyNavigationActions={topologyNavigationActions}
              homeWorkbenchController={homeWorkbenchController}
              topologyAgentActivity={topologyAgentActivity}
              topologyCreateIntent={topologyCreateIntent}
              topologyIndexPresentation={topologyIndexPresentation}
              topologyExplorationLenses={topologyExplorationLenses}
            />
            <TopologyBlockingOverlays
              t={t} bootstrapOpen={bootstrapOpen} bootstrapPlan={bootstrapPlan}
              closeBootstrap={() => setBootstrapOpen(false)} runBootstrap={runBootstrap}
              canCreateNode={canCreateNode} createNodeOpen={createNodeOpen}
              closeCreateNode={closeCreateNode} createNodePanelRef={createNodePanelRef}
              onCreateNodePanelKeyDown={handleCreateNodePanelKeyDown} createNode={createNode}
              createNodeDomainOptions={createNodeDomainOptions} createNodeDefaultKind={createNodeDefaultKind}
              createNodeSeedDomain={createNodeSeedDomain} activeLocale={activeLocale}
              createNodeProposal={createNodeProposal} createNodeConfirming={createNodeConfirming}
              clearCreateNodeProposal={() => setCreateNodeProposal(null)} confirmCreateNode={confirmCreateNode}
              createNodePending={Boolean(createNodePending)} openDocsDrawer={() => setDocsDrawerOpen(true)}
            />
            {/* INDEX stays beside the selected-node datasheet, as the approved spec shows. */}
            <TopologyIndexSlot
              indexSlotFrames={indexSlotFrames}
              setRouteState={setRouteState}
              recentWindow={recentWindow}
              topologyCanvasFocus={topologyCanvasFocus}
              topologyInspectorState={topologyInspectorState}
              topologySceneControls={topologySceneControls}
              topologyGraphProjection={topologyGraphProjection}
              topologyVaultReadModel={topologyVaultReadModel}
              topologyNavigationActions={topologyNavigationActions}
              topologyRouteControls={topologyRouteControls}
              topologyPreferences={topologyPreferences}
              topologyKeyboardTour={topologyKeyboardTour}
              topologyAuthoring={topologyAuthoring}
              topologySourceReadiness={topologySourceReadiness}
              acpRuntimeController={acpRuntimeController}
              topologyAgentOrchestration={topologyAgentOrchestration}
              topologyCreateIntent={topologyCreateIntent}
            />
          </>
          <TopologyCanvasSurface
            localGraphRoot={localGraphRoot}
            acpRuntimeLabel={acpRuntimeLabel}
            router={router}
            mapEntryTicket={mapEntryTicket}
            expandAllActive={expandAllActive}
            combinedFitToken={combinedFitToken}
            growthReplayToken={growthReplayToken}
            setGrowthReplaying={setGrowthReplaying}
            topologyRelayoutToken={topologyRelayoutToken}
            setTopologyVisibleCount={setTopologyVisibleCount}
            setMapZoomTier={setMapZoomTier}
            footprintVisitedIds={footprintVisitedIds}
            footprintLensActiveRef={footprintLensActiveRef}
            footprintBrushNodeIdRef={footprintBrushNodeIdRef}
            ontologySearchOpen={ontologySearchOpen}
            setFitViewToken={setFitViewToken}
            setShortcutsOpen={setShortcutsOpen}
            analysisMode={analysisMode}
            growthReplaying={growthReplaying}
            setGrowthReplayToken={setGrowthReplayToken}
            renderProjects={renderProjects}
            leftPanelCollapsed={leftPanelCollapsed}
            localGraphStack={localGraphStack}
            setLocalGraphStack={setLocalGraphStack}
            heldLocalGraphStack={heldLocalGraphStack}
            topologyVisibleCount={topologyVisibleCount}
            readoutStepsAside={readoutStepsAside}
            mapZoomTier={mapZoomTier}
            unsupportedGuideOpen={unsupportedGuideOpen}
            setUnsupportedGuideOpen={setUnsupportedGuideOpen}
            requestVaultOpen={requestVaultOpen}
            topologyCanvasFocus={topologyCanvasFocus}
            topologySceneControls={topologySceneControls}
            topologyAuthoring={topologyAuthoring}
            acpRuntimeController={acpRuntimeController}
            topologyVaultReadModel={topologyVaultReadModel}
            topologyAgentOrchestration={topologyAgentOrchestration}
            topologyPreferences={topologyPreferences}
            topologyGraphProjection={topologyGraphProjection}
            topologyAnalysisReview={topologyAnalysisReview}
            topologyNavigationActions={topologyNavigationActions}
            topologyRouteControls={topologyRouteControls}
            topologyKeyboardTour={topologyKeyboardTour}
            topologyInspectorState={topologyInspectorState}
            topologyCreateIntent={topologyCreateIntent}
            topologyIndexPresentation={topologyIndexPresentation}
            topologyExplorationLenses={topologyExplorationLenses}
          />
          {/* The alert text is held through the exit window. */}
          <TopologyInspectorSurfaces
            projectsError={projectsError}
            heldProjectsError={heldProjectsError}
            renderProjects={renderProjects}
            impactMode={impactMode}
            tEditProvenance={tEditProvenance}
            tSummaryFreshness={tSummaryFreshness}
            topologyPreferences={topologyPreferences}
            topologyAuthoring={topologyAuthoring}
            topologyKeyboardTour={topologyKeyboardTour}
            topologyNavigationActions={topologyNavigationActions}
            topologyInspectorState={topologyInspectorState}
            topologyCanvasFocus={topologyCanvasFocus}
            topologyVaultReadModel={topologyVaultReadModel}
            topologySourceReadiness={topologySourceReadiness}
            topologySourceActions={topologySourceActions}
            topologyGraphProjection={topologyGraphProjection}
            topologyAgentOrchestration={topologyAgentOrchestration}
            homeWorkbenchController={homeWorkbenchController}
            acpRuntimeController={acpRuntimeController}
            topologyRouteControls={topologyRouteControls}
            topologyExplorationLenses={topologyExplorationLenses}
            topologyCreateIntent={topologyCreateIntent}
          />
          {/* Node and project selections go through `handleSelect`, since the palette's
             default would leave the map for `/ontology/?node=`. The hotkeys come from
             the `useTypingShortcuts` call above. */}
          <TopologyUtilityOverlays
            ontologySearchOpen={ontologySearchOpen}
            setOntologySearchOpen={setOntologySearchOpen}
            shortcutsOpen={shortcutsOpen}
            setShortcutsOpen={setShortcutsOpen}
            docsDrawerOpen={docsDrawerOpen}
            setDocsDrawerOpen={setDocsDrawerOpen}
            topologyAuthoring={topologyAuthoring}
            topologyNavigationActions={topologyNavigationActions}
            topologyRouteControls={topologyRouteControls}
            topologyKeyboardTour={topologyKeyboardTour}
          />
        </div>
        {/* In the same flex row as the map column, so one width animation moves both. */}
        <TopologyAgentDock
          vaultAgentPrefill={vaultAgentPrefill}
          chatSuggestions={chatSuggestions}
          routeState={routeState}
          topologyVaultReadModel={topologyVaultReadModel}
          topologyPreferences={topologyPreferences}
          topologyAgentOrchestration={topologyAgentOrchestration}
          topologyNavigationActions={topologyNavigationActions}
          homeWorkbenchController={homeWorkbenchController}
          acpRuntimeController={acpRuntimeController}
          topologyAgentActivity={topologyAgentActivity}
          topologyAnalysisReview={topologyAnalysisReview}
          topologyAuthoring={topologyAuthoring}
          topologyCanvasFocus={topologyCanvasFocus}
        />
      </main>
    </VaultSourceHydrationBoundary>
  );
}
