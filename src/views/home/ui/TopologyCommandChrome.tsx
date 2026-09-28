import { buildOntologyInsightsReturnHref } from "@/entities/knowledge-graph";
import { AgentActivityChip, CompanionHome } from "@/features/agent-activity";
import { buildConstellationAgentPrompt } from "@/features/saved-constellations";
import { Link } from "@/i18n/navigation";
import { writeGalaxy, writeView3d } from "@/shared/lib/appearance-preferences";
import { VAULT_AGENT_PANEL_ID } from "@/shared/config/agent-panel";
import { withBasePath } from "@/shared/lib/base-path";
import { cn } from "@/shared/lib/cn";
import { getTauriVaultRootPath } from "@/shared/lib/tauri-vault-fs";
import type { useToast } from "@/shared/ui";
import { CHROME_CHIP_COMPACT_BELOW_XL, ChromeChip, Tooltip } from "@/shared/ui";
import { AppSettingsMenu } from "@/widgets/app-settings-menu";
import { SavedConstellationsControl } from "@/widgets/saved-constellations";
import { SearchHint } from "@/widgets/search-hint";
import { FolderOpen, History as HistoryIcon, MessageCircle, ScanSearch } from "lucide-react";
import Image from "next/image";
import { useState } from "react";
import { canCopyTopologyPathPacket } from "../lib/topology-path-chip-state";
import { useMapToolbarTopReserve } from "../model/use-map-toolbar-top-reserve";
import type { useHomeWorkbenchController } from "../model/use-home-workbench-controller";
import type { useTopologyAgentActivity } from "../model/use-topology-agent-activity";
import type { useTopologyAgentOrchestration } from "../model/use-topology-agent-orchestration";
import type { useTopologyAuthoring } from "../model/use-topology-authoring";
import type { useTopologyCanvasFocus } from "../model/use-topology-canvas-focus";
import type { useTopologyCreateIntent } from "../model/use-topology-create-intent";
import type { useTopologyExplorationLenses } from "../model/use-topology-exploration-lenses";
import type { useTopologyGraphProjection } from "../model/use-topology-graph-projection";
import type { useTopologyIndexPresentation } from "../model/use-topology-index-presentation";
import type { useTopologyInspectorState } from "../model/use-topology-inspector-state";
import type { useTopologyNavigationActions } from "../model/use-topology-navigation-actions";
import type { useTopologyPreferences } from "../model/use-topology-preferences";
import type { useTopologyRouteControls } from "../model/use-topology-route-controls";
import type { useTopologySceneControls } from "../model/use-topology-scene-controls";
import type { useTopologyVaultReadModel } from "../model/use-topology-vault-read-model";
import { TopologyInsightsReturnChip } from "./TopologyInsightsReturnChip";
import { TopologyPathChip } from "./TopologyPathChip";
import { TopologyRealmChip } from "./TopologyRealmChip";
import { TopologyTrailChip } from "./TopologyTrailChip";


