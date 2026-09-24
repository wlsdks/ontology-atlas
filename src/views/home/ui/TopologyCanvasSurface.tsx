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
import { ChromeTile, Surface, Tooltip, WidgetErrorFallback, controlClass } from "@/shared/ui";
import { ErrorBoundary } from "@/shared/ui/error-boundary";
import { FrameMeter } from "@/shared/ui/frame-meter";
import { OntologyMap, PLAIN_TIER_REVEAL } from "@/widgets/ontology-map";
import { Compass, HelpCircle, Play } from "lucide-react";
import dynamic from "next/dynamic";
import { TopologyChangeAnnouncement } from "./TopologyChangeAnnouncement";
import { TopologyNoMatchesState } from "./TopologyNoMatchesState";
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
  const { analyzePrompt, agentChatUsesRuntime, sendAnalyzeToAgent } = topologyAgentOrchestration;
  const { t, tTopologyKeyboardWalk, galaxy, territories, hexBoard, reducedMotion, audiencePlain, glyphSet, canvasBackground, view3d, mapArrangement, footprint, expand } = topologyPreferences;
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
          {/* Empty-state overlay when the visible graph has 0–1 nodes: a lone dot
                    otherwise reads as a broken canvas. An empty vault never mounts the
                    engine at all and shows only the empty state, which prevents the
                    regression where a map shape flashed first. */}
          {topologyOverlayState.kind === "structural-empty" && !createNodeOpen ? (
            /*
             * Onboarding round, 2026-07-24: someone who opened a writable local
             * vault gets a progressive start checklist instead of a dead-end
             * sentence.
             *
             * ⚠️ **The gate was widened 2026-08-03** (five PO seats plus four
             * design seats). The condition used to include
             * `&& (bootstrapPlan?.elements.length ?? 0) === 0`, so **only a truly
             * empty folder** ever saw the checklist. That one clause shut the door
             * to connecting an agent and copying the instruction for it for anyone
             * whose folder had even one document — that is, **anyone who opened a
             * development repository**, exactly the person this flow exists for.
             * `TopologyEmptyState`'s docs-found branch offers only "build a map from
             * my documents" and says nothing about agents at all.
             *
             * So the decision narrowed to one question, "is this a writable vault",
             * and when documents exist **the checklist's first step becomes
             * bootstrap** (`docsFoundCount` below). Nothing new was built; an
             * existing screen simply became reachable, with no popup added.
             */
            /*
             * ⚠️ Not while a conversation is open (measured in the installed app,
             * 2026-08-25). Pressing 「make a map from my code」 opens the agent panel and
             * sends the first turn — and this checklist stayed on the map beside it, still
             * offering 「connect an AI agent · 1/3」 to somebody already mid-conversation
             * with one. Two surfaces claiming the same next step, one of them stale.
             *
             * It is guidance for a person who has not started. Someone talking to an agent
             * has started. Dismissal is untouched: closing the panel brings it back.
             */
            startStepsVisible ? (
              <VaultStartSteps
                agentConnected={agentConnect.status.kind === "connected"}
                acpRuntimeLabel={acpRuntimeLabel}
                acpRuntimeIcon={acpRuntime?.icon ?? null}
                acpRuntimeInk={acpRuntime?.brandInk ?? null}
                onCreateNode={openCreateNodeWithKind}
                // Someone who opened an empty folder through "choose an existing
                // folder" gets the same starter as "start fresh in an empty folder",
                // as a button. Not passed when documents already exist.
                onScaffoldStarter={
                  (vault.manifest?.docs.length ?? 0) === 0
                    ? handleScaffoldStarter
                    : null
                }
                scaffolding={starterScaffolding}
                /*
                 * With documents in the folder, they are the first step. Connecting
                 * an agent is first in the empty-folder ordering; for someone who
                 * already has something, the first step is that something.
                 */
                docsFoundCount={bootstrapPlan?.elements.length ?? 0}
                sourceFileCount={vault.manifest?.sourceFileCount ?? 0}
                onStartFromDocs={
                  bootstrapPlan && bootstrapPlan.elements.length > 0
                    ? () => setBootstrapOpen(true)
                    : undefined
                }
                analyzePrompt={analyzePrompt}
                /*
                 * When there is somewhere **inside this app** to paste it, do not
                 * make the user copy. Owner, 2026-08-16: *"I don't even know what the second one is."*
                 * (I have no idea what the second one even is). The instruction is
                 * seated in the chat composer; a person still sends it.
                 */
                onSendAnalyzeToAgent={
                  agentChatUsesRuntime ? sendAnalyzeToAgent : null
                }
                // Owner report, 2026-08-16: the card appeared to overlap INDEX's
                // right edge. INDEX floats **over** the map column rather than
                // narrowing it (the right-hand agent panel is a flex sibling and
                // genuinely does narrow it), so it alone is missing from the card's
                // centring calculation. This tells the card its width.
                indexExpanded={renderedIndexState === "expanded"}
                onFinish={dismissStartSteps}
                /*
                 * This step is named **connect**, and connecting lives at the agents
                 * destination — where you see what was detected and choose what to
                 * use (owner remark, 2026-08-16).
                 *
                 * ⚠️ It used to open the **chat** when something was detected, so a
                 * button labelled "connect" did something other than its name. The
                 * doors to chat are separate (the utility lane's agent chip, and the
                 * next step's "ask the agent"). Since 2026-08-21 the runtime list
                 * moved out to the agents destination (`docs/DECISIONS.md`, entry
                 * 90), so signalling "open the sheet" would now do nothing at all —
                 * there is no sheet. It navigates instead.
                 */
                onOpenAgentConnect={() => router.push(DESTINATION_HREF.agents)}
              />
            ) : (
              <TopologyEmptyState
                conceptCount={emptyTopologyNodeCount}
                reason={topologyOverlayState.emptyReason}
                canCreateNode={canCreateNode}
                onCreateNode={openCreateNode}
                // Decided by capability, from the same single source as
                // `OpenVaultCta`. The widget used to ask
                // `isTauriVaultRuntime() || vault is open` itself and answered "install
                // the app" to a **web visitor whose browser supports the File System
                // Access API** (council measurement, 2026-08-08).
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
            // `ontology-map` (`docs/ONTOLOGY-MAP-DESIGN.md`) unifies the map tab,
            // the graph tab, and the project-detail neighbour map into one engine;
            // this call site is wired once for all three. `nodes`/`edges` come from
            // `ontologyMapGraph` (`map-adapter.ts`), derived from
            // `ontologyInsight`. The older engine branches this ternary used to
            // hold were deleted outright once v2 became the default — owner
            // directive: *"Delete all the old canvas code."* (delete all the old
            // canvas code).
            // One dead widget must not take the page with it. A canvas throw — a lost
            // WebGL/2D context, a graph shape the renderer cannot lay out — used to blank
            // the whole route; now the rail, the panels and the chrome stay usable and the
            // map alone offers a retry.
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
              {territories ? (
                /* Territories (owner decision, 2026-09-24): the flat plane with nothing
                   folded. It shares the selection contract — a click selects through the
                   same handler, so the same inspector opens — and owns its own canvas. */
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
                />
              ) : hexBoard ? (
                /* Hex board (owner decision, 2026-09-25): one tile per capability. The same
                   selection contract as Territories — a click selects, the inspector opens. */
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
              ) : (
              <OntologyMap
                nodes={ontologyMapGraph.nodes}
                edges={ontologyMapGraph.edges}
                relationCaptions={mapRelationCaptions}
                reviewQuestionIds={mapReviewQuestionIds}
                /* Say so when an arrow key has nowhere to walk (owner, 2026-08-10).
                                                   With no response at all the user cannot tell "broken" from "nothing
                                                   that way". The wording and the surface belong to the page; the
                                                   widget only emits the event, because it is tested with no provider
                                                   around it. */
                walkNoticeLabel={tTopologyKeyboardWalk("deadEnd")}
                focus={{ selectedSlug: canvasSelectedSlug }}
                /* Closes the defect where switching vaults mid-session (sample →
                                                   local) drew the new graph with the previous graph's camera. The
                                                   single source is `useVaultSessionIdentityScope()` above — the **same
                                                   signal** the deep-link cleanup uses, because "which vault am I
                                                   looking at" must not be answered differently per surface.
                                                   `deeplinkSourceReady` wraps it for the same reason as its neighbour
                                                   (see "a scope before it settles is not a scope"): a live refresh
                                                   returns status to `'loading'`, and the identity computed then is
                                                   `sample:…`. Passing that straight down makes the camera jump every
                                                   time one file is saved into the vault (measured dy −10.66). */
                dataSourceKey={deeplinkSourceReady ? vaultIdentity : null}
                /*
                                                 * "Full" only under expand-all. `expandedParentSet` is not a
                                                 * person's choice alone: selecting any node opens its parents
                                                 * (`open=project:…`) and that survives closing the panel, so
                                                 * keying on it made every fit after a first click a full-bounds
                                                 * fit (measured 2026-09-03: fit x 41 against the return's -45).
                                                 */
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
                  setHoverEdge(null); // The popover demotes the hover micro-card.
                  // Fixes edge clicks being swallowed while a node had focus, because
                  // the edge panel is gated on `!selectedOntologyNode`. Selecting an
                  // edge (pair focus) is by definition a **replacement** for a node's
                  // ego focus — two transient surfaces may not coexist — so, mirroring
                  // `onSelect` clearing `selectedEdge`, the node focus is released
                  // here to open that gate. The camera path is the same as
                  // overview → edge.
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
                /*
                                                 * Right-clicking empty canvas means "create a concept here" and takes
                                                 * the place of the chrome pill removed from the top. Wired only for a
                                                 * writable vault: a menu on a vault that cannot be written to is a
                                                 * dead door.
                                                 */
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
                // Galaxy exposes every real concept directly, so the Flat
                // density-gate hint would announce controls that do not exist.
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
                // Plain mode pushes the element tier into an unreachable band so it
                // stays hidden; the ego exception still applies.
                tierReveal={audiencePlain ? PLAIN_TIER_REVEAL : undefined}
                // Projection for the guided tour's canvas-node anchors.
                tourAnchorNodeId={tourAnchorNodeId}
                tourAnchorRef={tourAnchorRef}
                // While the global search palette is genuinely open (the same
                // condition as `MountedGlobalSearch`'s `open` prop), the canvas leaves
                // the accessibility tree via aria-hidden + inert.
                overlayOpen={!createNodeOpen && ontologySearchOpen}
                // Appearance preferences from the settings sheet. The DOM glyphs read
                // the same store themselves and swap in lockstep.
                glyphSet={glyphSet}
                canvasBackground={canvasBackground}
                view3d={view3d}
                galaxy={galaxy}
                mapArrangement={mapArrangement}
                // The "the viewport changed" event for the 3D selection reframe: true
                // while the detail panel actually covers the screen, false once its
                // exit animation ends. On each flip the dome reframes smoothly against
                // the visible area; 2D ignores it (see `use-topology-loop`).
                detailPanelVisible={nodePanelMounted}
                footprint={footprint}
                expand={expand}
              />
              )}
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
        {/* The four utilities stay fixed square controls. Their shared tooltip
                  carries the full name on pointer hover and keyboard focus without
                  changing the rail's width or taking canvas drag space.

                  They step aside on `selectedEdgeOwnsRightRail`, the state the relation
                  card itself opens under. They used to read `selectedRelationActive`,
                  which nothing ever sets to `true`, so with a relation card up all four
                  kept drawing under it: measured at 1512x982 with the card at
                  [1180, 32, 300, 335], `elementFromPoint` returned the card at the
                  centre of 4 of 4 tiles while each one still had opacity 1 and
                  `pointer-events: auto`. A tile a person can see and cannot press is
                  worse than one that stepped aside, which is what the neighbouring
                  right-rail tiles already do (`inspectorOwnsRightRail`). */}
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
          {/* Guided tour entry point: the sibling directly above the "?" tile, same
                  chrome-tile token family. It does not copy the "?" tile's phone
                  visibility branch — the tour is `md`+ only by design
                  (`hidden md:flex`). */}
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
                className="topology-ui-scale pointer-events-auto absolute right-4 z-20 hidden md:right-6 md:top-[var(--topology-tour-help-desktop-top)] md:inline-flex xl:right-8"
              />
            </Tooltip>
          )}
          {/* Shortcut and gesture help entry point: two slots below the fit tile, after
                  the tour tile. On phones it appears only in overview and focus, where it
                  cannot collide with the primary read rail (path/health). */}
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
                  } z-20 md:right-6 md:top-[var(--topology-shortcuts-help-desktop-top)] md:inline-flex xl:right-8 ${
                  // Below `md`, while the expanded INDEX is a full-bleed sheet, the "?"
                  // tile floated on top of it and overlapped (measured at 600×900,
                  // y188). The sheet is the primary surface, so the chrome demotes. At
                  // `md`+ the `md:inline-flex` keeps it.
                  topologyShortcutHelpPhoneVisible && renderedIndexState !== "expanded"
                    ? "inline-flex"
                    : "hidden"
                  }`}
              />
            </Tooltip>
          )}
          {/* Growth replay (2026-09-02): the fourth slot of the right rail rhythm, one row
                  below the "?" tile. Replays the ontology appearing in containment order
                  (`ontology-map/model/growth-replay.ts`); desktop only like the tour. A
                  `ChromeTile`, not a hand-written button — the control ratchet only falls. */}
          {createNodeOpen ||
            selectedEdgeOwnsRightRail ||
            topologyBlockingOverlayActive ||
            selectedNodeFocusActive ? null : (
            <div
              className="topology-ui-scale pointer-events-auto absolute right-4 z-20 hidden md:right-6 md:top-[var(--topology-growth-replay-desktop-top)] md:block xl:right-8"
              data-agent-dock-adjacent-rail="true"
            >
              {/* A toggle, not a hold. One bump of the token starts the replay and
                      the next stops it; the loop reports the live state back, so the
                      active border and `aria-pressed` also fall away when the replay
                      simply reaches its end. Exits and the reason movement no longer
                      counts as one: `use-topology-loop.ts`, the token effect.
                      The icon stays the play glyph while it runs; the indigo active
                      border is the state, the same one every other chrome toggle wears. */}
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
        {/* The settings gear moved to the bottom of the left nav rail. */}
        <HubRail
          projects={renderProjects}
          selectedSlug={canvasSelectedSlug}
          onSelect={(slug) => handleSelect(slug)}
          // Prevents overlap while the hero panel is expanded; with the hero
          // collapsed to a pill, or in the drawer state, the hub rail shows
          // normally.
          suppressed={!leftPanelCollapsed && !drawerOpen}
        />
        {/* The breadcrumb settles down from the top centre of the map, so its
                  entrance origin is its own top edge. */}
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

        {/* Filter context: shown when fewer nodes are visible than exist, so the
                  local graph or a category filter having reduced them is explained. */}
        {topologyVisibleCount !== null && topologyVisibleCount < localGraphProjects.length ? (
          <div data-toast-wall="bottom" className="pointer-events-none absolute bottom-6 left-[220px] z-10 rounded-chip border border-[color:var(--color-indigo-line-a32)] bg-[color:var(--color-panel)] px-3 py-1.5 font-mono text-label uppercase tracking-[var(--tracking-caps-14)] text-[color:var(--color-indigo-line-a90)] md:left-[228px] xl:left-[236px]">
            filter · {topologyVisibleCount} / {localGraphProjects.length}
          </div>
        ) : null}

        {/* Zero-match empty state. */}
        {topologyOverlayState.kind === "filter-empty" ? (
          <TopologyNoMatchesState onClearFilters={clearTopologyFilters} />
        ) : null}

        {/* Bottom-right instrument stack — root-first-open v3 reading (FirstRunReadout).
                  The corner inset connects to the existing
                  `--topology-relation-legend-inset` token (base 24px, ≥1920 32px) — when the rest of the chrome grows by 1.15 at ≥1920, this stack moves further from the corner
                  so it does not collide with map labels. */}
        {/* Inspection round 1 defect 2 (2026-07-23) — when the right datasheet opened, this
                  corner reading appeared fragmented behind and to the left of the panel
                  (reproduced across all 4 locales × resolutions). Since it is ambient info and unnecessary during investigation,
                  it quietly disappears while the panel is open.

                  The same rule covers the right dock (measured 2026-09-07 at 1512 with the
                  meaning workbench open): the map keeps 1246px, the sample hint sits centred
                  in it, and this row's zoom hint ran 22px under the hint's right edge. A
                  person with a dock open is reviewing, not orienting, so the reading steps
                  aside exactly as it does for the datasheet rather than the two chrome pieces
                  sharing one baseline. */}
        <div
          ref={readoutStackRef}
          data-testid="topology-readout-stack"
          // A toast stands above this reading, not on it (`src/shared/ui/toast-walls.ts`).
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
            // Plain mode can never reach the element tier (`PLAIN_TIER_REVEAL`), so
            // the tier-based hint-drop logic always stated something false there.
            // It uses the plain wording instead.
            audiencePlain={audiencePlain}
          />
          {/* Frame meter: off by default, switched on in settings. It joins the
                    stack where instrument readouts **already live** as its last line
                    rather than claiming a new corner — putting readings of the same kind
                    somewhere else makes the eye sweep twice, which is the "new chrome that
                    makes no task clearer" this repo guards against. */}
          {/* The activity row does not live here (moved by owner instruction,
                    2026-08-17).

                    **What changed about the old reasoning.** The measurement that chose
                    this spot compared it with the top **centre** status row: at 1024 that
                    row had only 69px to INDEX's right edge while the chip was 194px, so
                    they overlapped by 32px, and the top-right utility lane had only 28px
                    left **on the same line**. The current position is neither of those —
                    it is the **line below** the utility lane, so there is nothing to
                    compete with horizontally (right-aligned, it grows leftwards into empty
                    map). The old measurement therefore does not refute this spot.

                    Toasts live at the top centre since 2026-09-06, so nothing here has to
                    step aside for them. */}
          <FrameMeter />
        </div>

        {/* One-time first-visit map hint in sample mode, bottom centre. It is
                  `pointer-events-none`, so it never blocks a node click — a click passing
                  through it dismisses it, and the first node selection dismisses it for
                  good (localStorage). Source: `features/first-run-starter`.
                  Only a selection confirmed to exist counts as learned — a ghost slug used
                  to dismiss this hint permanently (see `resolvedSelectionSlug`). */}
        <SampleNodeHint hasSelection={resolvedSelectionSlug !== null} hidden={tour.open} />

        {/* The honest notice the chrome tile and ⌘O raise on an unsupported
                  browser. It never opens on a supported one, so an experienced user's
                  direct path (tile → OS picker) is unchanged. */}
        <VaultOpenGuideSheet
          open={unsupportedGuideOpen}
          unsupported
          onClose={() => setUnsupportedGuideOpen(false)}
        />

        {/* Pressing recent changes on the sample: a route to a folder instead of a
                  dead end. It reuses `requestVaultOpen` — the **same handler** as the
                  first-run card's open-folder action — so the unsupported-browser branch
                  exists in exactly one place. */}
        <RecentChangesNeedsVaultDialog
          open={recentNeedsVaultOpen}
          onClose={() => setRecentNeedsVaultOpen(false)}
          onOpenVault={requestVaultOpen}
        />

        {/* Same skeleton, different reason: "this is a sample and cannot be edited"
                  has to be a different sentence from "these dates are not yours". */}
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
