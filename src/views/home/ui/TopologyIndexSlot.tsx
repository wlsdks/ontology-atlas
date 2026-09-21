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
          // Collapse ↔ expand is **two surfaces taking turns in the same slot**.
          // With no transition, 300px of panel and ten rows flipped between
          // existing and not in one frame (luminance Δ13.6 over 17 ms) while the
          // camera from the same click took 200 ms — one action with three
          // different durations. Making the swap explicit through `key` lets the
          // arriving surface use the shared grammar for large surfaces over the map
          // (`.map-overlay-in`, 180 ms opacity), so popovers, panels, and full
          // detail all run on one clock.
          key={`${frame.state}-${frame.exiting ? "out" : "in"}`}
          // `topology-ui-scale`: the top-left chrome group carries the same class
          // and is zoomed at ≥1920px / ≥2400px. Without it this wrapper would stay
          // at fixed px while the group grows proportionally under that zoom, and
          // the two would overlap again — see the `--topology-index-top` comment.
          className={`${frame.exiting ? "map-overlay-out pointer-events-none" : "map-overlay-in"} topology-ui-scale absolute z-20 ${
            // `indexDemotedByNodeSheet` — see its definition: below `lg` the node
            // sheet is painted over this stack, so it recedes rather than leaving
            // 24 reachable-looking controls under an opaque surface.
            indexDemotedByNodeSheet ? "pointer-events-none" : ""
            }`}
          data-index-demoted-by-node-sheet={indexDemotedByNodeSheet || undefined}
          aria-hidden={frame.exiting || undefined}
          inert={frame.exiting || indexDemotedByNodeSheet || undefined}
          style={{
            left: frame.state === "expanded" ? "var(--topology-index-inset)" : 0,
            // Owner report, 2026-07-23: after the permanent map header retired, 84px
            // of empty band was left above the expanded stack. Expanded now rises to
            // the chrome inset (24px). In the states where the brand pill appears
            // (selection, drawer) the automatic demotion turns the stack into a
            // collapsed tab, so overlap with the pill is structurally impossible.
            // The collapsed tab keeps 84px to stay aligned under the pill.
            top:
              frame.state === "expanded"
                ? "var(--topology-index-inset)"
                : "var(--topology-index-top)",
            // The bottom inset has its own token: equal to the chrome inset on
            // desktop, and below `md` in sheet mode it rises above the
            // `BottomTabBar` reserve.
            bottom:
              frame.state === "expanded"
                ? "var(--topology-index-bottom-inset)"
                : undefined,
          }}
        >
          {frame.state === "expanded" && indexTreeResult ? (
            // While a realm is active the left panel is replaced by the realm
            // ledger, which shows only this node's world instead of the global
            // content. Both occupy the same box, so the keyed wrapper's short
            // fade-in (under 200 ms, instant under reduced-motion) reads as a
            // crossfade. Only the global ↔ realm switch changes the key and
            // remounts; a realm-to-realm jump updates in place.
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
                  // "Go to this realm" on a boundary row swaps the realm to the
                  // outside node's domain-level ancestor (a realm-to-realm jump). It
                  // reuses the enter handler, so there is no new URL logic.
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
                  // Plain mode passes a derived tree with only the element rows
                  // removed — a display gate, no data change. The realm ledger, the
                  // census, and the counts still use the original `indexTreeResult`.
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
                  onCollapse={handleIndexCollapse}
                  onStartTour={openGuidedTour}
                  tourIndexSpotlit={tour.open && tour.step?.id === "index"}
                  tourAgentSpotlit={tour.open && tour.step?.id === "agent"}
                  onEnablePlainMode={() => setAudiencePlain(true)}
                  // Gates the quiet hint row explaining why element rows are not
                  // visible. `treeResult` above has already removed them; the single
                  // source is unchanged.
                  plainMode={audiencePlain}
                  vaultLoaded={canCreateNode}
                  domainCensus={indexDomainCensus}
                  // The id set the lens filters on, plus the badge target.
                  recentChanges={{
                    ids: recentChanges.recentNodeIds,
                    agentAttributedNodeId: agentAttributedRecentNodeId,
                  }}
                  // One source for the spotlight: the URL's `?recent=` drives both the
                  // map's sinking and this lens. Clicking the lens tab toggles the
                  // spotlight; a preset chip switches the window immediately.
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
                  // "N documents not on the map · add them". `bootstrapPlan` is always
                  // computed once a vault is loaded, empty map or not, so its count is
                  // exposed with no new derivation. Clicking opens the existing
                  // "build a map from my documents" dialog — previously reachable only
                  // from the empty state, whereas this row opens it on a populated map
                  // too.
                  uncatalogedDocCount={bootstrapPlan?.elements.length ?? 0}
                  // Dusty (long-untouched) node count; the row hides at 0.
                  dustyNodeCount={dustySlugs.size}
                  brokenDocCount={brokenDocCount}
                  unboundProjectNodeId={unboundProjectSource?.nodeId ?? null}
                  noProjectsYet={projectSourceReadiness.state === "no-projects"}
                  /*
                   * Which folder these rows came from. Audit, 2026-09-05: opening a folder
                   * from the first-run panel redrew the map with the person's own concepts
                   * and nothing on the screen said which folder had been read.
                   * `handle.name` is the basename both surfaces have — the browser gets no
                   * absolute path, so the app does not claim one either.
                   */
                  sourceName={vault.status === "loaded" ? (vault.handle?.name ?? null) : null}
                  sourceDocumentCount={vault.manifest?.docs.length ?? null}
                  sourceDocumentCountPartial={vault.manifest?.walkTruncated ?? false}
                  // The door hands work to an agent; without one it would create a folder and
                  // then silently do nothing, having promised a map.
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
                    // Exposes the adaptive window's actual span (7d → 3d → 1d) in the
                    // label.
                    segmentRecent: t("index.segmentRecent", {
                      count: recentChanges.recentNodeIds.size,
                      days: recentChanges.windowDays,
                    }),
                    segmentRecentAria: t("index.segmentRecentAria"),
                    recentEmptyHint: t("index.recentEmptyHint", { days: recentChanges.windowDays }),
                    // Spotlight window preset chips.
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
                    // Rendered only in plain mode; the panel gates it.
                    plainHint: t("index.plainHint"),
                  }}
                />
              )}
            </div>
          ) : (
            <TopologyIndexTab
              onExpand={handleIndexTabExpandFromAgent}
              labels={{
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
