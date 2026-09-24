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
import { useTerritoriesViewSync } from "../model/use-territories-view-sync";
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
 * Boot render gate. Measured 2026-08-19: the single largest long task on a first
 * visit to `/ko/topology/` was **this view's first client render + commit**, at
 * 324–335 ms under 4× CPU throttling. The initial render at a lazy boundary runs
 * in the synchronous lane, so the whole 6,000-line tree lands in one task.
 *
 * The fix: the first client commit clones the DOM of the server fallback
 * (`MapEntryFallback`) that is already on screen, so it finishes in a few ms with
 * no pixel change, and the real tree renders in the following `startTransition`.
 * The transition lane yields roughly every 5 ms, splitting the big render into
 * many small tasks; what the user sees is unchanged — fallback, the same fallback
 * again, then the finished page.
 *
 * Prescription: the first client commit renders only the shared loading visual of the server fallback,
 * and the main body renders in the subsequent `startTransition`. The transition lane yields every ~5ms,
* splitting the large render into many small tasks; the screen sequence is
 * fallback → same central loading state → completed map. Since server and client share
 * the same `MapEntryLoadingVisual`, there is no separate HTML cloning or markup drift.
 *
 * SSG goes straight to the main body because `window` is unavailable, and the main body suspends on `useSearchParams`
 * as before, so the fallback bakes into the HTML — the exported document remains byte-identical.
 */
