"use client";

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

import type { MapLayoutView } from "@/shared/lib/map-layout-morph-store";
import { cancelMapNavigation } from "@/shared/lib/map-navigation-pending";
import { WidgetErrorFallback } from "@/shared/ui";
import { ErrorBoundary } from "@/shared/ui/error-boundary";
import {
  MapLayoutMorphOverlay,
  OntologyMap,
  PLAIN_TIER_REVEAL,
  capabilityTierRead,
  conceptDegrees,
  containmentParents,
  predictMapLayoutTarget,
  type FlatDialState,
} from "@/widgets/ontology-map";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useVaultLoadProgress } from "@/entities/vault-session";
import { useFlatRingMemory } from "../model/use-flat-ring-memory";
import { readHexRelief } from "@/shared/lib/appearance-preferences";
import { readHexPlacement } from "../model/hex-board-placement-store";
import { useMapEvidenceStates } from "../model/use-map-evidence-states";
import { useMapLayoutMorph } from "../model/use-map-layout-morph";
import { TopologyHexBoardSurface } from "./TopologyHexBoardSurface";
import { DomainStructureMap } from "@/widgets/ontology-map";
import { TopologyLightLegend } from "./TopologyLightLegend";
import { TopologyTerritoriesSurface, useTerritoryDomainStats } from "./TopologyTerritoriesSurface";

export interface TopologyMapRendererProps {
  onFlatDialShown?: (state: FlatDialState | null) => void;
  localGraphRoot: string | null;
  mapEntryTicket: number | null;
  expandAllActive: boolean;
  mapAssemblesOnOpen: boolean;
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
  topologyInspectorState: Pick<ReturnType<typeof useTopologyInspectorState>, "nodePanelMounted">;
  topologyKeyboardTour: Pick<ReturnType<typeof useTopologyKeyboardTour>, "tourAnchorNodeId" | "tourAnchorRef">;
  topologyRouteControls: Pick<ReturnType<typeof useTopologyRouteControls>, "expandedParentSet" | "handleToggleCluster" | "handleEnterRealm">;
  topologyNavigationActions: Pick<ReturnType<typeof useTopologyNavigationActions>, "handleClose" | "handleSelect">;
  topologyAnalysisReview: Pick<ReturnType<typeof useTopologyAnalysisReview>, "mapRelationCaptions" | "mapReviewQuestionIds">;
  topologyGraphProjection: Pick<ReturnType<typeof useTopologyGraphProjection>, "ontologyMapGraph" | "canvasSelectedSlug" | "resolvedRealmSlug" | "synthEvidence">;
  topologyPreferences: Pick<
    ReturnType<typeof useTopologyPreferences>,
    | "t"
    | "tTopologyKeyboardWalk"
    | "structure"
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
    | "navigationSpeed"
  >;
  topologyVaultReadModel: Pick<
    ReturnType<typeof useTopologyVaultReadModel>,
    "deeplinkSourceReady" | "vaultIdentity" | "spotlightFitToken" | "selectedOntologyNode" | "ontologyInsight" | "vault"
  >;
  topologyAuthoring: Pick<
    ReturnType<typeof useTopologyAuthoring>,
    | "createNodeOpen"
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
    | "dialLabels"
  >;
  topologyCanvasFocus: Pick<ReturnType<typeof useTopologyCanvasFocus>, "setFullDetailSlug" | "handleContextMenuNode" | "panelHoverNodeIdRef">;
  topologyExplorationLenses: Pick<ReturnType<typeof useTopologyExplorationLenses>, "constellationFitToken" | "routedConstellation" | "spotlightExpandedParents">;
  topologyIndexPresentation: Pick<ReturnType<typeof useTopologyIndexPresentation>, "renderedIndexState">;
  topologyCreateIntent: Pick<ReturnType<typeof useTopologyCreateIntent>, "openCreateNode">;
  impactLensActive: boolean;
}