interface TopologyCommandChromeProps {
  grayAreaAction?: {label:string;onOpen:()=>void};
  routeState: import("@/views/home/model/url-state").HomeRouteState;
  setRouteState: (updater: Partial<import("@/views/home/model/url-state").HomeRouteState> | ((current: import("@/views/home/model/url-state").HomeRouteState) => import("@/views/home/model/url-state").HomeRouteState), options?: import("@/views/home/model/use-home-route-state").HomeRouteStateUpdateOptions | undefined) => void;
  setVaultAgentPrefill: React.Dispatch<React.SetStateAction<{ text: string; nonce: number; } | null>>;
  setOntologySearchOpen: React.Dispatch<React.SetStateAction<boolean>>;
  setTopologyRelayoutToken: React.Dispatch<React.SetStateAction<number>>;
  toast: ReturnType<typeof useToast>;
  expandAllActive: boolean;
  insightsReturnTab: string | null;
  insightsReturnReviewId: string | null;
  analysisMode: import("@/views/home/model/url-state").TopologyAnalysisMode;
  footprintTrailEntries: import("@/views/home/lib/footprint-trail").FootprintTrailEntry[];
  footprintTrailStepCaptions: (import("@/views/home/lib/footprint-trail").TrailStepCaption | null)[];
  footprintPacketCopied: boolean;
  copyFootprintPacket: () => Promise<void>;
  clearFootprintTrail: () => void;
  handleFootprintLens: (active: boolean) => void;
  handleFootprintBrush: (id: string | null) => void;
  pastWalkRows: import("@/views/home/ui/TopologyTrailChip").TopologyPastWalkRow[];
  pastTrailNotice: string | null;
  handleDeletePastWalk: (walkId: string) => void;
  handleClearPastWalks: () => void;
  agentDockTouchedRef: React.RefObject<boolean>;
  sampleModeSettled: boolean;
  requestVaultOpen: () => void;
  v2DatasheetModel: { slug: string; nodeId: string; title: string; sourceTitle: string | null; kind: string; domain: { id: string; title: string; } | null; powered: boolean; updatedAtLabel: string | null; metric: { contains: number; usedBy: number; dependsOn: number; belongsTo: number; evidence: number; }; groups: import("@/widgets/ontology-map/ui/map-datasheet").V2ConnectionGroupsView; evidence: { rows: import("@/widgets/ontology-map/ui/map-datasheet").V2EvidenceRow[]; total: number; }; codeLocations: string[]; handoffText: string; documentHref: string | null; mentionDocumentHref: string | null; meaningEditHref: string; lastEditSubject: { kind: import("@/shared/lib/last-edit-subject").LastEditSubjectKind; ageLabel: string; } | null; mtimeConflict: boolean; } | null;
  topologyAgentActivity: Pick<ReturnType<typeof useTopologyAgentActivity>, "acpLiveWork">;
  homeWorkbenchController: Pick<ReturnType<typeof useHomeWorkbenchController>, "meaningWorkbenchOpen" | "toggleMeaningWorkbench">;
  topologyNavigationActions: Pick<ReturnType<typeof useTopologyNavigationActions>, "handleSelect" | "handleReplayPastWalk">;
  topologyRouteControls: Pick<ReturnType<typeof useTopologyRouteControls>, "handleExitRealm" | "indexPanelCollapsedStored" | "handleChangeIndexDefaultCollapsed">;
  topologySceneControls: Pick<
    ReturnType<typeof useTopologySceneControls>,
    | "handleToggleExpandAll"
    | "pathChipLabel"
    | "pathChipOutcome"
    | "pathChipState"
    | "pathPacketCopied"
    | "copyPathPacket"
    | "handleClearPath"
  >;
  topologyAgentOrchestration: Pick<ReturnType<typeof useTopologyAgentOrchestration>, "openVaultAgent" | "agentDockOpen" | "closeVaultAgent">;
  topologyGraphProjection: Pick<ReturnType<typeof useTopologyGraphProjection>, "canvasSelectedSlug" | "resolvedRealmSlug" | "realmTitle">;
  topologyVaultReadModel: Pick<
    ReturnType<typeof useTopologyVaultReadModel>,
    | "vault"
    | "llmBridgeAvailable"
    | "tAgent"
    | "spotlightOn"
    | "recentChanges"
    | "handleToggleSpotlight"
    | "spotlightNeedsVault"
    | "ontologyChangeset"
  >;
  topologyCanvasFocus: Pick<ReturnType<typeof useTopologyCanvasFocus>, "selectedRelationActive" | "setSelectedRelationActive">;
  topologyAuthoring: Pick<ReturnType<typeof useTopologyAuthoring>, "createNodeOpen" | "setSelectedEdge">;
  topologyInspectorState: Pick<
    ReturnType<typeof useTopologyInspectorState>,
    | "topologyUtilityChromeState"
    | "topologyUtilityChromeCompact"
    | "topologyUtilityLaneSuppressionContract"
    | "searchLaneCrowded"
    | "selectedNodeFocusActive"
    | "nodePanelMounted"
    | "inspectorOwnsRightRail"
    | "activityInboxOpen"
    | "selectedEdgeOwnsRightRail"
    | "setActivityInboxOpen"
  >;
  topologyPreferences: Pick<ReturnType<typeof useTopologyPreferences>, "t" | "galaxy" | "audiencePlain" | "setAudiencePlain" | "tWorkbench" | "tAtlasGit">;
  topologyExplorationLenses: Pick<
    ReturnType<typeof useTopologyExplorationLenses>,
    | "constellationCandidates"
    | "routedConstellation"
    | "setActiveConstellation"
    | "setConstellationFitToken"
  >;
  topologyIndexPresentation: Pick<ReturnType<typeof useTopologyIndexPresentation>, "renderedIndexState">;
  topologyCreateIntent: Pick<ReturnType<typeof useTopologyCreateIntent>, "topologyBlockingOverlayState" | "createNodePending" | "topologyBlockingOverlayActive">;
}

