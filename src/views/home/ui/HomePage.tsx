"use client";
import type { VaultAgentPrefill } from "../model/agent/agent-chat-door";
import { useTopologyGrayArea } from "../model/gray-area/use-topology-gray-area";
import { useTopologyAgentActivity } from "../model/agent/use-topology-agent-activity";
import { useChangedSourceConcepts } from "../model/use-changed-source-concepts";
import { useTopologyAgentOrchestration } from "../model/agent/use-topology-agent-orchestration";
import { useTopologyAnalysisReview } from "../model/agent/use-topology-analysis-review";
import { useTopologyAssetPreload } from "../model/map-canvas/use-topology-asset-preload";
import { useTopologyAuthoring } from "../model/authoring/use-topology-authoring";
import { useTopologyCanvasFocus } from "../model/use-topology-canvas-focus";
import { useTopologyCreateIntent } from "../model/authoring/use-topology-create-intent";
import { useTopologyExplorationLenses } from "../model/map-canvas/use-topology-exploration-lenses";
import { useTopologyIndexPresentation } from "../model/index-panel/use-topology-index-presentation";
import { useCodeReaderRoom } from "../model/inspector/use-code-reader-room";
import { useTopologyInspectorState } from "../model/inspector/use-topology-inspector-state";
import { useTopologyKeyboard } from "../model/keyboard/use-topology-keyboard";
import { useTopologyNavigationActions } from "../model/use-topology-navigation-actions";
import { useTopologyPreferences } from "../model/use-topology-preferences";
import { useTopologyRouteControls } from "../model/route-state/use-topology-route-controls";
import { useTopologySceneControls } from "../model/map-canvas/use-topology-scene-controls";
import { useTopologySourceActions } from "../model/project-source/use-topology-source-actions";
import { useTopologySourceReadiness } from "../model/project-source/use-topology-source-readiness";
import { useTopologyVaultReadModel } from "../model/use-topology-vault-read-model";
import { useMapWaitsForFolder } from "../model/use-map-waits-for-folder";
import { TopologyAgentDock } from "./map-overlays/TopologyAgentDock";
import { TopologyCanvasSurface } from "./map-surfaces/TopologyCanvasSurface";
import { TopologyCommandChrome } from "./map-readouts/TopologyCommandChrome";
import { TopologyIndexSlot } from "./map-panels/TopologyIndexSlot";
import { TopologyInspectorSurfaces } from "./map-panels/TopologyInspectorSurfaces";
import { TopologyUtilityOverlays } from "./map-overlays/TopologyUtilityOverlays";

