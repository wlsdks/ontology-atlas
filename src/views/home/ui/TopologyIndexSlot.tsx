import type { useAcpRuntimeController } from "../model/use-acp-runtime-controller";
import type { useTopologyAgentOrchestration } from "../model/use-topology-agent-orchestration";
import type { useTopologyAuthoring } from "../model/use-topology-authoring";
import type { useTopologyCanvasFocus } from "../model/use-topology-canvas-focus";
import type { useTopologyCreateIntent } from "../model/use-topology-create-intent";
import type { useTopologyGraphProjection } from "../model/use-topology-graph-projection";
import type { useTopologyInspectorState } from "../model/use-topology-inspector-state";
import type { useTopologyKeyboardTour } from "../model/use-topology-keyboard-tour";
import type { useTopologyNavigationActions } from "../model/use-topology-navigation-actions";
import type { useTopologyPreferences } from "../model/use-topology-preferences";
import type { useTopologyRouteControls } from "../model/use-topology-route-controls";
import type { useTopologySceneControls } from "../model/use-topology-scene-controls";
import type { useTopologySourceReadiness } from "../model/use-topology-source-readiness";
import type { useTopologyVaultReadModel } from "../model/use-topology-vault-read-model";

import { filterTreeExcludeKind } from "@/entities/knowledge-graph";
import { focusWhenReady } from "../lib/topology-focus-return";
import { TopologyIndexPanel, TopologyIndexTab, TopologyRealmLedger } from "@/widgets/topology-index-panel";


interface TopologyIndexSlotProps {
  indexSlotFrames: readonly { state: import("@/widgets/topology-index-panel/lib/index-panel-state").IndexPanelState; exiting: boolean; }[];
  setRouteState: (updater: Partial<import("@/views/home/model/url-state").HomeRouteState> | ((current: import("@/views/home/model/url-state").HomeRouteState) => import("@/views/home/model/url-state").HomeRouteState), options?: import("@/views/home/model/use-home-route-state").HomeRouteStateUpdateOptions | undefined) => void;
  recentWindow: import("../model/url-state").HomeRouteState["recentWindow"];
  topologyAgentOrchestration: Pick<ReturnType<typeof useTopologyAgentOrchestration>, "handleIndexTabExpandFromAgent">;
  acpRuntimeController: Pick<ReturnType<typeof useAcpRuntimeController>, "acpRuntimes">;
  topologySourceReadiness: Pick<ReturnType<typeof useTopologySourceReadiness>, "unboundProjectSource" | "projectSourceReadiness">;
  topologyAuthoring: Pick<ReturnType<typeof useTopologyAuthoring>, "canCreateNode" | "agentAttributedRecentNodeId" | "bootstrapPlan" | "setBootstrapOpen">;
  topologyKeyboardTour: Pick<ReturnType<typeof useTopologyKeyboardTour>, "openGuidedTour" | "tour">;
  topologyPreferences: Pick<ReturnType<typeof useTopologyPreferences>, "t" | "audiencePlain" | "setAudiencePlain" | "kindCountsTitle">;
  topologyRouteControls: Pick<ReturnType<typeof useTopologyRouteControls>, "handleExitRealm" | "handleEnterRealm" | "handleIndexCollapse">;
  topologyNavigationActions: Pick<ReturnType<typeof useTopologyNavigationActions>, "handleSelect">;
  topologyVaultReadModel: Pick<
    ReturnType<typeof useTopologyVaultReadModel>,
    | "changedSlugs"
    | "recentChanges"
    | "spotlightOn"
    | "dustySlugs"
    | "brokenDocCount"
    | "vault"
  >;
  topologyGraphProjection: Pick<ReturnType<typeof useTopologyGraphProjection>, "canvasSelectedSlug">;
  topologySceneControls: Pick<
    ReturnType<typeof useTopologySceneControls>,
    | "indexTreeResult"
    | "realmActive"
    | "realmLedgerModel"
    | "indexMaxDomainDescendantCount"
    | "indexDomainCensus"
    | "topologyTotalNodes"
    | "topologyTotalRelations"
    | "indexDomainCount"
  >;
  topologyInspectorState: Pick<ReturnType<typeof useTopologyInspectorState>, "indexDemotedByNodeSheet">;
  topologyCanvasFocus: Pick<ReturnType<typeof useTopologyCanvasFocus>, "selectedRelationActive">;
  topologyCreateIntent: Pick<ReturnType<typeof useTopologyCreateIntent>, "topologyCreateNodeBlockingActive">;
}

