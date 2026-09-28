import type { useRouter } from "@/i18n/navigation";
import type { useAcpRuntimeController } from "../model/use-acp-runtime-controller";
import type { useTopologyAgentOrchestration } from "../model/use-topology-agent-orchestration";
import type { useTopologyAnalysisReview } from "../model/use-topology-analysis-review";
import type { useTopologyAuthoring } from "../model/use-topology-authoring";
import type { useTopologyCanvasFocus } from "../model/use-topology-canvas-focus";
import type { useTopologyCreateIntent } from "../model/use-topology-create-intent";
import type { useTopologyExplorationLenses } from "../model/use-topology-exploration-lenses";
import type { useTopologyGraphProjection } from "../model/use-topology-graph-projection";
import type { useTopologyIndexPresentation } from "../model/use-topology-index-presentation";
import type { useTopologyInspectorState } from "../model/use-topology-inspector-state";
import type { useTopologyKeyboardTour } from "../model/use-topology-keyboard-tour";
import type { useTopologyNavigationActions } from "../model/use-topology-navigation-actions";
import type { useTopologyPreferences } from "../model/use-topology-preferences";
import type { useTopologyRouteControls } from "../model/use-topology-route-controls";
import type { useTopologySceneControls } from "../model/use-topology-scene-controls";
import type { useTopologyVaultReadModel } from "../model/use-topology-vault-read-model";

import { VaultOpenGuideSheet } from "@/features/docs-vault-local";
import { FirstRunReadout, SampleNodeHint } from "@/features/first-run-starter";
import { RecentChangesNeedsVaultDialog } from "@/features/vault-ontology";
import { DESTINATION_HREF } from "@/shared/config/destinations";
import { cn } from "@/shared/lib/cn";
import { cancelMapNavigation } from "@/shared/lib/map-navigation-pending";
import { useSurfaceSwap } from "@/shared/lib/use-presence";
import { ChromeTile, Surface, Tooltip, WidgetErrorFallback, controlClass } from "@/shared/ui";
import { ErrorBoundary } from "@/shared/ui/error-boundary";
import { FrameMeter } from "@/shared/ui/frame-meter";
import { OntologyMap, PLAIN_TIER_REVEAL } from "@/widgets/ontology-map";
import { Compass, HelpCircle, Play } from "lucide-react";
import dynamic from "next/dynamic";
import { useState } from "react";
import { TopologyChangeAnnouncement } from "./TopologyChangeAnnouncement";
import { TopologyNoMatchesState } from "./TopologyNoMatchesState";
import { TopologyLightLegend } from "./TopologyLightLegend";
import { useMapEvidenceStates } from "../model/use-map-evidence-states";
import { TopologyTerritoriesSurface } from "./TopologyTerritoriesSurface";
import { TopologyHexBoardSurface } from "./TopologyHexBoardSurface";
const VaultStartSteps = dynamic(
  () => import("@/widgets/topology-controls").then((m) => m.VaultStartSteps),
  { ssr: false },
);
const TopologyEmptyState = dynamic(
  () => import("@/widgets/topology-controls").then((m) => m.TopologyEmptyState),
  { ssr: false },
);
const TopologyFitControl = dynamic(
  () => import("@/widgets/topology-controls").then((m) => m.TopologyFitControl),
  { ssr: false },
);
const HubRail = dynamic(
  () => import("@/widgets/topology-controls").then((m) => m.HubRail),
  { ssr: false },
);

type MapSurfaceView = "map" | "territories" | "hex";