export function TopologyCommandChrome({
  grayAreaAction,
  routeState, setRouteState, setVaultAgentPrefill, setOntologySearchOpen, setTopologyRelayoutToken, toast,
  expandAllActive, insightsReturnTab, insightsReturnReviewId, analysisMode, footprintTrailEntries,
  footprintTrailStepCaptions, footprintPacketCopied, copyFootprintPacket, clearFootprintTrail,
  handleFootprintLens, handleFootprintBrush, pastWalkRows, pastTrailNotice, handleDeletePastWalk,
  handleClearPastWalks, agentDockTouchedRef, sampleModeSettled, requestVaultOpen, v2DatasheetModel,
  topologyPreferences, topologyInspectorState, topologyAuthoring, topologyCanvasFocus,
  topologyVaultReadModel, topologyGraphProjection, topologyAgentOrchestration, topologySceneControls,
  topologyRouteControls, topologyNavigationActions, homeWorkbenchController, topologyAgentActivity,
  topologyCreateIntent, topologyIndexPresentation, topologyExplorationLenses
}: TopologyCommandChromeProps) {
  const { topologyBlockingOverlayState, createNodePending, topologyBlockingOverlayActive } = topologyCreateIntent;
  const { renderedIndexState } = topologyIndexPresentation;
  const { constellationCandidates, routedConstellation, setActiveConstellation, setConstellationFitToken } = topologyExplorationLenses;

  const { t, galaxy, audiencePlain, setAudiencePlain, tWorkbench, tAtlasGit } = topologyPreferences;
  const {
    topologyUtilityChromeState, topologyUtilityChromeCompact, topologyUtilityLaneSuppressionContract,
    searchLaneCrowded, selectedNodeFocusActive, nodePanelMounted, inspectorOwnsRightRail, activityInboxOpen,
    selectedEdgeOwnsRightRail, setActivityInboxOpen
  } = topologyInspectorState;
  const { createNodeOpen, setSelectedEdge } = topologyAuthoring;
  const { selectedRelationActive, setSelectedRelationActive } = topologyCanvasFocus;
  const {
    vault, llmBridgeAvailable, tAgent, spotlightOn, recentChanges, handleToggleSpotlight,
    spotlightNeedsVault, ontologyChangeset
  } = topologyVaultReadModel;
  const { canvasSelectedSlug, resolvedRealmSlug, realmTitle } = topologyGraphProjection;
  const { openVaultAgent, agentDockOpen, closeVaultAgent } = topologyAgentOrchestration;
  const { handleToggleExpandAll, pathChipLabel, pathChipOutcome, pathChipState, pathPacketCopied, copyPathPacket, handleClearPath } = topologySceneControls;
  const { handleExitRealm, indexPanelCollapsedStored, handleChangeIndexDefaultCollapsed } = topologyRouteControls;
  const { handleSelect, handleReplayPastWalk } = topologyNavigationActions;
  const { meaningWorkbenchOpen, toggleMeaningWorkbench } = homeWorkbenchController;
  const { acpLiveWork } = topologyAgentActivity;
  const [toolbarElement, setToolbarElement] = useState<HTMLDivElement | null>(null);
  useMapToolbarTopReserve(toolbarElement);

  return (<>
    <div className="pointer-events-none absolute left-4 top-[22px] z-10 -translate-y-1/2 md:hidden">
      <div className="flex items-center gap-2">
        <Image
          src={withBasePath('/logo.png')}
          alt=""
          aria-hidden="true"
          width={26}
          height={26}
          priority
          className="h-[26px] w-[26px] shrink-0 rounded-chip border border-[color:var(--color-border-soft)] object-cover"
        />
        <div
          className="min-w-0 overflow-hidden"
          // The utility lane (about 236px of content at `right-4`) and this label are separate
          // absolute overlays that `flex-wrap` cannot separate, so a vw-based cap keeps them apart.
          style={{ maxWidth: "max(0px, calc(100vw - 310px))" }}
        >
          <span
            translate="no"
            className="block truncate text-label text-[color:var(--color-text-quaternary)]"
          >
            ontology-atlas
          </span>
          <p className="mt-0.5 truncate text-label leading-label text-[color:var(--color-text-tertiary)]">
            {t('mobileTagline')}
          </p>
        </div>
      </div>
    </div>
    <div
      data-testid="topology-command-chrome"
      data-command-chrome-state={topologyUtilityChromeState}
      data-blocking-overlay-state={topologyBlockingOverlayState}
      data-create-node-intent-state={
        createNodeOpen
          ? "active-blocking-composer"
          : createNodePending
            ? "pending-writable-vault"
            : "idle"
      }
      data-attention-role={
        selectedRelationActive
          ? "demoted-utility"
          : topologyBlockingOverlayActive
            ? "demoted-under-blocking-overlay"
            : "utility-chrome"
      }
      data-utility-lane-height-token={
        topologyUtilityChromeCompact ? "--topology-utility-lane-height" : undefined
      }
      data-utility-lane-gap-token={
        topologyUtilityChromeCompact ? "--topology-utility-lane-gap" : undefined
      }
      data-utility-lane-compact-width-token={
        topologyUtilityChromeCompact ? "--topology-utility-lane-compact-width" : undefined
      }
      data-utility-lane-suppression-contract={
        topologyUtilityLaneSuppressionContract
      }
      className="contents"
    >
      {!selectedRelationActive ? (
        <>
          {/* Below `md` the utility lane hides while expanded INDEX owns the surface; settings
             stays reachable here. */}
          {!inspectorOwnsRightRail && renderedIndexState === "expanded" ? (
            <div
              className="pointer-events-auto absolute right-4 top-4 z-[var(--z-map-scrim)] md:hidden"
              data-testid="topology-mobile-settings"
            >
              <AppSettingsMenu
                mode={vault.status === 'loaded' ? 'local' : 'static'}
                triggerVariant="chrome-tile"
                screenControls={{
                  audiencePlain,
                  onAudiencePlainChange: setAudiencePlain,
                  indexCollapsed: indexPanelCollapsedStored,
                  onIndexCollapsedChange: handleChangeIndexDefaultCollapsed,
                }}
              />
            </div>
          ) : null}
          <div
            // One flex box holds both lanes, so neither paints over the other when a panel narrows
            // the map. Below `xl` they stack at the right; from `xl` they share a row
            // and `flex-wrap-reverse` drops the search lane under the utility lane when both do
            // not fit. The box owns every horizontal reserve (expanded INDEX, the node inspector
            // from `xl` in `app/globals.css`, the agent dock seam) and the
            // one `topology-ui-scale`.
            className={cn(
              // `items-end` everywhere: from `xl` the wrap-reverse cross axis makes `end` the
              // line's top, and `items-start` would sink the utility lane onto the fit tile.
              // From `md` it stands on the chrome inset, level with INDEX.
              "@container/map-toolbar topology-ui-scale pointer-events-none absolute right-4 top-4 flex flex-col-reverse items-end gap-4 transition-[left,right] duration-[var(--agent-panel-reflow-duration)] ease-[var(--topology-motion-ease-out)] motion-reduce:transition-none md:right-[var(--chrome-inset)] md:top-[var(--chrome-inset)] xl:flex-row xl:flex-wrap-reverse",
              // The free map starts one inset past INDEX, open or folded, or the first search tile
              // slides under the tab.
              renderedIndexState === "expanded"
                ? "left-4 md:left-[calc(var(--topology-index-width)+var(--topology-index-inset)*2)]"
                : "left-4 md:left-[calc(var(--topology-index-tab-width)+var(--topology-index-inset))]",
              // The activity status wraps with the row; hiding it on overflow refit the lane and
              // showed it again, endlessly. A lane popover lives in this stacking context, so
              // while one shows the box rises above INDEX (z-20, later in the DOM).
              activityInboxOpen ? "z-30" : "z-20 has-[[data-lane-popover=open]]:z-30",
            )}
            ref={setToolbarElement}
            data-testid="topology-top-toolbar"
            // Lane popovers clamp to this box, which already reserves INDEX, the inspector and the
            // dock seam.
            data-popover-boundary="free-map"
            // `GuidedTourOverlay` keeps its card clear of the toolbar.
            data-tour-keep-clear="map-toolbar"
            data-agent-dock-adjacent-rail="true"
            data-right-inspector-reserve={
              nodePanelMounted ? "recenter-in-remaining-map" : undefined
            }
            data-left-index-reserve={
              renderedIndexState === "expanded" ? "recenter-in-remaining-map" : undefined
            }
          >
          <SearchHint
            // No auto margin: from `xl` this lane holds the free map's left edge and the utility
            // lane's `ml-auto` the right, and it stays put while the inspector owns the right
            // rail. Gate: tests/e2e/map-toolbar-balance.spec.ts
            density={topologyUtilityChromeCompact || searchLaneCrowded ? "compact-focus" : "default"}
            phoneFocusSuppressed={selectedNodeFocusActive}
            constellationControl={(
              <>
              <SavedConstellationsControl
                handle={vault.status === 'loaded' ? vault.handle : null}
                candidates={constellationCandidates}
                selectedSlug={canvasSelectedSlug}
                intent={routeState.constellationIntent}
                activeId={routedConstellation?.id ?? null}
                onFocus={(id, memberSlugs) => {
                  writeView3d(false);
                  writeGalaxy(true);
                  setActiveConstellation({ id, memberSlugs });
                  setSelectedEdge(null);
                  setSelectedRelationActive(false);
                  setRouteState((current) => ({
                    ...current,
                    constellationIntent: id,
                    selectedSlug: null,
                    focusedHubSlug: null,
                    analysisMode: 'overview',
                    pathSourceSlug: null,
                    pathTargetSlug: null,
                    realmSlug: null,
                  }));
                  setConstellationFitToken((current) => current + 1);
                }}
                onClear={() => {
                  setActiveConstellation(null);
                  setRouteState({ constellationIntent: null });
                }}
                onPrepare={(saved) => {
                  setVaultAgentPrefill({
                    text: buildConstellationAgentPrompt(saved, {
                      vaultPath: vault.handle
                        ? getTauriVaultRootPath(vault.handle) ?? vault.handle.name
                        : null,
                    }),
                    nonce: Date.now(),
                  });
                  openVaultAgent();
                }}
                canPrepare={llmBridgeAvailable}
              />
              {routedConstellation && grayAreaAction ? <ChromeChip onClick={grayAreaAction.onOpen} icon={<ScanSearch size={14}/>} data-testid="gray-area-set-entry">{grayAreaAction.label}</ChromeChip> : null}
              </>
            )}
            // Below `md` expanded INDEX is a full-bleed sheet, so the top chrome column is demoted
            // like the utility lane.
            phoneSheetSuppressed={renderedIndexState === "expanded"}
            onOpenSearch={() => {
              setOntologySearchOpen(true);
            }}
            onRelayout={() => {
              setTopologyRelayoutToken((current) => current + 1);
              toast.show(t('controls.relayoutToast'), "info");
            }}
            // Galaxy always renders every concept, so the Flat expand action is hidden rather than
            // inert.
            onToggleExpandAll={galaxy ? undefined : handleToggleExpandAll}
            allExpanded={expandAllActive}
            realmChip={
              resolvedRealmSlug && realmTitle ? (
                // "view only this" on screen, `realm` internally; `chipViewing` splits on a
                // sentinel so any locale works.
                <TopologyRealmChip
                  title={realmTitle}
                  beforeLabel={t("realm.chipViewing", { title: "\u0000" }).split("\u0000")[0] ?? ""}
                  afterLabel={t("realm.chipViewing", { title: "\u0000" }).split("\u0000")[1] ?? ""}
                  clearAriaLabel={t("realm.chipClear")}
                  onClear={handleExitRealm}
                />
              ) : undefined
            }
            returnChip={
              insightsReturnTab ? (
                <TopologyInsightsReturnChip
                  href={buildOntologyInsightsReturnHref(
                    insightsReturnTab,
                    insightsReturnReviewId,
                  )}
                  label={t("insightsReturn.label")}
                  ariaLabel={t("insightsReturn.ariaLabel")}
                  dismissAriaLabel={t("insightsReturn.dismissAriaLabel")}
                  onDismiss={() => {
                    setRouteState({
                      insightsReturnTab: null,
                      insightsReturnReviewId: null,
                    });
                  }}
                />
              ) : undefined
            }
            pathChip={
              analysisMode === "path" && pathChipLabel ? (
                <TopologyPathChip
                  label={pathChipLabel}
                  outcome={pathChipOutcome}
                  resolved={canCopyTopologyPathPacket(pathChipState)}
                  copyPacketLabel={t("analysis.pathChipCopyPacket")}
                  copyPacketCopied={pathPacketCopied}
                  copyPacketAriaLabel={t("analysis.pathChipCopyPacketAriaLabel")}
                  copyPacketCopiedAriaLabel={t(
                    "analysis.pathChipCopyPacketCopiedAriaLabel",
                  )}
                  onCopyPacket={copyPathPacket}
                  clearAriaLabel={t("analysis.pathChipClear")}
                  onClear={handleClearPath}
                />
              ) : undefined
            }
            trailChip={
              // Appears from one visit: the handoff packet and the way back matter most right
              // after the first node.
              footprintTrailEntries.length >= 1 ? (
                <TopologyTrailChip
                  label={t("footprint.chipLabel", { count: footprintTrailEntries.length })}
                  compactLabel={String(footprintTrailEntries.length)}
                  entries={footprintTrailEntries}
                  stepCaptions={footprintTrailStepCaptions}
                  currentId={canvasSelectedSlug}
                  copied={footprintPacketCopied}
                  onFocusEntry={(id) => handleSelect(id)}
                  onCopyPacket={copyFootprintPacket}
                  onClear={clearFootprintTrail}
                  onLensChange={handleFootprintLens}
                  onHoverEntry={handleFootprintBrush}
                  pastWalks={pastWalkRows}
                  pastNotice={pastTrailNotice}
                  onReplayPastWalk={handleReplayPastWalk}
                  onDeletePastWalk={handleDeletePastWalk}
                  onClearPastWalks={handleClearPastWalks}
                  labels={{
                    heading: t("footprint.heading"),
                    triggerAriaLabel: t("footprint.triggerAriaLabel"),
                    currentLabel: t("footprint.currentLabel"),
                    justNowLabel: t("footprint.justNowLabel"),
                    stepsAgoLabel: (count) => t("footprint.stepsAgoLabel", { count }),
                    rowAriaLabel: (title) => t("footprint.rowAriaLabel", { title }),
                    stepUnrelatedLabel: t("footprint.stepUnrelated"),
                    copyLabel: t("footprint.copyLabel"),
                    copyAriaLabel: t("footprint.copyAriaLabel"),
                    copyCopiedAriaLabel: t("footprint.copyCopiedAriaLabel"),
                    clearLabel: t("footprint.clearLabel"),
                    clearConfirmLabel: t("footprint.clearConfirmLabel"),
                    clearAriaLabel: t("footprint.clearAriaLabel"),
                    pastLinkLabel: t("footprint.pastLinkLabel", {
                      count: pastWalkRows.length,
                    }),
                    pastHeading: t("footprint.pastHeading"),
                    pastBackAriaLabel: t("footprint.pastBackAriaLabel"),
                    pastDeleteAriaLabel: t("footprint.pastDeleteAriaLabel"),
                    pastClearAllLabel: t("footprint.pastClearAllLabel"),
                    pastClearAllConfirmLabel: t("footprint.pastClearAllConfirmLabel"),
                    pastCapCaption: t("footprint.pastCapCaption"),
                    pastEmptyBody: t("footprint.pastEmptyBody"),
                  }}
                />
              ) : undefined
            }
          />
          {inspectorOwnsRightRail ? null : (
              <div
                // Below `md` the lane retreats under the INDEX sheet; `[data-chip-label]` steps
                // shrink labels at `max-xl` / `max-2xl`. `topology-top-toolbar` owns position and
                // scale.
                className={`pointer-events-auto shrink-0 flex-col items-end gap-2 xl:ml-auto ${renderedIndexState === "expanded" ? "hidden md:flex" : "flex"}`}
                data-phone-sheet-utility-contract={
                  renderedIndexState === "expanded"
                    ? "hidden-below-md-while-index-sheet-owns-surface"
                    : undefined
                }
                data-testid="topology-utility-action-lane"
                data-utility-lane-density={
                  topologyUtilityChromeCompact ? "compact-focus" : "default"
                }
                data-utility-lane-contract={
                  topologyUtilityChromeCompact
                    ? "icon-first-focus-utility"
                    : "labeled-map-utility"
                }
                data-utility-lane-surface-token="--topology-utility-lane-surface"
                data-utility-lane-border-token="--topology-utility-lane-border"
                data-utility-lane-shadow-token="--topology-utility-lane-shadow"
              >
                <div
                  className="relative flex items-center gap-[var(--topology-utility-lane-gap)]"
                  data-testid="topology-utility-action-row"
                >
                  {/* ScanSearch, not HelpCircle: this opens the meaning workbench, and the question
                     mark means the shortcut sheet.
                     Gate: tests/contract/map-chrome-icon-roles.contract.test.ts */}
                  <ChromeChip
                    icon={<ScanSearch />}
                    aria-label={tWorkbench('meaningTitle')}
                    title={tWorkbench('meaningTitle')}
                    active={meaningWorkbenchOpen}
                    aria-pressed={meaningWorkbenchOpen}
                    compact={topologyUtilityChromeCompact || searchLaneCrowded}
                    data-testid="topology-meaning-workbench-toggle"
                    onClick={toggleMeaningWorkbench}
                  >{tWorkbench('meaningTitle')}</ChromeChip>
                  {/* The name comes only from `vaultAgentPanel.title`, shared by chip, tooltip,
                     aria and panel header.
                     Desktop only: the web has no safe place for the key, so no door that will not
                     open. */}
                  {llmBridgeAvailable ? (
                    <Tooltip content={tAgent('title')} side="bottom" withProvider={false}>
                      <ChromeChip
                        // The press closes what it opened, matching the review chip beside it.
                        onClick={() => {
                          agentDockTouchedRef.current = true;
                          if (agentDockOpen) {
                            closeVaultAgent();
                            return;
                          }
                          openVaultAgent();
                        }}
                        aria-label={tAgent('title')}
                        aria-expanded={agentDockOpen}
                        // A close hands focus back here through it.
                        aria-controls={VAULT_AGENT_PANEL_ID}
                        data-testid="topology-vault-agent-toggle"
                        active={agentDockOpen}
                        compact={topologyUtilityChromeCompact}
                        icon={<MessageCircle />}
                      >
                        {tAgent('title')}
                      </ChromeChip>
                    </Tooltip>
                  ) : null}
                  {/* Survives dismissing the first-run card; visible only in sample mode. */}
                  {sampleModeSettled ? (
                    <Tooltip content={t('controls.switchToMyDataTooltip')} side="bottom" withProvider={false}>
                      <ChromeChip
                        onClick={requestVaultOpen}
                        aria-label={`${t('controls.switchToMyDataLabel')} — ${t('controls.switchToMyDataAriaLabel')}`}
                        data-testid="topology-switch-to-my-data"
                        data-utility-action-token-contract="support-surface-family"
                        data-utility-action-surface-token="--chrome-surface"
                        data-utility-action-border-token="--chrome-border"
                        data-utility-action-shadow-token="--chrome-shadow"
                        data-utility-action-focus-ring-token="--color-indigo-accent"
                        compact={topologyUtilityChromeCompact}
                        icon={<FolderOpen className="text-[color:var(--color-indigo-accent)]" />}
                        kbd="⌘O"
                        // Below `2xl` the kbd folds and below `xl` the label, leaving an icon;
                        // aria-label and tooltip keep the meaning.
                        // `CHIP_COMPACT_BOX` is `ChromeChip`'s own compact box, so icon-only
                        // controls share one size.
                        className={`max-2xl:[&_[data-chip-kbd]]:hidden max-xl:[&_[data-chip-label]]:hidden ${CHROME_CHIP_COMPACT_BELOW_XL}`}
                      >
                        {t('controls.switchToMyDataLabel')}
                      </ChromeChip>
                    </Tooltip>
                  ) : null}
                  {/* State lives in `?recent=`, so a shared link reproduces it. */}
                  <Tooltip
                    // The sample is decided first: before a folder opens the press opens folder
                    // guidance, and the tooltip says so.
                    // Zero recent changes in a user's folder is disabled with its reason, never a
                    // popup. `{days}` is the real window.
                    content={
                      vault.status !== 'loaded'
                        ? t('controls.spotlightSampleTooltip')
                        : spotlightOn || recentChanges.recentNodeIds.size > 0 || recentChanges.reading
                          ? t('controls.spotlightTooltip', { days: recentChanges.windowDays })
                          : t('controls.spotlightEmptyTooltip')
                    }
                    side="bottom"
                    withProvider={false}
                  >
                    <ChromeChip
                      onClick={handleToggleSpotlight}
                      // Disabled only when off with zero highlights in a user's folder once Git
                      // has dated documents:
                      // never a popup for an absence and never hidden, since a vanished control
                      // reads as a missing feature.
                      // On the sample it stays pressable and opens folder guidance.
                      disabled={
                        !spotlightNeedsVault &&
                        !spotlightOn &&
                        !recentChanges.reading &&
                        recentChanges.recentNodeIds.size === 0
                      }
                      aria-pressed={spotlightOn}
                      aria-label={t('controls.spotlightAriaLabel')}
                      data-testid="topology-spotlight-toggle"
                      data-utility-action-token-contract="support-surface-family"
                      data-utility-action-surface-token="--chrome-surface"
                      data-utility-action-border-token="--chrome-border"
                      data-utility-action-hover-surface-token="--color-overlay-2"
                      data-utility-action-active-surface-token="--chrome-active-surface"
                      data-utility-action-active-border-token="--chrome-active-border"
                      data-utility-action-shadow-token="--chrome-shadow"
                      data-utility-action-focus-ring-token="--color-indigo-accent"
                      compact={topologyUtilityChromeCompact}
                      icon={<HistoryIcon />}
                      active={spotlightOn}
                      // Always named, as the only top-chrome place that speaks about change.
                      // Window and count ride a badge that survives every shrink step;
                      // aria-label and title keep the window.
                      badge={
                        spotlightOn ? (
                          <span
                            aria-live="polite"
                            data-testid="topology-spotlight-window-summary"
                            data-utility-count-badge="spotlight-recent"
                            data-surface-token="--topology-utility-lane-count-surface"
                            data-text-token="--topology-utility-lane-count-text"
                            className="inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-[color:var(--topology-utility-lane-count-surface)] px-1.5 font-mono text-label tabular-nums text-[color:var(--topology-utility-lane-count-text)]"
                            // No count while Git is still dating documents.
                            aria-label={
                              recentChanges.reading
                                ? undefined
                                : t('controls.spotlightWindowSummary', {
                                    days: recentChanges.windowDays,
                                    count: recentChanges.recentNodeIds.size,
                                  })
                            }
                            title={
                              recentChanges.reading
                                ? undefined
                                : t('controls.spotlightWindowSummary', {
                                    days: recentChanges.windowDays,
                                    count: recentChanges.recentNodeIds.size,
                                  })
                            }
                          >
                            {recentChanges.reading ? null : recentChanges.recentNodeIds.size}
                          </span>
                        ) : null
                      }
                    >
                      {t('controls.spotlightLabel')}
                    </ChromeChip>
                  </Tooltip>
                  {/* Below `lg` this tile leads to the same history destination the rail owns
                     at `lg+`, for every audience. */}
                  {(
                    <Link
                      href="/git/"
                      aria-label={tAtlasGit('tileLabel')}
                      title={tAtlasGit('tileLabel')}
                      data-testid="topology-git-lg-tile"
                      className="relative lg:hidden flex size-[var(--chrome-tile-size)] items-center justify-center rounded-[var(--chrome-radius)] border border-[color:var(--chrome-border)] bg-[color:var(--chrome-surface)] text-[color:var(--color-text-tertiary)] shadow-[var(--chrome-shadow)] transition-colors hover:border-[color:var(--color-border-strong)] hover:bg-[color:var(--color-overlay-2)] hover:text-[color:var(--color-text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--color-indigo-accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[color:var(--color-canvas)]"
                    >
                      <HistoryIcon className="size-[var(--topology-chrome-icon-size)]" aria-hidden />
                      {ontologyChangeset.touchedNodeIds.size > 0 ? (
                        <span
                          aria-hidden="true"
                          data-testid="topology-git-lg-tile-dot"
                          className="absolute right-1.5 top-1 h-1.5 w-1.5 rounded-full bg-[color:var(--color-status-warning)]"
                        />
                      ) : null}
                    </Link>
                  )}
                  {/* Below `lg` the rail is gone, so the same settings sheet opens from here. */}
                  <div className="lg:hidden">
                    <AppSettingsMenu
                      mode={vault.status === 'loaded' ? 'local' : 'static'}
                      triggerVariant="chrome-tile"
                      screenControls={{
                        audiencePlain,
                        onAudiencePlainChange: setAudiencePlain,
                        indexCollapsed: indexPanelCollapsedStored,
                        onIndexCollapsedChange: handleChangeIndexDefaultCollapsed,
                      }}
                    />
                  </div>
                  {/* Work status is the bell's left segment; one component owns both feeds, outside
                     click and Escape. */}
                  <CompanionHome compact />
                  <AgentActivityChip
                    // Recedes for a datasheet, but not from under an open notification panel:
                    // pressing a row there focuses its node, which raises the datasheet.
                    suppressed={
                      (Boolean(v2DatasheetModel) || selectedEdgeOwnsRightRail) && !activityInboxOpen
                    }
                    liveWork={acpLiveWork}
                    conversationOpen={agentDockOpen}
                    compact={topologyUtilityChromeCompact}
                    onOpenChange={setActivityInboxOpen}
                    onOpenNode={handleSelect}
                    onOpenConversation={openVaultAgent}
                  />
                </div>
              </div>
          )}
          </div>
        </>
      ) : null}
    </div>
  </>);
}