export function TopologyMapRenderer({
  localGraphRoot, mapEntryTicket, expandAllActive, mapAssemblesOnOpen, combinedFitToken, growthReplayToken, setGrowthReplaying,
  topologyRelayoutToken, setTopologyVisibleCount, setMapZoomTier, footprintVisitedIds, footprintLensActiveRef,
  footprintBrushNodeIdRef, ontologySearchOpen, topologyInspectorState, topologyKeyboardTour, topologyRouteControls,
  topologyNavigationActions, topologyAnalysisReview, topologyGraphProjection, topologyPreferences,
  topologyVaultReadModel, topologyAuthoring, topologySceneControls, topologyCanvasFocus, topologyExplorationLenses,
  topologyIndexPresentation, topologyCreateIntent, onFlatDialShown, impactLensActive,
}: TopologyMapRendererProps) {
  const { t, tTopologyKeyboardWalk, structure, territories, hexBoard, reducedMotion, audiencePlain, glyphSet, canvasBackground, view3d, mapArrangement, footprint, expand, navigationSpeed } = topologyPreferences;
  const { ontologyMapGraph, canvasSelectedSlug, resolvedRealmSlug } = topologyGraphProjection;
  const { deeplinkSourceReady, vaultIdentity, spotlightFitToken, selectedOntologyNode, ontologyInsight, vault } = topologyVaultReadModel;
  const arrivingDocuments = vault.partialTotal;
  const arriving = arrivingDocuments > 0;
  const loadProgress = useVaultLoadProgress();
  const placingTierRead = useMemo(
    () => arriving && capabilityTierRead((ontologyInsight?.nodes ?? []).flatMap((node) => node.evidenceIds)),
    [arriving, ontologyInsight],
  );
  const {
    createNodeOpen, canCreateNode, mapRevealToken, setHoverEdge, setSelectedEdge, handleHoverEdge, selectedEdge,
    mapRelationPreview, setMeaningEditorState, agentFocusNodeId, handleHoverCluster,
  } = topologyAuthoring;
  const {
    handleExpandRequest, handleMapFrameDrawn, handleTopologyGraphStatsChange, mapLensIds, mapLensKind,
    pathLensEdgeIds, pathExpandedParents, allExpandedParentIds, realmCaption, clusterBarLabels, domeTierLabels, dialLabels,
  } = topologySceneControls;
  const { setFullDetailSlug, handleContextMenuNode, panelHoverNodeIdRef } = topologyCanvasFocus;
  const { constellationFitToken, routedConstellation, spotlightExpandedParents } = topologyExplorationLenses;
  const { renderedIndexState } = topologyIndexPresentation;
  const { openCreateNode } = topologyCreateIntent;
  const { mapRelationCaptions, mapReviewQuestionIds } = topologyAnalysisReview;
  const { handleClose, handleSelect } = topologyNavigationActions;
  const { expandedParentSet, handleToggleCluster, handleEnterRealm } = topologyRouteControls;
  const { tourAnchorNodeId, tourAnchorRef } = topologyKeyboardTour;
  const { nodePanelMounted } = topologyInspectorState;
  const measuredMapEvidence = useMapEvidenceStates({ nodes: ontologyInsight?.nodes, enabled: !structure && !hexBoard });
  const mapEvidence = topologyGraphProjection.synthEvidence ?? measuredMapEvidence;
  const missingStructureDocuments = useMemo(() => new Set(ontologyInsight?.nodes.filter(node => node.hasOwnDocument === false).map(node => node.id)), [ontologyInsight]);
  const evidenceStates = mapEvidence.availability === "measured" ? mapEvidence.states : null;
  const [flatDial, setFlatDial] = useState<FlatDialState>({ drawn: false, evidenceMeasured: false });
  const onFlatDialChange = useCallback((state: FlatDialState) => {
    setFlatDial(state);
  }, []);
  const [hiddenDependencyCount, setHiddenDependencyCount] = useState(0);
  const territoryStats = useTerritoryDomainStats();
  const [hexFailed, setHexFailed] = useState(false);
  const layoutView: MapLayoutView = territories ? "territories" : hexBoard && !hexFailed ? "hex" : view3d ? mapArrangement : structure ? "structure" : "flat";
  const expandedParents =
    pathExpandedParents ?? (expandAllActive ? allExpandedParentIds : null) ?? spotlightExpandedParents ?? expandedParentSet;
  const overviewFit = expandAllActive ? "full" : "spine";
  const frameRef = useRef<HTMLDivElement | null>(null);
  const { nodes, edges } = ontologyMapGraph;
  const flatRingMemory = useFlatRingMemory(vaultIdentity);
  const morph = useMapLayoutMorph({
    view: layoutView,
    reducedMotion,
    conceptCount: nodes.length,
    vaultKey: vaultIdentity,
    parentOf: () => containmentParents(nodes, edges),
    anchorId: canvasSelectedSlug ?? null,
    degreeOf: () => conceptDegrees(edges),
    targetFor: (to) => (host) =>
      predictMapLayoutTarget(
        to,
        { nodes, edges, territoryStats, hexPlacement: readHexPlacement(vaultIdentity), hexRelief: readHexRelief(), expandStructure: expand.structure, overviewFit, expandedParents, dialLabels, dialMemory: flatRingMemory.current() },
        host,
      ),
    frameRef,
  });
  const { onIncomingDrawn } = morph;
  const flatDialShown = morph.surface === "map" && flatDial.drawn ? flatDial : null;
  useEffect(() => {
    onFlatDialShown?.(flatDialShown);
  }, [flatDialShown, onFlatDialShown]);
  const onDrawnCountChange = useCallback(
    (drawn: number) => {
      handleMapFrameDrawn(drawn);
      if (drawn > 0) onIncomingDrawn();
    },
    [handleMapFrameDrawn, onIncomingDrawn],
  );
  const select = (slug: string) => {
    setMeaningEditorState(null);
    setSelectedEdge(null);
    handleSelect(slug);
  };
  const clear = () => {
    setMeaningEditorState(null);
    setSelectedEdge(null);
    handleClose();
  };

  return (
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
      {morph.surface ? (
        <div key={morph.surface} ref={frameRef} data-testid="topology-map-view" data-map-view={morph.surface} className="absolute inset-0">
          {morph.surface === "territories" ? (
            <TopologyTerritoriesSurface
              nodes={nodes}
              edges={edges}
              insightNodes={ontologyInsight?.nodes}
              selectedId={canvasSelectedSlug}
              onSelect={select}
              onPaneClick={clear}
              onDrawnCountChange={onDrawnCountChange}
              reducedMotion={reducedMotion}
              inspectorOpen={nodePanelMounted}
              indexExpanded={renderedIndexState === "expanded"}
              arrivedByMorph={morph.arrivedByMorph}
              navigationSpeed={navigationSpeed}
            />
          ) : morph.surface === "hex" ? (
            <ErrorBoundary onError={() => setHexFailed(true)} fallback={() => null}>
            <TopologyHexBoardSurface
              nodes={nodes}
              edges={edges}
              insightNodes={ontologyInsight?.nodes}
              vaultKey={vaultIdentity}
              selectedId={canvasSelectedSlug}
              onSelect={select}
              onPaneClick={clear}
              onDrawnCountChange={onDrawnCountChange}
              reducedMotion={reducedMotion}
              arrivedByMorph={morph.arrivedByMorph}
              synthEvidence={topologyGraphProjection.synthEvidence}
              navigationSpeed={navigationSpeed}
            />
            </ErrorBoundary>
          ) : morph.surface === "structure" ? (
            <DomainStructureMap
              key={vaultIdentity}
              nodes={nodes}
              edges={edges}
              selectedId={canvasSelectedSlug}
              onRead={select}
              missingIds={missingStructureDocuments}
              onReady={onIncomingDrawn}
              onDrawnCountChange={onDrawnCountChange}
              reducedMotion={reducedMotion}
              inspectorOpen={nodePanelMounted}
              indexExpanded={renderedIndexState === "expanded"}
              loading={arriving}
            />
          ) : (
          <OntologyMap
            nodes={nodes}
            edges={edges}
            flatRingMemory={flatRingMemory}
            dialLabels={dialLabels}
            evidenceStates={evidenceStates}
            impactLens={impactLensActive}
            onFlatDialChange={onFlatDialChange}
            loadProgress={arriving ? loadProgress : null}
            placingTierRead={placingTierRead}
            relationCaptions={mapRelationCaptions}
            reviewQuestionIds={mapReviewQuestionIds}
            walkNoticeLabel={tTopologyKeyboardWalk("deadEnd")}
            focus={{ selectedSlug: canvasSelectedSlug }}
            dataSourceKey={deeplinkSourceReady || arriving ? vaultIdentity : null}
            assembleOnOpen={mapAssemblesOnOpen && !morph.arrivedByMorph}
            arrivingDocuments={arrivingDocuments}
            overviewFit={overviewFit}
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
            onSelect={select}
            onOpen={handleExpandRequest}
            onPaneClick={clear}
            onVisibleCountChange={setTopologyVisibleCount}
            onDrawnCountChange={onDrawnCountChange}
            onGraphStatsChange={handleTopologyGraphStatsChange}
            onZoomTierChange={setMapZoomTier}
            onContextMenuNode={handleContextMenuNode}
            onContextMenuPane={canCreateNode ? () => openCreateNode() : undefined}
            minimal={localGraphRoot !== null}
            agentFocusNodeId={agentFocusNodeId}
            spotlightIds={mapLensIds}
            mapLensKind={mapLensKind}
            pathEdgeIds={pathLensEdgeIds}
            expandedParents={expandedParents}
            onToggleCluster={handleToggleCluster}
            onHoverCluster={handleHoverCluster}
            clusterHint={t('cluster.hint')}
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
            mapArrangement={mapArrangement}
            domeEvidence={evidenceStates}
            onHiddenDependenciesChange={setHiddenDependencyCount}
            domeLightLegend={
              <TopologyLightLegend
                evidence={mapEvidence}
                nodeIds={nodes.map((node) => node.id)}
                kindLabels={domeTierLabels}
                hiddenDependencies={hiddenDependencyCount}
              />
            }
            detailPanelVisible={nodePanelMounted}
            footprint={footprint}
            expand={expand}
            navigationSpeed={navigationSpeed}
          />
          )}
        </div>
      ) : null}
      {morph.overlay ? (
        <MapLayoutMorphOverlay
          key={morph.overlay.id}
          job={morph.overlay.job}
          holding={morph.overlay.holding}
          onTravelEnd={morph.overlay.onTravelEnd}
          onDone={morph.overlay.onDone}
        />
      ) : null}
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
  );
}