interface TopologyCanvasSurfaceProps {
  localGraphRoot: string | null;
  acpRuntimeLabel: string | null;
  router: ReturnType<typeof useRouter>;
  mapEntryTicket: number | null;
  expandAllActive: boolean;
  combinedFitToken: number;
  growthReplayToken: number;
  setGrowthReplaying: React.Dispatch<React.SetStateAction<boolean>>;
  topologyRelayoutToken: number;
  setTopologyVisibleCount: React.Dispatch<React.SetStateAction<number | null>>;
  setMapZoomTier: React.Dispatch<React.SetStateAction<"circuit" | "element" | "spine">>;
  footprintVisitedIds: string[];
  footprintLensActiveRef: React.RefObject<boolean>;
  footprintBrushNodeIdRef: React.RefObject<string | null>;
  ontologySearchOpen: boolean;
  setFitViewToken: React.Dispatch<React.SetStateAction<number>>;
  setShortcutsOpen: React.Dispatch<React.SetStateAction<boolean>>;
  analysisMode: import("@/views/home/model/url-state").TopologyAnalysisMode;
  growthReplaying: boolean;
  setGrowthReplayToken: React.Dispatch<React.SetStateAction<number>>;
  renderProjects: import("@/entities/project/model/types").Project[];
  leftPanelCollapsed: boolean;
  localGraphStack: string[];
  setLocalGraphStack: React.Dispatch<React.SetStateAction<string[]>>;
  heldLocalGraphStack: string[];
  topologyVisibleCount: number | null;
  readoutStepsAside: boolean;
  mapZoomTier: "circuit" | "element" | "spine";
  unsupportedGuideOpen: boolean;
  setUnsupportedGuideOpen: React.Dispatch<React.SetStateAction<boolean>>;
  requestVaultOpen: () => void;
  topologyInspectorState: Pick<
    ReturnType<typeof useTopologyInspectorState>,
    | "nodePanelMounted"
    | "selectedEdgeOwnsRightRail"
    | "selectedNodeFocusActive"
    | "topologyUtilityChromeCompact"
  >;
  topologyKeyboardTour: Pick<ReturnType<typeof useTopologyKeyboardTour>, "tourAnchorNodeId" | "tourAnchorRef" | "openGuidedTour" | "tour">;
  topologyRouteControls: Pick<ReturnType<typeof useTopologyRouteControls>, "expandedParentSet" | "handleToggleCluster" | "handleEnterRealm">;
  topologyNavigationActions: Pick<ReturnType<typeof useTopologyNavigationActions>, "handleClose" | "handleSelect">;
  topologyAnalysisReview: Pick<ReturnType<typeof useTopologyAnalysisReview>, "mapRelationCaptions" | "mapReviewQuestionIds">;
  topologyGraphProjection: Pick<
    ReturnType<typeof useTopologyGraphProjection>,
    | "ontologyMapGraph"
    | "canvasSelectedSlug"
    | "resolvedRealmSlug"
    | "localGraphProjects"
    | "resolvedSelectionSlug"
  >;
  topologyPreferences: Pick<
    ReturnType<typeof useTopologyPreferences>,
    | "t"
    | "tTopologyKeyboardWalk"
    | "galaxy"
    | "territories"
    | "hexBoard"
    | "reducedMotion"
    | "audiencePlain"
    | "glyphSet"
    | "canvasBackground"
    | "view3d"
    | "mapArrangement"
    | "footprint"
    | "expand"
  >;
  topologyAgentOrchestration: Pick<ReturnType<typeof useTopologyAgentOrchestration>, "analyzePrompt" | "agentChatUsesRuntime" | "sendAnalyzeToAgent">;
  topologyVaultReadModel: Pick<
    ReturnType<typeof useTopologyVaultReadModel>,
    | "vault"
    | "deeplinkSourceReady"
    | "vaultIdentity"
    | "spotlightFitToken"
    | "selectedOntologyNode"
    | "changedSlugs"
    | "recentNeedsVaultOpen"
    | "setRecentNeedsVaultOpen"
    | "needsVaultReason"
    | "setNeedsVaultReason"
    | "ontologyInsight"
  >;
  acpRuntimeController: Pick<ReturnType<typeof useAcpRuntimeController>, "acpRuntime">;
  topologyAuthoring: Pick<
    ReturnType<typeof useTopologyAuthoring>,
    | "createNodeOpen"
    | "agentConnect"
    | "bootstrapPlan"
    | "setBootstrapOpen"
    | "canCreateNode"
    | "mapRevealToken"
    | "setHoverEdge"
    | "setSelectedEdge"
    | "handleHoverEdge"
    | "selectedEdge"
    | "mapRelationPreview"
    | "setMeaningEditorState"
    | "agentFocusNodeId"
    | "handleHoverCluster"
  >;
  topologySceneControls: Pick<
    ReturnType<typeof useTopologySceneControls>,
    | "topologyOverlayState"
    | "handleScaffoldStarter"
    | "starterScaffolding"
    | "emptyTopologyNodeCount"
    | "clearTopologyFilters"
    | "topologyRenderState"
    | "mapMountTaskReady"
    | "handleExpandRequest"
    | "handleMapFrameDrawn"
    | "handleTopologyGraphStatsChange"
    | "mapLensIds"
    | "mapLensKind"
    | "pathLensEdgeIds"
    | "pathExpandedParents"
    | "allExpandedParentIds"
    | "realmCaption"
    | "clusterBarLabels"
    | "domeTierLabels"
    | "drawerOpen"
    | "drawnConceptCount"
    | "totalConceptCount"
    | "indexDomainCount"
  >;
  topologyCanvasFocus: Pick<
    ReturnType<typeof useTopologyCanvasFocus>,
    | "handleCanvasPointerDownCapture"
    | "setFullDetailSlug"
    | "handleContextMenuNode"
    | "panelHoverNodeIdRef"
    | "nodePopoverDismissed"
  >;
  topologyExplorationLenses: Pick<ReturnType<typeof useTopologyExplorationLenses>, "constellationFitToken" | "routedConstellation" | "spotlightExpandedParents">;
  topologyIndexPresentation: Pick<ReturnType<typeof useTopologyIndexPresentation>, "startStepsVisible" | "renderedIndexState" | "dismissStartSteps" | "readoutStackRef">;
  topologyCreateIntent: Pick<
    ReturnType<typeof useTopologyCreateIntent>,
    | "topologyCreateNodeBlockingActive"
    | "openCreateNodeWithKind"
    | "openCreateNode"
    | "topologyBlockingOverlayActive"
    | "topologyShortcutHelpPhoneVisible"
  >;
}