export function TopologyIndexSlot({
  indexSlotFrames, setRouteState, recentWindow, topologyCanvasFocus, topologyInspectorState,
  topologySceneControls, topologyGraphProjection, topologyVaultReadModel, topologyNavigationActions,
  topologyRouteControls, topologyPreferences, topologyKeyboardTour, topologyAuthoring,
  topologySourceReadiness, acpRuntimeController, topologyAgentOrchestration, topologyCreateIntent
}: TopologyIndexSlotProps) {
  const { topologyCreateNodeBlockingActive } = topologyCreateIntent;

  const { selectedRelationActive } = topologyCanvasFocus;
  const { indexDemotedByNodeSheet } = topologyInspectorState;
  const {
    indexTreeResult, realmActive, realmLedgerModel, indexMaxDomainDescendantCount, indexDomainCensus,
    topologyTotalNodes, topologyTotalRelations, indexDomainCount
  } = topologySceneControls;
  const { canvasSelectedSlug } = topologyGraphProjection;
  const { changedSlugs, recentChanges, spotlightOn, dustySlugs, brokenDocCount, vault } = topologyVaultReadModel;
  const { handleSelect } = topologyNavigationActions;
  const { handleExitRealm, handleEnterRealm, handleIndexCollapse } = topologyRouteControls;
  const { t, audiencePlain, setAudiencePlain, kindCountsTitle } = topologyPreferences;
  const { openGuidedTour, tour } = topologyKeyboardTour;
  const { canCreateNode, agentAttributedRecentNodeId, bootstrapPlan, setBootstrapOpen } = topologyAuthoring;
  const { unboundProjectSource, projectSourceReadiness } = topologySourceReadiness;
  const { acpRuntimes } = acpRuntimeController;
  const { handleIndexTabExpandFromAgent } = topologyAgentOrchestration;

  return (<>
    {!selectedRelationActive && !topologyCreateNodeBlockingActive
      ? indexSlotFrames.map((frame) => (
        <div
          // Keyed so collapse and expand take turns in the slot with the shared `.map-overlay-in`
          // fade, on the same clock as other map overlays.
          key={`${frame.state}-${frame.exiting ? "out" : "in"}`}
          // `topology-ui-scale` gives INDEX the same wide-screen zoom as the toolbar and inspector.
          // The slot ignores pointer input, since INDEX ends under its last row; only the held
          // surface is live.
          className={`${frame.exiting ? "map-overlay-out" : "map-overlay-in"} pointer-events-none topology-ui-scale absolute z-20 ${
            // Below `lg` the node sheet paints over this stack, so it recedes
            // (see `indexDemotedByNodeSheet`).
            frame.exiting || indexDemotedByNodeSheet ? "" : "[&>button]:pointer-events-auto [&_aside]:pointer-events-auto"
            }`}
          data-index-demoted-by-node-sheet={indexDemotedByNodeSheet || undefined}
          // The toaster centres right of INDEX.
          data-toast-wall={frame.exiting ? undefined : "left"}
          aria-hidden={frame.exiting || undefined}
          inert={frame.exiting || indexDemotedByNodeSheet || undefined}
          style={{
            left: frame.state === "expanded" ? "var(--topology-index-inset)" : 0,
            // Expanded rises to the chrome inset (24px); collapsed keeps `--topology-index-top`.
            top:
              frame.state === "expanded"
                ? "var(--topology-index-inset)"
                : "var(--topology-index-top)",
            // Equals the chrome inset on desktop; below `md` it clears the `BottomTabBar` reserve.
            bottom:
              frame.state === "expanded"
                ? "var(--topology-index-bottom-inset)"
                : undefined,
          }}
        >
          {frame.state === "expanded" && indexTreeResult ? (
            // The realm ledger shares the box, so the keyed fade reads as a crossfade; only a
            // global/realm switch remounts.
            <div
              key={realmActive ? "realm" : "index"}
              className="h-full animate-[panelCrossfadeIn_var(--topology-motion-panel-duration)_var(--topology-motion-ease-out)] motion-reduce:animate-none"
            >
              {realmActive && realmLedgerModel ? (
                <TopologyRealmLedger
                  rootKind={realmLedgerModel.rootKind}
                  rootTitle={realmLedgerModel.rootTitle}
                  census={realmLedgerModel.census}
                  subtree={realmLedgerModel.subtree}
                  boundaryRows={realmLedgerModel.boundaryRows}
                  boundaryTotal={realmLedgerModel.boundaryTotal}
                  selectedId={canvasSelectedSlug}
                  changedSlugs={changedSlugs}
                  onSelect={(id) => handleSelect(id)}
                  onExit={handleExitRealm}
                  // Swaps to the outside node's domain-level ancestor through the enter handler.
                  onJumpRealm={handleEnterRealm}
                  maxDomainDescendantCount={indexMaxDomainDescendantCount}
                  domainCensus={indexDomainCensus}
                  labels={{
                    label: t("realm.ledger.heading"),
                    elementsShort: t("index.elementsShort"),
                    capabilitiesShort: t("index.capabilitiesShort"),
                    depthShort: t("realm.ledger.depthShort"),
                    searchPlaceholder: t("realm.ledger.searchPlaceholder"),
                    exit: t("realm.ledger.exit"),
                    exitAria: t("realm.chipClear"),
                    emptyHint: t("index.emptyHint"),
                    boundaryHeading: t("realm.ledger.boundaryHeading", {
                      count: realmLedgerModel.boundaryTotal,
                    }),
                    boundaryToggleAria: t("realm.ledger.boundaryToggleAria"),
                    boundaryJump: t("realm.ledger.boundaryJump"),
                    boundaryJumpAria: t("realm.ledger.boundaryJumpAria"),
                    boundaryEmpty: t("realm.ledger.boundaryEmpty"),
                    freshTitle: t("index.freshTitle"),
                    domainCountTitle: t("index.domainCountTitle"),
                  }}
                />
              ) : (
                <TopologyIndexPanel
                  // Plain mode drops element rows for display only; ledger and counts
                  // use `indexTreeResult`.
                  treeResult={
                    audiencePlain
                      ? { ...indexTreeResult, roots: filterTreeExcludeKind(indexTreeResult.roots, "element") }
                      : indexTreeResult
                  }
                  totalConcepts={topologyTotalNodes}
                  totalRelations={topologyTotalRelations}
                  domainCount={indexDomainCount}
                  changedSlugs={changedSlugs}
                  selectedId={canvasSelectedSlug}
                  onSelect={(id) => handleSelect(id, { keepIndexOpen: true })}
                  onCollapse={() => {
                    // Folding hands focus to the tab that unfolds it.
                    const leaving = document.activeElement;
                    handleIndexCollapse();
                    focusWhenReady(["topology-index-tab"], { leaving });
                  }}
                  onStartTour={openGuidedTour}
                  tourIndexSpotlit={tour.open && tour.step?.id === "index"}
                  tourAgentSpotlit={tour.open && tour.step?.id === "agent"}
                  onEnablePlainMode={() => setAudiencePlain(true)}
                  // Gates the hint explaining the missing element rows.
                  plainMode={audiencePlain}
                  vaultLoaded={canCreateNode}
                  domainCensus={indexDomainCensus}
                  // The ids the lens filters on, plus the badge target.
                  recentChanges={{
                    ids: recentChanges.recentNodeIds,
                    agentAttributedNodeId: agentAttributedRecentNodeId,
                  }}
                  // `?recent=` drives both the map's sinking and this lens.
                  lens={spotlightOn ? "recent" : "all"}
                  onLensChange={(next) =>
                    setRouteState((current) => ({
                      ...current,
                      recentWindow: next === "recent" ? (current.recentWindow ?? "auto") : null,
                    }))
                  }
                  recentWindow={recentWindow ?? "auto"}
                  onWindowChange={(next) =>
                    setRouteState((current) => ({ ...current, recentWindow: next }))
                  }
                  // `bootstrapPlan` exists once a vault loads, so this row opens the bootstrap
                  // dialog on a populated map too.
                  uncatalogedDocCount={bootstrapPlan?.elements.length ?? 0}
                  // The row hides at 0.
                  dustyNodeCount={dustySlugs.size}
                  brokenDocCount={brokenDocCount}
                  unboundProjectNodeId={unboundProjectSource?.nodeId ?? null}
                  // Opens the project with the caret on its connect action.
                  onOpenUnboundSource={(id) => {
                    const leaving = document.activeElement;
                    handleSelect(id, { keepIndexOpen: true });
                    focusWhenReady(["map-project-source-action"], { leaving });
                  }}
                  noProjectsYet={projectSourceReadiness.state === "no-projects"}
                  // Names the folder the rows came from by `handle.name`; the browser has no
                  // absolute path, so neither claims one.
                  sourceName={vault.status === "loaded" ? (vault.handle?.name ?? null) : null}
                  sourceDocumentCount={vault.manifest?.docs.length ?? null}
                  sourceDocumentCountPartial={vault.manifest?.walkTruncated ?? false}
                  // Without an agent the door would create a folder and then do nothing.
                  agentAvailable={acpRuntimes.length > 0}
                  openedInsidePickedFolder={vault.openedInsidePickedFolder ?? null}
                  onDismissOpenedInside={vault.dismissOpenedInsideNotice}
                  onPromoteUncatalogedDocs={
                    bootstrapPlan && bootstrapPlan.elements.length > 0
                      ? () => setBootstrapOpen(true)
                      : undefined
                  }
                  labels={{
                    label: t("index.label"),
                    fold: t("index.fold"),
                    foldAria: t("index.foldAria"),
                    searchPlaceholder: t("index.searchPlaceholder"),
                    censusConcepts: t("index.censusConcepts"),
                    sourceDocuments: t("index.sourceDocuments"),
                    sourceDocumentsPartialTitle: t("index.sourceDocumentsPartialTitle"),
                    censusRelations: t("index.censusRelations"),
                    censusDomains: t("index.censusDomains"),
                    capabilitiesShort: t("index.capabilitiesShort"),
                    elementsShort: t("index.elementsShort"),
                    subcountsTitle: kindCountsTitle,
                    freshTitle: t("index.freshTitle"),
                    domainCountTitle: t("index.domainCountTitle"),
                    subtotalTitle: t("index.subtotalTitle"),
                    emptyHint: t("index.emptyHint"),
                    segmentAll: t("index.segmentAll"),
                    // Shows the adaptive window's span; while Git is dating documents it names
                    // itself and claims nothing.
                    segmentRecent: recentChanges.reading
                      ? t("controls.spotlightLabel")
                      : t("index.segmentRecent", {
                          count: recentChanges.recentNodeIds.size,
                          days: recentChanges.windowDays,
                        }),
                    segmentRecentAria: t("index.segmentRecentAria"),
                    recentEmptyHint: recentChanges.reading
                      ? ""
                      : t("index.recentEmptyHint", { days: recentChanges.windowDays }),
                    windowChipAuto: t("index.windowChipAuto"),
                    windowChip1: t("index.windowChipDays", { days: 1 }),
                    windowChip7: t("index.windowChipDays", { days: 7 }),
                    windowChip30: t("index.windowChipDays", { days: 30 }),
                    windowChipsAria: t("index.windowChipsAria"),
                    agentBadge: t("index.agentBadge"),
                    uncatalogedDocsLabel: t("index.uncatalogedDocsLabel", {
                      count: bootstrapPlan?.elements.length ?? 0,
                    }),
                    uncatalogedDocsAction: t("index.uncatalogedDocsAction"),
                    dustyNodesLabel: t("index.dustyNodesLabel", { count: dustySlugs.size }),
                    dustyNodesAction: t("index.dustyNodesAction"),
                    brokenDocsLabel: t("index.brokenDocsLabel", { count: brokenDocCount }),
                    brokenDocsAction: t("index.brokenDocsAction"),
                    sourceUnboundLabel: t("index.sourceUnboundLabel", {
                      count: unboundProjectSource?.count ?? 0,
                    }),
                    sourceUnboundAction: t("index.sourceUnboundAction"),
                    tidyHeading: t("index.tidyHeading"),
                    openedInsideLabel: t("index.openedInsideLabel"),
                    openedInsideDismiss: t("index.openedInsideDismiss"),
                    // The panel gates it to plain mode.
                    plainHint: t("index.plainHint"),
                  }}
                />
              )}
            </div>
          ) : (
            <TopologyIndexTab
              onExpand={() => {
                // Unfolding hands focus to the fold control.
                const leaving = document.activeElement;
                handleIndexTabExpandFromAgent();
                focusWhenReady(["topology-index-fold"], { leaving });
              }}
              labels={{
                label: t("index.label"),
                expandAria: t("index.expandAria"),
                agentSyncTitle: t("index.agentSync"),
              }}
            />
          )}
        </div>
      ))
      : null}
  </>);
}