export function HomePage() {
  const tMapEntry = useTranslations('mapEntry');
  const tMapError = useTranslations('topology.widgetError');
  const [mapEntryTicket] = useState(() => readMapNavigationPending()?.id ?? null);
  /*
   * **The split is for the first load, and only the first load** (2026-09-12).
   *
   * The two-commit boot above exists so the very first paint of this route is not the 6,800-line
   * tree rendered in one blocking commit. It was doing that on **every** arrival, including a
   * rail click from a screen the person was already looking at: measured at 1512×901 on the
   * static export, `map-entry-fallback` mounted 34 ms after the click and was gone by 57 ms, so
   * the route crossfade was fading the old screen into a *loading* visual which the real map
   * then replaced. 23 ms is about a frame and a half — short, and still the wrong picture in the
   * one frame the browser captured.
   *
   * Remembering that this route has already booted (`shared/lib/route-arrival-memory.ts`) keeps
   * the split exactly where it earns its keep. The memory is empty during the static render and
   * during hydration, so the exported HTML and the first client commit are unchanged and there
   * is no mismatch; it is only true from the second arrival onwards, when the person is already
   * inside the app and the map's code, tokens and derived graph are all in memory.
   */
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
  /*
   * Hold the breadcrumb's contents so it still draws during its exit window.
   * Without this, the moment the stack empties the pill remains but its inside
   * goes blank as it leaves. The hold key is the stack itself, flattened to a
   * primitive because the array's identity changes every render.
   */
  const heldLocalGraphStack =
    useHeldValue(localGraphStack.length > 0 ? localGraphStack : null, localGraphStack.join('>')) ??
    [];
  const localGraphRoot =
    localGraphStack.length > 0 ? localGraphStack[localGraphStack.length - 1] : null;
  const [fitViewToken, setFitViewToken] = useState(0);
  const [growthReplayToken, setGrowthReplayToken] = useState(0);
  /**
   * Whether a growth replay is on screen right now, reported by the map loop so the
   * control can wear the active tone and `aria-pressed` for exactly as long as the
   * motion lasts — including when the replay finishes by itself and the button
   * returns to rest on its own (owner, 2026-09-07).
   */
  const [growthReplaying, setGrowthReplaying] = useState(false);
  const [topologyVisibleCount, setTopologyVisibleCount] = useState<number | null>(null);
  // M-5 — semantic-zoom altitude tier reported by the map engine, for the
  // corner readout's orientation label. "spine" at the overview entry; drops
  // the "zoom in to see elements" hint once it reaches "element".
  const [mapZoomTier, setMapZoomTier] = useState<"spine" | "circuit" | "element">(
    "spine",
  );
  const [topologyGraphStats, setTopologyGraphStats] = useState<{
    key: string;
    nodes: number;
    relations: number;
  } | null>(null);
  const router = useRouter();
  // Mode-aware read: local mode syncs from the vault manifest, static mode from
  // the build-time dogfood manifest. Either way a `.md` in the vault reaches the
  // list and the map immediately.
  const projectsQuery = useProjects();
  const projects = projectsQuery.projects;
  const projectsError = projectsQuery.error;
  /* The alert text is held across its exit window too; a primitive needs no key. */
  const heldProjectsError = useHeldValue(projectsError);
  const [routeState, setRouteState] = useHomeRouteState();
  useTerritoriesViewSync(routeState.mapView, setRouteState);
  /**
   * The agent panel — a vertical dock the map makes room for on its right.
   *
   * One at a time: opening it retires the search palette and the concept composer.
   * All three demand attention over the map, and overlapping them destroys which
   * one is the primary surface.
   */
  const homeWorkbenchController = useHomeWorkbenchController();
  const { setAcpChatOpen, acpDockFrameOpen, meaningWorkbenchOpen, reviewUsesSheet } = homeWorkbenchController;
  /**
   * Whether the dock starts open — true only in the installed app with a key
   * present (`null` means not known yet). The owner asked for it to be "in view",
   * but parking a locked panel on a machine with no key keeps the letter of that
   * and breaks its intent.
   */
  const agentDockDefaultOpen = useAgentDockDefaultOpen();
  /**
   * Once the user has opened or closed the dock themselves, their intent beats the
   * default. Otherwise a dock they closed reopens as soon as the key lookup
   * resolves, which reads as "close does not work".
   */
  const agentDockTouchedRef = useRef(false);
  /*
   * ⚠️ Opening by ourselves goes through the one door (`openAgentChat`), because
   * that door decides coding-agent vs. API key. Choosing the branch again here
   * puts two chat panels on screen at once. Owner, 2026-08-16: *"one chat panel only"* (one chat panel only). That function reads runtime state, so it and
   * this effect both live further down.
   */
  /**
   * A first line handed in from outside. Only a sentence lands here and nothing is
   * sent — it sits in the panel's input so the user can edit, send, or clear it.
   * `nonce` makes the same sentence land again when it is picked a second time.
   */
  const [vaultAgentPrefill, setVaultAgentPrefill] = useState<{
    text: string;
    nonce: number;
  } | null>(null);
  // The header search button, ⌘K and ⇧⌘K all open this one palette
  // (`MountedGlobalSearch`, ontology nodes + projects). ⌘K on a project detail
  // page navigates home and leaves a sessionStorage flag; reading it in the lazy
  // initializer opens the palette on the first render instead of a frame later.
  // Lazy initializers only run on the client, so SSR and hydration both see
  // `false` and there is no mismatch.
  const [ontologySearchOpen, setOntologySearchOpen] = useState(() => {
    if (typeof window === "undefined") return false;
    try {
      if (window.sessionStorage.getItem("demo:open-search") === "1") {
        window.sessionStorage.removeItem("demo:open-search");
        return true;
      }
    } catch {
      /* private mode — skip */
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
      /* private mode */
    }
    return false;
  });
  const [docsDrawerOpen, setDocsDrawerOpen] = useState(false);
  // SSR and the first client render must match, so the stored preference cannot be
  // read in a `useState` initializer — that produces a hydration mismatch on the
  // className. `useSyncExternalStore`'s server snapshot keeps the SSR default and
  // the client snapshot applies the stored value after mount.
  const leftPanelCollapsed = useLocalStorageBoolean(LEFT_PANEL_COLLAPSED_KEY, true);
  const [topologyRelayoutToken, setTopologyRelayoutToken] = useState(0);

  /**
   * When an arrow key has nowhere to go, one self-dismissing line.
   *
   * Owner: *"No related node to move to … Show it briefly and let it disappear automatically."*
   * (show it briefly, then let it disappear on its own). This reuses the existing
   * toast rather than adding a surface: a new notice box over the map would need
   * its own position, tokens, and motion, and that is not a spec one author sets
   * alone. The widget filters repeats (`shouldAnnounceDeadEnd`).
   */
  const toast = useToast();
  /** The starter scaffold's failures reach a person as a sentence, not as a thrown string (B2). */
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
  /** Overview of the previous node explicitly called by the user. A session view that does not persist to URL/settings. */
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
    vault, selectedOntologyNode, ontologyInsight, recentChanges, docFreshnessIndex, updatedAgoNowMs,
    spotlightOn, changedSlugs, dustySlugs, deeplinkSourceReady, handoffSource, vaultIdentity
  } = topologyVaultReadModel;
  // `AppNavRail` lives in the layout, so this page cannot mount it. It registers the
  // node the rail should render through context instead (`useNavRailSettingsSlot`),
  // and effect cleanup clears it on navigation. Only this page overrides the shell's
  // default settings slot, because only this page has the map's screen controls to
  // put in it. The memo sits here, after `vault` and `ontologyChangeset`, because the
  // history tile reads the vault path and the session changeset.
  const navRailSettingsSlot = useMemo(
    () => (
      <>
        {/* Settings were consolidated 2026-07-24: the old map-settings popover was
            retired and the gear now opens the single settings sheet. Map-only
            screen state is injected through `screenControls`, so pages that do not
            inject it simply have no such row. The sheet is a scrim-backed modal and
            handles its own ⌘K demotion, so the old gear's mutual-exclusion signal
            is no longer needed. */}
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
  // Dismissing the first-run card used to hide the "open a folder" entry point
  // behind the settings gear. While in static sample mode — independent of whether
  // the card was dismissed — a quiet "switch to my data ⌘O" pill stays in the top
  // utility row, and it disappears on its own once a real vault is connected.
  const sampleModeSettled = useFirstRunSampleModeSettled();
  // On unsupported browsers (Safari, Firefox) that pill and ⌘O called
  // `vault.open()` and nothing happened: the status flipped quietly to
  // `unsupported`, and anyone who had already dismissed the first-run card got no
  // response at all — the kind of silence that makes people press the same button
  // again. When something cannot be done, say why and give somewhere to go: open
  // the same sheet the card uses, in its unsupported mode.
  const fsaUnsupported = vault.status === "unsupported";
  const [unsupportedGuideOpen, setUnsupportedGuideOpen] = useState(false);
  const requestVaultOpen = useCallback(() => {
    if (fsaUnsupported) {
      setUnsupportedGuideOpen(true);
      return;
    }
    void vault.open();
  }, [fsaUnsupported, vault, setUnsupportedGuideOpen]);
  // Auto-start accepts **both** the sample and a real folder settling. The earlier
  // condition only watched the sample, so anyone who picked a folder never got the
  // tour (`use-auto-start-ready.ts`).
  const tourAutoStartReady = useGuidedTourAutoStartReady();
  const topologyAuthoring = useTopologyAuthoring({ setRouteState, meaningEditorIntent, meaningEditParam, toast, topologyVaultReadModel, topologyPreferences });
  const {
    canCreateNode, createNodeOpen, bootstrapOpen, nodeEditTarget, agentActivityStatus, agentFocusNodeId,
    closeCreateNode, setBootstrapOpen, bootstrapPlan, runBootstrap, createNodePanelRef,
    handleCreateNodePanelKeyDown, createNode, createNodeDomainOptions, createNodeProposal,
    createNodeConfirming, setCreateNodeProposal, confirmCreateNode
  } = topologyAuthoring;
  const combinedFitToken = fitViewToken;
  // Client-side dynamic title: static export cannot vary page metadata, so the
  // selected context reaches the browser tab from here.
  useDocumentTitle(
    Array.from(
      new Set(
        [
          selectedProject?.name,
          // The tab title uses the short display title too.
          selectedOntologyNode?.display ?? selectedOntologyNode?.title,
          t('documentTitle'),
          siteT('siteName'),
        ].filter((value): value is string => Boolean(value)),
      ),
    ).join(" · ") || null,
  );
  // Relative time of past steps in the session, based on Date.now(). Capture
  // once at mount to prevent relative time for the same record from shifting on every re-render.
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
    // The walked pairs are read back against the vault's own edges, so the trail can
    // say *why* one step follows another instead of only which places were opened.
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
  // An authored `significance` in the frontmatter overrides the derived "why this
  // matters" line. Unspecified keys are preserved by the parser, so this needs no
  // schema change.
  const authoredSignificance = useMemo(() => {
    const value = nodeEditTarget?.frontmatter?.significance;
    return typeof value === "string" ? value : null;
  }, [nodeEditTarget]);
  const formatUpdatedLabel = useCallback(
    (key: string, count: number) => t(`nodeDatasheet.updated_${key}`, { count }),
    [t],
  );
  // Copy for the last-editor and conflict badges. Reuses the same `editProvenance`
  // namespace as `DocFrontmatterBlock` rather than copying it, so the two cannot
  // drift.
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
  // Carries the selection into the nav rail. Going to the rail's documents entry with
  // a node selected used to land on the default `/docs/` screen, unrelated to what
  // was selected. The datasheet has already derived `documentHref` (a `?slug=` deep
  // link to the vault file), so it is registered with the rail as-is — no new
  // parameter and no new transform. With nothing selected `documentHref` is null and
  // the rail keeps its default href.
  const navRailContextHrefs = useMemo(
    () => buildNavRailContextHrefs(v2DatasheetModel?.documentHref ?? null),
    [v2DatasheetModel?.documentHref],
  );
  /* Ambient chrome that yields to a surface a person is reading: the datasheet and either
     right dock. Shared by the bottom-right readout so the rule has one name. */
  const readoutStepsAside = Boolean(v2DatasheetModel) || acpDockFrameOpen || meaningWorkbenchOpen;
  useNavRailContextHrefs(navRailContextHrefs);
  const topologyIndexPresentation = useTopologyIndexPresentation({
    v2DatasheetModel, analysisMode, setRouteState, routeState, meaningEditorIntent, indexState,
    topologyCanvasFocus, topologyRouteControls, topologyVaultReadModel, homeWorkbenchController,
    topologyAuthoring
  });
  const { indexSlotSwap, renderedIndexState } = topologyIndexPresentation;
  /*
   * Detects which agent runtimes are available, so the screen **right after a folder
   * is opened** can say what can be used (owner remark, 2026-08-16). Kept only inside
   * settings, that fact exists solely for people who go looking for it.
   *
   * **Only verified runtimes** are named. Recommending something we have not actually
   * measured, on the first screen, reads as a guarantee.
   *
   * The decision lives in one place, `isGuardedRuntime`. A session mode once made
   * Codex qualify here, but installed acceptance proved that mode does not stop an
   * Atlas MCP write. Removing it from the shared predicate removes it from both
   * this selector and the Agents destination instead of leaving one unsafe door.
   */
  const acpRuntimeController = useAcpRuntimeController(setAcpChatOpen);
  const { chatWidth, acpRuntime } = acpRuntimeController;
  /*
    The answer to "what should I ask?" is derived from **this folder's current state**
    (2026-08-17). Reading the vault is the view's job and the chat panel receives only
    the result: were the panel to read the vault itself it could not stand without a
    `LocalVaultProvider`, and that is not a property that widget has ever had.
  */
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
    // **No blanket invalidation** (performance trace, 2026-07-28). This effect also
    // runs when a node is selected, because INDEX demotes to the rail. Discarding the
    // whole token cache forces a style recalculation on the next frame — 115
    // `getPropertyValue` calls, 58 ms burnt on every click. The only token
    // `data-topology-index` actually changes is `--map-safe-inset-left`, so
    // only that one is refreshed.
    refreshIndexDependentTokens(root);
    let cancelled = false;
    // Deferred to a microtask to avoid a synchronous setState (cascading-render
    // warning).
    //
    // The 3D dome and Galaxy do not get this re-fit. This effect runs on **every
    // selection and deselection** because the INDEX demotes to the rail. Flat needs
    // the fit before its focus dive; Galaxy instead keeps the reader's current pan
    // and zoom while the inspector opens. Sending the shared fit token there would
    // silently replace that reading context with a full overview.
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
        // When the agent panel takes space, the fixed surface pinned to the right (the
        // selected-node inspector) stands that much further in. If the evidence (the
        // node) and the counterpart (the agent) cover each other, "looking at the map
        // together" does not hold. The rule itself is in `app/globals.css`.
        data-agent-panel-open={agentDockOpen ? 'true' : 'false'}
        /*
         * ⚠️ **That rule was reserving the wrong width** (2026-08-16 review).
         *
         * The reservation in `globals.css` reads `var(--agent-panel-width)`, which is the
         * `clamp(320px, 26vw, 420px)` the key-branch panel uses. But the coding-agent
         * branch is sized **by the user's drag** (320–968px) and writes nothing to that
         * token. Both set `data-agent-panel-open='true'`, so the rule reserved the wrong
         * number: at 1512 wide, 26vw is 393 while the panel is 420, leaving the inspector
         * overlapping by 27px **on top of the resize handle** — and widened further, the
         * inspector ended up entirely inside the panel.
         *
         * Rather than change the rule, **the value it reads is filled with the right
         * number**. The two branches never open at once, so this override cannot affect
         * the key branch.
         */
        style={
          acpDockFrameOpen || runtimeChatOpen || meaningWorkbenchOpen
            ? ({ '--agent-panel-width': `${chatWidth.width}px` } as CSSProperties)
            : undefined
        }
        className="relative flex h-full w-full overflow-hidden bg-[color:var(--color-canvas)]"
      >
        {/* The left nav rail lives in `app/[locale]/layout.tsx` (AppShell); this page no
          longer mounts it. Its settings gear is registered through context by
          `useNavRailSettingsSlot(navRailSettingsSlot)` above. */}
        <div className="relative h-full flex-1 overflow-hidden" inert={reviewUsesSheet && (meaningWorkbenchOpen || acpDockFrameOpen)}>
          {/*
        Screen-reader landmark and SEO h1. The visual design is canvas-first with
        nowhere to put a visible h1, so it exists in the document structure only.
      */}
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
              // `reverseDeps` is the memo above, so this is an O(1) lookup instead of
              // re-filtering every project on every render.
              const referenced = reverseDeps.get(selectedProject.slug)?.length ?? 0;
              return t('selectionAnnouncement', {
                name: selectedProject.name,
                deps,
                referenced,
              });
            })()}
          />
          <>
            {/* Mobile-only mini brand label. */}
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
            {/* INDEX — the left instrument replacing the old `/ontology` tree page.
                Persists alongside the selected-node datasheet (unlike the analysis rail
                below, which the node-focus popover suppresses); the approved spec shows
                both coexisting over the map. */}
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
            {/* Complete deletion of TopologyAnalysisBar (Phase 2 of complete disappearance of analysis panel §d) —
                after focus(§a)/path(§b)/health(§c) were all removed, the remaining map/graph
                2-tab lane was migrated to the graph toggle chip in the top-right utility lane. The previous analysis-rail content
                in overview mode has already been retired as a relationship line sample in the shortcut help (W3). */}
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
          {/* The alert band settles down from the top. Its text must be held through the
            exit window or it becomes an empty band while leaving. */}
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
          {/* The one palette shared by the header search button, ⌘K, and ⇧⌘K (ontology
            nodes + projects). Both node and project selections go through `handleSelect`
            so only the map's selection changes; the default (pushing to `/ontology/?node=`
            when `onSelectNode` is absent) would leave the map, so the override is
            mandatory. Controlled through `open`/`onOpenChange`; the hotkeys are managed by
            `useTypingShortcuts` above. */}
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
        {/* A sibling in the **same flex row** as the map column, so one width animation
          moves both: the map narrowing and the panel arriving share a frame and a curve.
          Not two animations tuned to match — physically one. */}
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