export function TopologyCanvasSurface({
  localGraphRoot, acpRuntimeLabel, router, mapEntryTicket, expandAllActive, combinedFitToken,
  growthReplayToken, setGrowthReplaying, topologyRelayoutToken, setTopologyVisibleCount, setMapZoomTier,
  footprintVisitedIds, footprintLensActiveRef, footprintBrushNodeIdRef, ontologySearchOpen, setFitViewToken,
  setShortcutsOpen, analysisMode, growthReplaying, setGrowthReplayToken, renderProjects, leftPanelCollapsed,
  localGraphStack, setLocalGraphStack, heldLocalGraphStack, topologyVisibleCount, readoutStepsAside,
  mapZoomTier, unsupportedGuideOpen, setUnsupportedGuideOpen, requestVaultOpen, topologyCanvasFocus,
  topologySceneControls, topologyAuthoring, acpRuntimeController, topologyVaultReadModel,
  topologyAgentOrchestration, topologyPreferences, topologyGraphProjection, topologyAnalysisReview,
  topologyNavigationActions, topologyRouteControls, topologyKeyboardTour, topologyInspectorState,
  topologyCreateIntent, topologyIndexPresentation, topologyExplorationLenses
}: TopologyCanvasSurfaceProps) {
  const {
    topologyCreateNodeBlockingActive, openCreateNodeWithKind, openCreateNode, topologyBlockingOverlayActive,
    topologyShortcutHelpPhoneVisible
  } = topologyCreateIntent;
  const { startStepsVisible, renderedIndexState, dismissStartSteps, readoutStackRef } = topologyIndexPresentation;
  const { constellationFitToken, routedConstellation, spotlightExpandedParents } = topologyExplorationLenses;

  const { handleCanvasPointerDownCapture, setFullDetailSlug, handleContextMenuNode, panelHoverNodeIdRef, nodePopoverDismissed } = topologyCanvasFocus;
  const {
    topologyOverlayState, handleScaffoldStarter, starterScaffolding, emptyTopologyNodeCount,
    clearTopologyFilters, topologyRenderState, mapMountTaskReady, handleExpandRequest, handleMapFrameDrawn,
    handleTopologyGraphStatsChange, mapLensIds, mapLensKind, pathLensEdgeIds, pathExpandedParents,
    allExpandedParentIds, realmCaption, clusterBarLabels, domeTierLabels, drawerOpen, drawnConceptCount,
    totalConceptCount, indexDomainCount
  } = topologySceneControls;
  const {
    createNodeOpen, agentConnect, bootstrapPlan, setBootstrapOpen, canCreateNode, mapRevealToken,
    setHoverEdge, setSelectedEdge, handleHoverEdge, selectedEdge, mapRelationPreview, setMeaningEditorState,
    agentFocusNodeId, handleHoverCluster
  } = topologyAuthoring;
  const { acpRuntime } = acpRuntimeController;
  const {
    vault, deeplinkSourceReady, vaultIdentity, spotlightFitToken, selectedOntologyNode, changedSlugs,
    recentNeedsVaultOpen, setRecentNeedsVaultOpen, needsVaultReason, setNeedsVaultReason, ontologyInsight
  } = topologyVaultReadModel;
  const view3dOn = topologyPreferences.view3d;
  const mapEvidence = useMapEvidenceStates({ nodes: ontologyInsight?.nodes, enabled: view3dOn });
  const { analyzePrompt, agentChatUsesRuntime, sendAnalyzeToAgent } = topologyAgentOrchestration;
  const { t, tTopologyKeyboardWalk, galaxy, territories, hexBoard, reducedMotion, audiencePlain, glyphSet, canvasBackground, view3d, mapArrangement, footprint, expand } = topologyPreferences;
  const [hexFailed, setHexFailed] = useState(false);
  const mapView: MapSurfaceView = territories ? "territories" : hexBoard && !hexFailed ? "hex" : "map";
  const { leaving: leavingMapView } = useSurfaceSwap(mapView);
  const [mapViewSwapped, setMapViewSwapped] = useState(false);
  if (leavingMapView !== null && !mapViewSwapped) setMapViewSwapped(true);
  const mapViewFrames: MapSurfaceView[] = leavingMapView === null ? [mapView] : [leavingMapView, mapView];
  const { ontologyMapGraph, canvasSelectedSlug, resolvedRealmSlug, localGraphProjects, resolvedSelectionSlug } = topologyGraphProjection;
  const { mapRelationCaptions, mapReviewQuestionIds } = topologyAnalysisReview;
  const { handleClose, handleSelect } = topologyNavigationActions;
  const { expandedParentSet, handleToggleCluster, handleEnterRealm } = topologyRouteControls;
  const { tourAnchorNodeId, tourAnchorRef, openGuidedTour, tour } = topologyKeyboardTour;
  const { nodePanelMounted, selectedEdgeOwnsRightRail, selectedNodeFocusActive, topologyUtilityChromeCompact } = topologyInspectorState;

  return (<>
    <div
      data-testid="topology-map-surface"
      onPointerDownCapture={handleCanvasPointerDownCapture}
      data-blocking-edit={topologyCreateNodeBlockingActive ? "true" : "false"}
      data-map-demoted={topologyCreateNodeBlockingActive ? "true" : "false"}
      data-map-dim-opacity={topologyCreateNodeBlockingActive ? "0.24" : "1"}
      data-map-dim-opacity-token={
        topologyCreateNodeBlockingActive ? "--topology-blocking-map-opacity" : undefined
      }
      data-map-filter-token={
        topologyCreateNodeBlockingActive ? "--topology-blocking-map-filter" : undefined
      }
      data-map-interaction-contract={
        topologyCreateNodeBlockingActive ? "suppressed-while-blocking-composer" : "interactive"
      }
      aria-hidden={topologyCreateNodeBlockingActive ? "true" : undefined}
      style={{
        opacity: topologyCreateNodeBlockingActive ? "var(--topology-blocking-map-opacity)" : 1,
        filter: topologyCreateNodeBlockingActive ? "var(--topology-blocking-map-filter)" : undefined,
      }}
      className={`absolute inset-0 transition-[opacity,filter] duration-[var(--motion-base)] ease-[var(--motion-ease)] motion-reduce:transition-none ${topologyCreateNodeBlockingActive
        ? "pointer-events-none"
        : ""
        }`}
    >
      <>
        <div
          key={localGraphRoot ?? '__root__'}
          className="absolute inset-0 animate-[topologyFade_var(--motion-base)_var(--motion-ease)]"
        >
          {/* With 0-1 visible nodes a lone dot reads as broken; an empty vault never mounts the
             engine at all. */}
          {topologyOverlayState.kind === "structural-empty" && !createNodeOpen ? (
            // A writable vault gets the progressive start checklist; with documents present its
            // first step is bootstrap.
            // Hidden while a conversation is open, which already started; closing the panel brings
            // it back.
            startStepsVisible ? (
              <VaultStartSteps
                agentConnected={agentConnect.status.kind === "connected"}
                acpRuntimeLabel={acpRuntimeLabel}
                acpRuntimeIcon={acpRuntime?.icon ?? null}
                acpRuntimeInk={acpRuntime?.brandInk ?? null}
                onCreateNode={openCreateNodeWithKind}
                // The same starter as "start fresh in an empty folder"; not passed when documents
                // exist.
                onScaffoldStarter={
                  (vault.manifest?.docs.length ?? 0) === 0
                    ? handleScaffoldStarter
                    : null
                }
                scaffolding={starterScaffolding}
                // With documents present, they are the first step.
                docsFoundCount={bootstrapPlan?.elements.length ?? 0}
                sourceFileCount={vault.manifest?.sourceFileCount ?? 0}
                onStartFromDocs={
                  bootstrapPlan && bootstrapPlan.elements.length > 0
                    ? () => setBootstrapOpen(true)
                    : undefined
                }
                analyzePrompt={analyzePrompt}
                // Seats the instruction in the chat composer instead of making the user copy; a
                // person still sends it.
                onSendAnalyzeToAgent={
                  agentChatUsesRuntime ? sendAnalyzeToAgent : null
                }
                // INDEX floats over the map column instead of narrowing it, so the card needs its
                // width to centre.
                indexExpanded={renderedIndexState === "expanded"}
                onFinish={dismissStartSteps}
                // "Connect" lives at the agents destination, so it navigates there
                // (`docs/DECISIONS.md`, entry 90);
                // chat has its own doors.
                onOpenAgentConnect={() => router.push(DESTINATION_HREF.agents)}
              />
            ) : (
              <TopologyEmptyState
                conceptCount={emptyTopologyNodeCount}
                reason={topologyOverlayState.emptyReason}
                canCreateNode={canCreateNode}
                onCreateNode={openCreateNode}
                // Decided by capability, from the same source as `OpenVaultCta`: a web browser
                // with File System Access can pick a folder too.
                canPickFolder={vault.status !== 'unsupported'}
                docsFoundCount={bootstrapPlan?.elements.length ?? 0}
                onStartFromDocs={
                  bootstrapPlan && bootstrapPlan.elements.length > 0
                    ? () => setBootstrapOpen(true)
                    : undefined
                }
              />
            )
          ) : topologyOverlayState.kind === "filter-sparse" ? (
            <TopologyNoMatchesState
              onClearFilters={clearTopologyFilters}
              variant="sparse"
            />
          ) : null}
          {topologyRenderState.renderCanvas && mapMountTaskReady ? (
            <ErrorBoundary
              onError={() => cancelMapNavigation(mapEntryTicket)}
              fallback={({ error, reset }) => (
                <WidgetErrorFallback
                  error={error}
                  onReset={reset}
                  title={t('widgetError.mapTitle')}
                  body={t('widgetError.body')}
                  retryLabel={t('widgetError.retry')}
                  className="h-full w-full"
                />
              )}
            >
              {mapViewFrames.map((view) => {
                const frameLeaving = view === leavingMapView;
                return (
                  <div
                    key={view}
                    data-testid="topology-map-view"
                    data-map-view={view}
                    data-map-view-leaving={frameLeaving || undefined}
                    inert={frameLeaving || undefined}
                    aria-hidden={frameLeaving || undefined}
                    className={cn(
                      "absolute inset-0",
                      frameLeaving ? "map-overlay-out" : mapViewSwapped ? "map-overlay-in" : undefined,
                    )}
                  >
                    {view === "territories" ? (
                      <TopologyTerritoriesSurface
                        nodes={ontologyMapGraph.nodes}
                        edges={ontologyMapGraph.edges}
                        insightNodes={ontologyInsight?.nodes}
                        selectedId={canvasSelectedSlug}
                        onSelect={(slug) => {
                          setMeaningEditorState(null);
                          setSelectedEdge(null);
                          handleSelect(slug);
                        }}
                        onPaneClick={() => {
                          setMeaningEditorState(null);
                          setSelectedEdge(null);
                          handleClose();
                        }}
                        onDrawnCountChange={handleMapFrameDrawn}
                        reducedMotion={reducedMotion}
                        inspectorOpen={nodePanelMounted}
                        indexExpanded={renderedIndexState === "expanded"}
                      />
                    ) : view === "hex" ? (
                      <ErrorBoundary onError={() => setHexFailed(true)} fallback={() => null}>
                      <TopologyHexBoardSurface
                        nodes={ontologyMapGraph.nodes}
                        edges={ontologyMapGraph.edges}
                        insightNodes={ontologyInsight?.nodes}
                        vaultKey={vaultIdentity}
                        selectedId={canvasSelectedSlug}
                        onSelect={(slug) => {
                          setMeaningEditorState(null);
                          setSelectedEdge(null);
                          handleSelect(slug);
                        }}
                        onPaneClick={() => {
                          setMeaningEditorState(null);
                          setSelectedEdge(null);
                          handleClose();
                        }}
                        onDrawnCountChange={handleMapFrameDrawn}
                        reducedMotion={reducedMotion}
                      />
                      </ErrorBoundary>
                    ) : (
                    <OntologyMap
                      nodes={ontologyMapGraph.nodes}
                      edges={ontologyMapGraph.edges}
                      relationCaptions={mapRelationCaptions}
                      reviewQuestionIds={mapReviewQuestionIds}
                      walkNoticeLabel={tTopologyKeyboardWalk("deadEnd")}
                      focus={{ selectedSlug: canvasSelectedSlug }}
                      // The same vault identity signal as the deep-link cleanup, so a vault switch
                      // resets the camera.
                      // Gated on `deeplinkSourceReady`, or a live refresh's transient `sample:` identity
                      // jumps the camera on save.
                      dataSourceKey={deeplinkSourceReady ? vaultIdentity : null}
                      overviewFit={expandAllActive ? "full" : "spine"}
                      fitViewToken={combinedFitToken}
                      growthReplayToken={growthReplayToken}
                      onGrowthReplayingChange={setGrowthReplaying}
                      spotlightFitToken={spotlightFitToken + constellationFitToken}
                      constellationFocusId={routedConstellation?.id ?? null}
                      relayoutToken={topologyRelayoutToken}
                      revealToken={mapRevealToken}
                      onSelectEdge={(edge) => {
                        setFullDetailSlug(null);
                        setHoverEdge(null);
                        if (selectedOntologyNode) handleClose();
                        setSelectedEdge(edge);
                      }}
                      onHoverEdge={handleHoverEdge}
                      selectedEdge={selectedEdge ? { sourceId: selectedEdge.sourceId, targetId: selectedEdge.targetId, relationType: selectedEdge.relationType } : null}
                      previewEdge={mapRelationPreview}
                      onSelect={(slug) => {
                        setMeaningEditorState(null);
                        setSelectedEdge(null);
                        handleSelect(slug);
                      }}
                      onOpen={handleExpandRequest}
                      onPaneClick={() => {
                        setMeaningEditorState(null);
                        setSelectedEdge(null);
                        handleClose();
                      }}
                      onVisibleCountChange={setTopologyVisibleCount}
                      onDrawnCountChange={handleMapFrameDrawn}
                      onGraphStatsChange={handleTopologyGraphStatsChange}
                      onZoomTierChange={setMapZoomTier}
                      onContextMenuNode={handleContextMenuNode}
                      onContextMenuPane={canCreateNode ? () => openCreateNode() : undefined}
                      minimal={localGraphRoot !== null}
                      agentFocusNodeId={agentFocusNodeId}
                      spotlightIds={mapLensIds}
                      mapLensKind={mapLensKind}
                      pathEdgeIds={pathLensEdgeIds}
                      expandedParents={
                        pathExpandedParents ??
                        (expandAllActive ? allExpandedParentIds : null) ??
                        spotlightExpandedParents ??
                        expandedParentSet
                      }
                      onToggleCluster={handleToggleCluster}
                      onHoverCluster={handleHoverCluster}
                      clusterHint={galaxy ? undefined : t('cluster.hint')}
                      realmRootId={resolvedRealmSlug}
                      onEnterRealm={handleEnterRealm}
                      indexExpanded={renderedIndexState === "expanded"}
                      realmEnterLabel={t('realm.enterAction')}
                      realmEnterTooltip={t('realm.enterTooltip')}
                      realmCaption={realmCaption}
                      clusterBarLabels={clusterBarLabels}
                      domeTierLabels={domeTierLabels}
                      canvasLabel={t('canvas.ariaLabel')}
                      visitedTrail={footprintVisitedIds}
                      trailLensActiveRef={footprintLensActiveRef}
                      trailHoverNodeIdRef={footprintBrushNodeIdRef}
                      panelHoverNodeIdRef={panelHoverNodeIdRef}
                      tierReveal={audiencePlain ? PLAIN_TIER_REVEAL : undefined}
                      tourAnchorNodeId={tourAnchorNodeId}
                      tourAnchorRef={tourAnchorRef}
                      overlayOpen={!createNodeOpen && ontologySearchOpen}
                      glyphSet={glyphSet}
                      canvasBackground={canvasBackground}
                      view3d={view3d}
                      galaxy={galaxy}
                      mapArrangement={mapArrangement}
                      domeEvidence={mapEvidence.availability === "measured" ? mapEvidence.states : null}
                      domeLightLegend={
                        <TopologyLightLegend
                          evidence={mapEvidence}
                          nodeIds={ontologyMapGraph.nodes.map((node) => node.id)}
                          kindLabels={domeTierLabels}
                        />
                      }
                      detailPanelVisible={nodePanelMounted}
                      footprint={footprint}
                      expand={expand}
                    />
                    )}
                  </div>
                );
              })}
              {hexBoard && hexFailed ? (
                <p
                  role="status"
                  data-testid="hex-board-failed-note"
                  className="pointer-events-none absolute left-1/2 top-24 -translate-x-1/2 rounded-chip bg-[color:var(--chrome-surface)] px-3 py-1.5 text-label text-[color:var(--map-panel-text-secondary)]"
                >
                  {t("hexBoard.failed")}
                </p>
              ) : null}
            </ErrorBoundary>
          ) : null}
          {topologyRenderState.renderCanvas ? (
            <TopologyChangeAnnouncement
              touchedCount={changedSlugs.size}
              message={(count) => t('controls.changeAnnouncement', { count })}
            />
          ) : null}
        </div>
        <style jsx>{`
                @keyframes topologyFade {
                  from { opacity: 0.5; transform: scale(0.995); }
                  to { opacity: 1; transform: scale(1); }
                }
              `}</style>
        {/* Fixed square tiles whose tooltip carries the name. They step aside
           on `selectedEdgeOwnsRightRail`, like the other right-rail tiles, or they stay
           visible under the relation card and cannot be pressed. */}
        <div className="contents" data-testid="topology-utility-rail">
          {createNodeOpen ||
            topologyBlockingOverlayActive ||
            selectedEdgeOwnsRightRail ||
            (selectedNodeFocusActive && (!view3d || !nodePopoverDismissed)) ? null : (
            <TopologyFitControl
              mobileObscured={renderedIndexState === "expanded"}
              density={topologyUtilityChromeCompact ? "compact-focus" : "default"}
              onFitView={() => {
                if (view3d) handleClose();
                setFitViewToken((t) => t + 1);
              }}
            />
          )}
          {/* Directly above the "?" tile; the tour is `md`+ only. */}
          {createNodeOpen ||
            selectedEdgeOwnsRightRail ||
            topologyBlockingOverlayActive ||
            selectedNodeFocusActive ? null : (
            <Tooltip content={t('controls.tourTooltip')} side="left">
              <ChromeTile
                icon={<Compass />}
                title=""
                aria-label={t('controls.tourTooltip')}
                onClick={openGuidedTour}
                data-testid="topology-tour-button"
                data-agent-dock-adjacent-rail="true"
                data-map-fit-obstacle="right"
                className="topology-ui-scale pointer-events-auto absolute right-4 z-20 hidden md:right-[var(--chrome-inset)] md:top-[var(--topology-tour-help-desktop-top)] md:inline-flex"
              />
            </Tooltip>
          )}
          {/* Two slots below the fit tile; on phones only in overview and focus, clear of the
             path/health rail. */}
          {createNodeOpen ||
            selectedEdgeOwnsRightRail ||
            topologyBlockingOverlayActive ||
            selectedNodeFocusActive ? null : (
            <Tooltip content={t('controls.shortcutsTooltip')} side="left">
              <ChromeTile
                icon={<HelpCircle />}
                title=""
                aria-label={t('controls.shortcutsTooltip')}
                onClick={() => setShortcutsOpen(true)}
                data-testid="topology-shortcuts-help-button"
                data-agent-dock-adjacent-rail="true"
                data-map-fit-obstacle="right"
                data-controls-density={
                  topologyUtilityChromeCompact ? "compact-focus" : "default"
                }
                data-controls-contract={
                  topologyUtilityChromeCompact
                    ? "focus-support-help-entry"
                    : "map-help-entry"
                }
                data-phone-help-entry-contract={
                  topologyShortcutHelpPhoneVisible
                    ? "visible-outside-path-panel"
                    : analysisMode === "health"
                      ? "hidden-during-health-panel"
                      : "hidden-during-path-panel"
                }
                data-phone-help-position-contract={
                  topologyShortcutHelpPhoneVisible ? "map-card-clearance" : undefined
                }
                data-phone-help-top-token={
                  topologyShortcutHelpPhoneVisible
                    ? selectedNodeFocusActive
                      ? "--topology-shortcuts-help-focus-phone-top"
                      : "--topology-shortcuts-help-phone-top"
                    : undefined
                }
                className={`topology-ui-scale pointer-events-auto absolute right-4 ${selectedNodeFocusActive
                  ? "top-[var(--topology-shortcuts-help-focus-phone-top)]"
                  : "top-[var(--topology-shortcuts-help-phone-top)]"
                  } z-20 md:right-[var(--chrome-inset)] md:top-[var(--topology-shortcuts-help-desktop-top)] md:inline-flex ${
                  // Below `md` the expanded INDEX sheet is the primary surface, so the tile
                  // demotes.
                  topologyShortcutHelpPhoneVisible && renderedIndexState !== "expanded"
                    ? "inline-flex"
                    : "hidden"
                  }`}
              />
            </Tooltip>
          )}
          {/* Replays the ontology appearing in containment order
             (`ontology-map/model/growth-replay.ts`); desktop only. */}
          {createNodeOpen ||
            selectedEdgeOwnsRightRail ||
            topologyBlockingOverlayActive ||
            selectedNodeFocusActive ? null : (
            <div
              className="topology-ui-scale pointer-events-auto absolute right-4 z-20 hidden md:right-[var(--chrome-inset)] md:top-[var(--topology-growth-replay-desktop-top)] md:block"
              data-agent-dock-adjacent-rail="true"
              data-map-fit-obstacle="right"
            >
              {/* A toggle: one token bump starts the replay and the next stops it, and the
                 loop reports the live state back (`use-topology-loop.ts`). The indigo border
                 is the state; the glyph stays play. */}
              <Tooltip content={t('controls.replayGrowthTooltip')} side="left">
                <ChromeTile
                  icon={<Play />}
                  title=""
                  aria-label={t('controls.replayGrowthTooltip')}
                  data-testid="topology-replay-growth"
                  active={growthReplaying}
                  aria-pressed={growthReplaying}
                  onClick={() => setGrowthReplayToken((t) => t + 1)}
                />
              </Tooltip>
            </div>
          )}
        </div>
        <HubRail
          projects={renderProjects}
          selectedSlug={canvasSelectedSlug}
          onSelect={(slug) => handleSelect(slug)}
          // Suppressed while the hero panel is expanded.
          suppressed={!leftPanelCollapsed && !drawerOpen}
        />
        {/* It settles from the top centre, so it grows from its own top edge. */}
        <Surface
          open={localGraphStack.length > 0}
          origin="top center"
          className="pointer-events-auto absolute left-1/2 top-[96px] z-30 flex max-w-[70vw] -translate-x-1/2 items-center gap-2 rounded-full border border-[color:var(--color-indigo-line-a32)] bg-[color:var(--color-panel)] px-3 py-1.5 shadow-[var(--shadow-elevation-1)]"
        >
          <span className="font-mono text-label uppercase tracking-[var(--tracking-caps-16)] text-[color:var(--color-text-quaternary)]">
            Local
          </span>
          <button
            type="button"
            onClick={() => setLocalGraphStack([])}
            className={controlClass({
              shape: "link",
              size: "md",
              className:
                "touch-hit-expand font-mono uppercase tracking-[var(--tracking-caps-12)] hover:text-[color:var(--color-text-primary)]",
            })}
          >
            Root
          </button>
          {heldLocalGraphStack.map((slug, idx) => (
            <span key={slug} className="flex items-center gap-2">
              <span className="text-[color:var(--color-text-quaternary)]">▸</span>
              <button
                type="button"
                onClick={() =>
                  setLocalGraphStack((stack) => stack.slice(0, idx + 1))
                }
                className={controlClass({
                  shape: "link",
                  size: "lg",
                  truncate: true,
                  active: idx === heldLocalGraphStack.length - 1,
                  className: "touch-hit-expand hover:text-[color:var(--color-text-primary)]",
                })}
                title={slug}
              >
                {slug}
              </button>
            </span>
          ))}
          <button
            type="button"
            onClick={() => setLocalGraphStack((stack) => stack.slice(0, -1))}
            className={controlClass({
              shape: "pill",
              size: "sm",
              className:
                "ml-2 font-mono uppercase tracking-[var(--tracking-caps-14)] hover:bg-[color:var(--color-overlay-2)]",
            })}
          >
            Esc
          </button>
        </Surface>

        {/* Explains a local graph or category filter that reduced the visible nodes. */}
        {topologyVisibleCount !== null && topologyVisibleCount < localGraphProjects.length ? (
          <div data-toast-wall="bottom" className="pointer-events-none absolute bottom-6 left-[220px] z-10 rounded-chip border border-[color:var(--color-indigo-line-a32)] bg-[color:var(--color-panel)] px-3 py-1.5 font-mono text-label uppercase tracking-[var(--tracking-caps-14)] text-[color:var(--color-indigo-line-a90)] md:left-[228px] xl:left-[236px]">
            filter · {topologyVisibleCount} / {localGraphProjects.length}
          </div>
        ) : null}

        {topologyOverlayState.kind === "filter-empty" ? (
          <TopologyNoMatchesState onClearFilters={clearTopologyFilters} />
        ) : null}

        {/* The corner stack uses `--topology-relation-legend-inset` so its right edge lines up with
           the utility rail. */}
        {/* Ambient, so it steps aside while the datasheet or a right dock is open instead of
           sharing a baseline. */}
        <div
          ref={readoutStackRef}
          data-testid="topology-readout-stack"
          // A toast stands above this reading (`src/shared/ui/toast-walls.ts`).
          data-toast-wall="bottom"
          className={cn(
            "pointer-events-none absolute bottom-[var(--topology-relation-legend-bottom-inset)] right-[var(--topology-relation-legend-inset)] z-20 flex flex-col items-end gap-3 whitespace-nowrap transition-opacity duration-[var(--motion-base)] ease-[var(--motion-ease)] motion-reduce:transition-none",
            readoutStepsAside ? "opacity-0" : "opacity-100",
          )}
          aria-hidden={readoutStepsAside ? true : undefined}
        >
          <FirstRunReadout
            conceptCount={drawnConceptCount}
            totalConceptCount={totalConceptCount}
            domainCount={indexDomainCount}
            tier={mapZoomTier}
            // Plain mode never reaches the element tier, so it uses the plain wording.
            audiencePlain={audiencePlain}
          />
          {/* The frame meter joins the instrument stack instead of claiming a new corner. */}
          <FrameMeter />
        </div>

        {/* Pointer-transparent; the first selection that exists dismisses it for good
           (`features/first-run-starter`), so a ghost slug cannot
           (see `resolvedSelectionSlug`). */}
        <SampleNodeHint hasSelection={resolvedSelectionSlug !== null} hidden={tour.open} />

        {/* Only on an unsupported browser, so the direct tile-to-picker path is unchanged
           elsewhere. */}
        <VaultOpenGuideSheet
          open={unsupportedGuideOpen}
          unsupported
          onClose={() => setUnsupportedGuideOpen(false)}
        />

        {/* Reuses `requestVaultOpen`, so the unsupported-browser branch exists once. */}
        <RecentChangesNeedsVaultDialog
          open={recentNeedsVaultOpen}
          onClose={() => setRecentNeedsVaultOpen(false)}
          onOpenVault={requestVaultOpen}
        />

        {/* A sample edit needs a different sentence from "these dates are not yours". */}
        <RecentChangesNeedsVaultDialog
          open={needsVaultReason !== null}
          copyKey={needsVaultReason ?? "createNeedsVault"}
          onClose={() => setNeedsVaultReason(null)}
          onOpenVault={requestVaultOpen}
        />

      </>
    </div>
  </>);
}