import { VaultSourceHydrationBoundary } from "@/entities/vault-session";
import { useChatSuggestions } from "@/features/acp-session";
import { useFirstRunSampleModeKnown, useFirstRunSampleModeSettled } from "@/features/first-run-starter";
import { useProjects } from "@/features/project-data-source";
import { useRouter } from "@/i18n/navigation";
import { cancelMapNavigation, readMapNavigationPending } from "@/shared/lib/navigation/map-navigation-pending";
import { useArrivalMemory } from "@/shared/lib/navigation/route-arrival-memory";
import { useAgentDockDefaultOpen } from "@/shared/lib/llm-connection/use-agent-dock-default";
import { useDocumentTitle } from "@/shared/lib/public-pages/use-document-title";
import { useLocalStorageBoolean } from "@/shared/lib/preferences/preference-storage/use-local-storage-boolean";
import { useHeldValue } from "@/shared/lib/render-timing/use-presence";
import { useLatestRef } from "@/shared/lib/use-latest-ref";
import { LiveAnnouncer, WidgetErrorFallback, useToast } from "@/shared/ui";
import { ErrorBoundary } from "@/shared/ui/fallbacks/error-boundary";
import { MapEntryLoadingVisual } from "@/shared/ui/fallbacks/map-entry-loading-visual";
import { RouteLoadingFallback } from "@/shared/ui/fallbacks/route-loading-fallback";
import { OPEN_SHORTCUTS_EVENT, useSurfaceRequest } from "@/shared/lib/keyboard/surface-requests";
import { useNavRailContextHrefs, useNavRailSettingsSlot } from "@/widgets/app-nav-rail";
import { GestureHint } from "@/widgets/gesture-hint";
import { useTranslations } from "next-intl";
import { startTransition, useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { useAcpRuntimeController } from "../model/agent/use-acp-runtime-controller";
import { useHomeRouteState } from "../model/route-state/use-home-route-state";
import { useMapViewSync } from "../model/route-state/use-map-view-sync";
import { useHomeWorkbenchController } from "../model/use-home-workbench-controller";
import { useNodeDatasheetModel } from "../model/inspector/use-node-datasheet-model";
import { useTopologyGraphProjection } from "../model/map-canvas/use-topology-graph-projection";
import { isDeeplinkRouteState } from "../model/route-state/url-state";

import { AppSettingsMenu } from "@/widgets/app-settings-menu";
import { refreshIndexDependentTokens } from "@/widgets/ontology-map";
import { type IndexPanelState } from "@/widgets/topology-index-panel";
import { buildNavRailContextHrefs } from "../lib/selection/nav-rail-context-hrefs";
import { useFootprintTrail } from "../model/trail/use-footprint-trail";
import { TopologyBlockingOverlays } from "./map-overlays/TopologyBlockingOverlays";



const LEFT_PANEL_COLLAPSED_KEY = "demo:left-panel-collapsed:v2";
// The navigation actions still accept a replay callback; trails are no longer archived.
const replayNoPastWalk = (): string | null => null;
/**
 * Boot render gate: the first client commit renders the server fallback's `MapEntryLoadingVisual`
 * and the body follows in a `startTransition`, splitting the largest boot long task. A client mount
 * with no loader on screen holds it back for `--motion-base`, so a shorter boot shows none. SSG
 * goes straight to the body, which suspends on `useSearchParams`, keeping the export identical.
 */
export function HomePage() {
  const tMapEntry = useTranslations('mapEntry');
  const tMapError = useTranslations('topology.widgetError');
  const [mapEntryTicket] = useState(() => readMapNavigationPending()?.id ?? null);
  // Only the first load splits: later arrivals already hold the map's code and graph, and
  // splitting them crossfades into a loading visual. `shared/lib/navigation/route-arrival-memory.ts` is empty
  // during static render and hydration, so the exported HTML and first commit are unchanged.
  const [bootedOnce, rememberBooted] = useArrivalMemory("home-map-booted", false);
  const [bootRenderReady, setBootRenderReady] = useState(bootedOnce);
  const [loaderOnScreen] = useState(() => typeof document === 'undefined' || document.querySelector('[data-testid="map-entry-fallback"]') !== null);
  const mapWaits = useMapWaitsForFolder(mapEntryTicket);
  useEffect(() => {
    rememberBooted(true);
    if (bootRenderReady) return;
    startTransition(() => setBootRenderReady(true));
  }, [bootRenderReady, rememberBooted]);
  if (mapWaits) return <RouteLoadingFallback />;
  if (!bootRenderReady) {
    const visual = (
      <MapEntryLoadingVisual
        title={tMapEntry('mapComing')}
        description={tMapEntry('loadingDetail')}
        headline={tMapEntry('headline')}
        lede={tMapEntry('lede')}
      />
    );
    return loaderOnScreen ? visual : (
      <div className="route-loading-in flex h-full min-h-full flex-1 flex-col" style={{ animationDelay: 'var(--motion-base)' }}>
        {visual}
      </div>
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
  const { t, siteT, relationLabelInRegister, activeLocale, view3d, neural, structure } = topologyPreferences;
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
  const [growthReplaying, setGrowthReplaying] = useState(false);
  const [topologyVisibleCount, setTopologyVisibleCount] = useState<number | null>(null);
  const [topologyGraphStats, setTopologyGraphStats] = useState<{
    key: string;
    nodes: number;
    relations: number;
  } | null>(null);
  const router = useRouter();
  const projectsQuery = useProjects();
  const projects = projectsQuery.projects;
  const projectsError = projectsQuery.error;
  const heldProjectsError = useHeldValue(projectsError);
  const [routeState, setRouteState] = useHomeRouteState();
  useMapViewSync(routeState.mapView, setRouteState);
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
  const [vaultAgentPrefill, setVaultAgentPrefill] = useState<VaultAgentPrefill | null>(null);
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
  useSurfaceRequest(OPEN_SHORTCUTS_EVENT, () => {
    setShortcutsOpen(true);
    return true;
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
    expandedParents: expandedParentSlugs,
    realmSlug,
    recentWindow,
  } = routeState;
  const [expandAllActive, setExpandAllActive] = useState(false);
  const renderProjects = projects;
  const topologyRouteControls = useTopologyRouteControls({
    expandedParentSlugs, expandAllActive, setExpandAllActive, setRouteState, setFitViewToken, indexState,
    analysisMode, selectedSlug, renderProjects, topologyPreferences
  });
  const { selectedProject, indexPanelCollapsedStored, handleChangeIndexDefaultCollapsed } = topologyRouteControls;
  const topologyVaultReadModel = useTopologyVaultReadModel({
    recentWindow, pathSourceSlug, pathTargetSlug, expandAllActive, setRouteState, setFitViewToken,
    selectedSlug, projectsQuery, toast, topologyRouteControls, topologyPreferences
  });
  const {
    vault, selectedOntologyNode, ontologyInsight, recentChanges, docFreshnessIndex, docFileDateIndex, docDatesReading,
    updatedAgoNowMs, spotlightOn, changedSlugs, dustySlugs, deeplinkSourceReady, handoffSource, vaultIdentity
  } = topologyVaultReadModel;
  const vaultStatus = vault.status;
  const openVault = vault.open;
  // `AppNavRail` lives in the layout, so this page registers its settings node
  // through `useNavRailSettingsSlot`. The memo sits after `vault` and `ontologyChangeset`, which
  // the history tile reads.
  const navRailSettingsSlot = useMemo(
    () => (
      <AppSettingsMenu
        mode={vaultStatus === 'loaded' ? 'local' : 'static'}
        triggerVariant="rail-tile"
        screenControls={{
          indexCollapsed: indexPanelCollapsedStored,
          onIndexCollapsedChange: handleChangeIndexDefaultCollapsed,
        }}
      />
    ),
    [
      indexPanelCollapsedStored,
      handleChangeIndexDefaultCollapsed,
      vaultStatus,
    ],
  );
  useNavRailSettingsSlot(navRailSettingsSlot);
  // In sample mode a quiet "switch to my data ⌘O" pill stays in the top row until a real vault
  // connects.
  const sampleModeSettled = useFirstRunSampleModeSettled();
  const sampleModeKnown = useFirstRunSampleModeKnown();
  // Without File System Access the pill and ⌘O open the same sheet in its unsupported mode,
  // instead of silently doing nothing.
  const fsaUnsupported = vaultStatus === "unsupported";
  const [unsupportedGuideOpen, setUnsupportedGuideOpen] = useState(false);
  const requestVaultOpen = useCallback(() => {
    if (fsaUnsupported) {
      setUnsupportedGuideOpen(true);
      return;
    }
    void openVault();
  }, [fsaUnsupported, openVault, setUnsupportedGuideOpen]);
  const topologyAuthoring = useTopologyAuthoring({ setRouteState, meaningEditorIntent, meaningEditParam, toast, topologyVaultReadModel, topologyPreferences });
  const {
    bootstrapOpen, nodeEditTarget, agentActivityStatus, agentFocusNodeId,
    closeCreateNode, setBootstrapOpen, bootstrapPlan, runBootstrap
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
  const topologyExplorationLenses = useTopologyExplorationLenses({
    routeState, setRouteState, topologyVaultReadModel, topologyGraphProjection, topologyRouteControls,
    foldsApply: neural || topologyGraphProjection.resolvedRealmSlug !== null,
  });

  const {
    footprintTrailEntries,
    footprintTrailStepCaptions,
    footprintVisitedIds,
    footprintPacketCopied,
    copyFootprintPacket,
    clearFootprintTrail,
    footprintLensActiveRef,
    footprintBrushNodeIdRef,
    handleFootprintLens,
    handleFootprintBrush,
  } = useFootprintTrail({
    trailScope: deeplinkSourceReady ? vaultIdentity : null,
    canvasSelectedSlug,
    graphNodes: ontologyMapGraph.nodes,
    insightNodes: ontologyInsight?.nodes,
    insightEdges: ontologyInsight?.edges,
    relationLabelOf: relationLabelInRegister,
  });
  const topologyCanvasFocus = useTopologyCanvasFocus({ topologyVaultReadModel });
  const topologyCreateIntent = useTopologyCreateIntent({
    analysisMode, createNodeIntent, ontologySearchOpen, shortcutsOpen, setOntologySearchOpen,
    setShortcutsOpen, setDocsDrawerOpen, setRouteState, topologyAuthoring, topologyCanvasFocus
  });
  const { createNodePending } = topologyCreateIntent;
  // The parser preserves unknown keys, so this needs no schema change.
  const authoredSignificance = useMemo(() => {
    const value = nodeEditTarget?.frontmatter?.significance;
    return typeof value === "string" ? value : null;
  }, [nodeEditTarget]);
  const formatUpdatedLabel = useCallback(
    (key: string, count: number) => t(`nodeDatasheet.updated_${key}`, { count }),
    [t],
  );
  const tEditProvenance = useTranslations("editProvenance");
  const tSummaryFreshness = useTranslations("summaryFreshness");
  const formatEditAgeLabel = useCallback(
    (key: string, count: number) => tEditProvenance(`age.${key}`, { count }),
    [tEditProvenance],
  );
  const { nodeFocus, v2DatasheetModel } = useNodeDatasheetModel({
    selectedOntologyNode,
    insight: ontologyInsight,
    mapGraph: ontologyMapGraph,
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
  const codeReaderRoom = useCodeReaderRoom();
  const topologyIndexPresentation = useTopologyIndexPresentation({
    v2DatasheetModel, analysisMode, setRouteState, routeState, meaningEditorIntent, indexState,
    topologyCanvasFocus, topologyRouteControls, topologyVaultReadModel, homeWorkbenchController,
    topologyAuthoring, codeReaderRoom
  });
  const { indexSlotSwap, renderedIndexState } = topologyIndexPresentation;
  // Names only verified runtimes right after a folder opens; unmeasured ones would read as a
  // guarantee.
  // `isGuardedRuntime` is the one decision, shared with the Agents destination.
  const acpRuntimeController = useAcpRuntimeController(setAcpChatOpen, topologyVaultReadModel.gitVaultPath);
  const { chatWidth, acpRuntime } = acpRuntimeController;
  const changedSourceConcepts = useChangedSourceConcepts(topologyVaultReadModel.ontologyInsight?.nodes);
  const chatSuggestions = useChatSuggestions(projectSourceReadiness.state, changedSourceConcepts);
  const acpRuntimeLabel = acpRuntime?.label ?? null;
  const topologyAgentActivity = useTopologyAgentActivity({ topologyVaultReadModel, acpRuntimeController, topologyAuthoring });

  const indexSlotFrames: ReadonlyArray<{ state: IndexPanelState; exiting: boolean }> =
    indexSlotSwap.leaving === null
      ? [{ state: renderedIndexState, exiting: false }]
      : [
        { state: indexSlotSwap.leaving, exiting: true },
        { state: renderedIndexState, exiting: false },
      ];
  const selectedSlugRef = useLatestRef(selectedSlug);
  useEffect(() => {
    const root = document.documentElement;
    root.dataset.topologyIndex = renderedIndexState;
    // Refreshes only `--map-safe-inset-left`: a blanket cache drop on every selection forces a
    // costly style recalc.
    refreshIndexDependentTokens(root);
    let cancelled = false;
    // A selection keeps its camera: this overview fit, measured before the dock or INDEX has
    // resized the free map, would pull the camera off the selection.
    if (!view3d && !structure && !acpDockFrameOpen && selectedSlugRef.current === null) {
      window.queueMicrotask(() => {
        if (!cancelled) setFitViewToken((count) => count + 1);
      });
    }
    return () => {
      cancelled = true;
      delete root.dataset.topologyIndex;
    };
  }, [renderedIndexState, view3d, structure, acpDockFrameOpen, selectedSlugRef]);
  const topologyInspectorState = useTopologyInspectorState({
    setExpandAllActive, setRouteState, nodeFocus, v2DatasheetModel, mapGraph: ontologyMapGraph, analysisMode, selectedSlug,
    topologyCanvasFocus, topologyVaultReadModel, topologyAuthoring, homeWorkbenchController,
    topologyIndexPresentation
  });
  const topologyAgentOrchestration = useTopologyAgentOrchestration({
    setOntologySearchOpen, setVaultAgentPrefill, routeState, agentDockTouchedRef, setRouteState,
    agentDockDefaultOpen, topologyVaultReadModel, topologyGraphProjection, acpRuntimeController,
    homeWorkbenchController, topologyAuthoring, topologyPreferences, topologyIndexPresentation, codeReaderRoom
  });
  const { agentDockOpen, runtimeChatOpen, closeVaultAgent, openVaultAgent } = topologyAgentOrchestration;
  const askAgentFromSource = useCallback((text: string) => {
    setVaultAgentPrefill({ text, nonce: Date.now() });
    openVaultAgent();
  }, [openVaultAgent]);
  const topologySourceActions = useTopologySourceActions({
    toast, v2DatasheetModel, topologyPreferences, topologySourceReadiness, topologyCanvasFocus,
    // Only a ready in-app tool can take the request now; anyone else gets it to paste into their own agent.
    askAgent: topologyAgentOrchestration.agentChatUsesRuntime ? askAgentFromSource : null,
  });
  const { setFullDetailSlug } = topologyCanvasFocus;
  const gitVaultPath = topologyVaultReadModel.gitVaultPath;
  const grayArea = useTopologyGrayArea({
    docs: topologyVaultReadModel.vault.manifest?.docs ?? [],
    nodes: topologyVaultReadModel.ontologyInsight?.nodes ?? [],
    selectedSlug: topologyVaultReadModel.selectedOntologyNode?.id ?? null,
    memberSlugs: topologyExplorationLenses.routedConstellation?.memberSlugs ?? null,
    vaultPath: gitVaultPath,
    vaultHandle: topologyVaultReadModel.vault.handle,
    vaultLoaded: topologyVaultReadModel.vault.status === 'loaded',
    locale: activeLocale, routeState, setRouteState,
    onOpen: () => { closeVaultAgent(); setFullDetailSlug(null); },
    onChooseScope: () => setOntologySearchOpen(true),
    runtime: acpRuntimeController.acpRuntime,
    busy: Boolean(topologyAgentActivity.acpLiveWork),
    onAnalyze: (text,snapshot,projectUid,investigation,sourceRoot,label) => {
      if(!gitVaultPath)return;
      acpRuntimeController.setInvestigationBasis({nonce:Date.now(),vaultPath:gitVaultPath,text,snapshot,projectUid,sourceRoot,label});
      acpRuntimeController.setAgentOpeningRequest({text,nonce:Date.now(),scopeKey:JSON.stringify([gitVaultPath,'meaning']),investigation});
      openVaultAgent();
    },
    onPrepare: (text,contextLabel,basis) => {
      if(basis&&gitVaultPath)acpRuntimeController.setInvestigationBasis({nonce:Date.now(),vaultPath:gitVaultPath,text,...basis,label:contextLabel});
      setVaultAgentPrefill({text,nonce:Date.now(),context:{label:contextLabel,vaultPath:gitVaultPath}}); openVaultAgent();
    },
  });
  const topologyNavigationActions = useTopologyNavigationActions({
    setExpandAllActive, setRouteState, replayPastWalk: replayNoPastWalk, topologyCanvasFocus, topologyPreferences,
    topologyAuthoring, topologyGraphProjection, topologyIndexPresentation, topologySourceReadiness,
    topologyAgentOrchestration, topologyInspectorState
  });
  const topologyKeyboard = useTopologyKeyboard({
    setOntologySearchOpen, setShortcutsOpen, setDocsDrawerOpen, ontologySearchOpen,
    localGraphRoot, setLocalGraphStack, setRouteState, sampleModeSettled, requestVaultOpen,
    topologyGraphProjection, topologyNavigationActions, topologyAuthoring, topologyCanvasFocus,
    topologyInspectorState, topologyRouteControls, topologyExplorationLenses, topologyAgentOrchestration,
    homeWorkbenchController
  });
  const topologySceneControls = useTopologySceneControls({
    pathSourceSlug, pathTargetSlug, analysisMode, expandAllActive, setRouteState, setExpandAllActive,
    setFitViewToken, toast, mapEntryTicket, localGraphRoot, topologyGraphStats,
    projectsQuery, activeCategory, topologyVisibleCount, setTopologyGraphStats, topologyExplorationLenses,
    topologyVaultReadModel, topologyGraphProjection, topologyRouteControls, topologyPreferences,
    topologyAuthoring, topologyCanvasFocus
  });
  const { drawerOpen } = topologySceneControls;
  useTopologyAssetPreload({ prefetchedProjectHrefsRef, router, preloadedImageUrlsRef, selectedSlug, topologyGraphProjection });
  const topologyAnalysisReview = useTopologyAnalysisReview({
    router, setExpandAllActive, setRouteState, topologyVaultReadModel, homeWorkbenchController,
    topologyAuthoring, topologyPreferences, topologyCanvasFocus, topologyNavigationActions,
    investigationBasis: acpRuntimeController.investigationBasis,
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
          <h1 className="sr-only">
            {t('srHeading')}
          </h1>
          {topologySceneControls.topologyRenderState.renderCanvas && <GestureHint
            disabled={drawerOpen || structure}
          />}
          <LiveAnnouncer
            message={(() => {
              if (!selectedProject) return "";
              const deps = selectedProject.dependencies.length;
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
              grayAreaAction={grayArea.action}
              routeState={routeState}
              setRouteState={setRouteState}
              setVaultAgentPrefill={setVaultAgentPrefill}
              setOntologySearchOpen={setOntologySearchOpen}
              setTopologyRelayoutToken={setTopologyRelayoutToken}
              toast={toast}
              expandAllActive={expandAllActive}
              analysisMode={analysisMode}
              footprintTrailEntries={footprintTrailEntries}
              footprintTrailStepCaptions={footprintTrailStepCaptions}
              footprintPacketCopied={footprintPacketCopied}
              copyFootprintPacket={copyFootprintPacket}
              clearFootprintTrail={clearFootprintTrail}
              handleFootprintLens={handleFootprintLens}
              handleFootprintBrush={handleFootprintBrush}
              agentDockTouchedRef={agentDockTouchedRef}
              sampleModeSettled={sampleModeSettled}
              sampleModeKnown={sampleModeKnown}
              requestVaultOpen={requestVaultOpen}
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
              closeCreateNode={closeCreateNode}
              createNodePending={Boolean(createNodePending)} openDocsDrawer={() => setDocsDrawerOpen(true)}
            />
            {!topologyGraphProjection.isSynthetic && <TopologyIndexSlot
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
              topologyAuthoring={topologyAuthoring}
              topologySourceReadiness={topologySourceReadiness}
              acpRuntimeController={acpRuntimeController}
              topologyAgentOrchestration={topologyAgentOrchestration}
              topologyCreateIntent={topologyCreateIntent}
            />}
          </>
          <TopologyCanvasSurface
            localGraphRoot={localGraphRoot}
            acpRuntimeLabel={acpRuntimeLabel}
            router={router}
            mapEntryTicket={mapEntryTicket}
            expandAllActive={expandAllActive}
            mapAssemblesOnOpen={!isDeeplinkRouteState(routeState)}
            combinedFitToken={combinedFitToken}
            growthReplayToken={growthReplayToken}
            setGrowthReplaying={setGrowthReplaying}
            topologyRelayoutToken={topologyRelayoutToken}
            setTopologyVisibleCount={setTopologyVisibleCount}
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
            topologyInspectorState={topologyInspectorState}
            topologyCreateIntent={topologyCreateIntent}
            topologyIndexPresentation={topologyIndexPresentation}
            topologyExplorationLenses={topologyExplorationLenses}
            impactLensActive={impactMode !== "none" && selectedSlug !== null}
            selectionReframeToken={codeReaderRoom.seatToken}
          />
          <TopologyInspectorSurfaces
            topologyKeyboard={topologyKeyboard}
            grayAreaOpen={grayArea.open}
            grayAreaAction={grayArea.action}
            projectsError={projectsError}
            heldProjectsError={heldProjectsError}
            renderProjects={renderProjects}
            impactMode={impactMode}
            tEditProvenance={tEditProvenance}
            tSummaryFreshness={tSummaryFreshness}
            topologyPreferences={topologyPreferences}
            topologyAuthoring={topologyAuthoring}
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
            codeReaderRoom={codeReaderRoom}
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
          />
        </div>
        {grayArea.inspector}
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
