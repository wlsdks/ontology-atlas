import { buildOntologyInsightsReturnHref } from "@/entities/knowledge-graph";
import { AgentActivityChip, CompanionHome } from "@/features/agent-activity";
import { buildConstellationAgentPrompt } from "@/features/saved-constellations";
import { Link } from "@/i18n/navigation";
import { writeGalaxy, writeView3d } from "@/shared/lib/appearance-preferences";
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
import { canCopyTopologyPathPacket } from "../lib/topology-path-chip-state";
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
  const { handleToggleExpandAll, pathChipLabel, pathChipState, pathPacketCopied, copyPathPacket, handleClearPath } = topologySceneControls;
  const { handleExitRealm, indexPanelCollapsedStored, handleChangeIndexDefaultCollapsed } = topologyRouteControls;
  const { handleSelect, handleReplayPastWalk } = topologyNavigationActions;
  const { meaningWorkbenchOpen, toggleMeaningWorkbench } = homeWorkbenchController;
  const { acpLiveWork } = topologyAgentActivity;

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
          // The utility action lane on the right (absolute `right-4`, content
          // about 236px wide) and this brand label are separate absolute
          // overlays, so `flex-wrap` cannot push them apart. The narrower the
          // viewport (below 390px) the further left the lane starts, so the gap
          // is held by a vw-based calc rather than a fixed px value, keeping
          // overlap at zero.
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
    {/* The top-left brand/workspace pill is retired for good (owner
                instruction, 2026-07-24). A leftover `drawerOpen` condition had been
                reviving it on every node click. Selection is carried by the popover and
                the ring, reopening INDEX by the vertical tab, and project navigation by
                the rail — duplicate ink, so the mount itself is gone. */}
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
          {/* Mobile-only settings escape hatch: the utility lane is hidden while the
              expanded INDEX owns the <md surface. */}
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
            /*
             * **One toolbar, one box** (owner report, 2026-09-24, installed app at
             * 1512x949 with the meaning-review panel open): the search lane and the
             * utility lane were two absolute overlays, one centred on the map and one
             * pinned to its right edge, and neither knew the other's width. Once the
             * panel took 430px of the map, the centred lane ran into the utility lane
             * and eight tiles were painted over one another.
             *
             * Both lanes are now items of this one flex box. Below `xl` they stack
             * at the right (utility on top, search 16px under it, the rhythm the two
             * absolute boxes used to fake). From `xl` they share one row while both
             * fit at their natural width: the search lane holds the left edge and the
             * utility lane the right, so the row spans the free map. When they do not
             * fit, `flex-wrap-reverse` puts the search lane on its own line under the
             * utility lane, where it has the whole width and its status chips
             * truncate before any tile gives up its box. Measured at 1280 with the
             * review panel open and a path: one line would have left the path chip
             * 42px, the wrapped line gives it the full row.
             *
             * The box owns every horizontal reserve the lanes used to compute on
             * their own: the expanded INDEX on the left (from `md`, where the panel
             * floats over the map), the node inspector on the right from `xl`
             * (`app/globals.css`), and the shared seam beside an open agent dock
             * (the dock-adjacent rail attribute below). It also owns the one
             * `topology-ui-scale` zoom, so nothing inside scales twice.
             */
            className={cn(
              "@container/map-toolbar topology-ui-scale pointer-events-none absolute right-4 top-4 flex flex-col-reverse items-end gap-4 transition-[left,right] duration-[var(--agent-panel-reflow-duration)] ease-[var(--topology-motion-ease-out)] motion-reduce:transition-none md:right-6 md:top-6 xl:right-8 xl:top-8 xl:flex-row xl:flex-wrap-reverse xl:items-start",
              renderedIndexState === "expanded"
                ? "left-4 md:left-[calc(var(--topology-index-width)+var(--topology-index-inset)*2)]"
                : "left-4 md:left-6 xl:left-8",
              // The agent activity status is a segment of the bell inside the utility
              // row (2026-09-24), so it takes part in this box's own wrap and needs no
              // second-line reserve. The reserve that measured a caption hanging under
              // the bell and hid it when the lane did not fit is gone: once the status
              // joined the row, hiding it shrank the row, which let the lane fit, which
              // showed it again, and the row never settled.
              activityInboxOpen ? "z-30" : "z-20",
            )}
            data-testid="topology-top-toolbar"
            // The free map, as far as a popover hanging from this row is concerned: the box
            // already reserves INDEX, the node inspector and the dock seam, so anything that
            // opens from a lane clamps to it (`SavedConstellationsControl`).
            data-popover-boundary="free-map"
            data-agent-dock-adjacent-rail="true"
            data-right-inspector-reserve={
              nodePanelMounted ? "recenter-in-remaining-map" : undefined
            }
            data-left-index-reserve={
              renderedIndexState === "expanded" ? "recenter-in-remaining-map" : undefined
            }
          >
          <SearchHint
            // No auto margin: from `xl` this lane holds the box's left edge, which is
            // the free map's left edge (INDEX's right edge plus one inset, or one inset
            // past the collapsed tab), and the utility lane's `ml-auto` holds the right.
            // Centred in what the utility lane left over, both lanes sat in the map's
            // right half with INDEX open (owner report, 2026-09-24: search at 647-859
            // and utility at 1110-1480 over a free map of 388-1512). It stays at the
            // left while the node inspector owns the right rail, so selecting a node
            // does not move it. Gate: tests/e2e/map-toolbar-balance.spec.ts
            density={topologyUtilityChromeCompact || searchLaneCrowded ? "compact-focus" : "default"}
            phoneFocusSuppressed={selectedNodeFocusActive}
            constellationControl={(
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
            )}
            // <md expanded INDEX is a full-bleed sheet — while the sheet is the main surface,
            // the top chrome column is demoted (overlap eradication 2026-07-23, completion of rank7 sheet
            // syntax). Same contract as utility lane's hidden md:flex.
            phoneSheetSuppressed={renderedIndexState === "expanded"}
            onOpenSearch={() => {
              setOntologySearchOpen(true);
            }}
            onRelayout={() => {
              setTopologyRelayoutToken((current) => current + 1);
              toast.show(t('controls.relayoutToast'), "info");
            }}
            // Galaxy always renders every real concept so its stellar
            // neighborhoods are complete. Hide the Flat expansion
            // action rather than showing a control with no effect.
            onToggleExpandAll={galaxy ? undefined : handleToggleExpandAll}
            allExpanded={expandAllActive}
            realmChip={
              resolvedRealmSlug && realmTitle ? (
                // On screen the feature is called "view only this" (owner
                // decision, 2026-07-23); "realm" stays as the internal name. The
                // `chipViewing` template is split on a sentinel so the text
                // before and after the title works in any locale.
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
                  compact={topologyUtilityChromeCompact || searchLaneCrowded}
                />
              ) : undefined
            }
            trailChip={
              /*
               * The trail chip appears **from one visit**. Owner, 2026-08-03:
               * *"Issue where the trail does not appear at the top when only one node is viewed."* (when
               * you have only looked at one node, the trail does not appear).
               *
               * The threshold used to be 2, on the reasoning that a trail needs
               * at least two points. But what this chip actually provides is not
               * only a drawn trail: it is the **agent handoff packet** and the
               * **door back**. Both have value at one visit — and the moment
               * right after opening a first node is exactly when "I want to hand
               * this to the AI" is strongest. A threshold of 2 meant the door
               * was missing precisely then.
               */
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
                // Overlap sweep, 2026-07-23. ① Below `md`, while the expanded
                // INDEX is a full-bleed sheet, the whole lane retreats — 8px of
                // chip used to poke above the sheet's 24px top inset. ② Per-chip
                // labels shrink through the `max-xl` / `max-2xl`
                // `[data-chip-label]` steps below: 499px of combined label was
                // what overlapped the centre search lane and the expanded INDEX
                // between 768 and 1365. ③ Since 2026-09-24 this is a grid item of
                // `topology-top-toolbar`, which owns position and scale.
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
                  {/* ScanSearch, not HelpCircle: this chip opens the meaning workbench, which is
                        not help. Measured on the installed app 2026-09-09 — the same circled question
                        mark sat here and two slots down on the support rail, where it really is the
                        shortcut sheet, so one glyph carried a product action and a help sheet on one
                        screen. MessageCircle was not free either; the Agent chip next to it owns that.
                        The node panel's primary button for the same action moved to the same glyph.
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
                  {/* 「Agent」 — This button's spot is the moment you go from viewing a map to saying "fix this."
                        It uses the same chip spec as the existing utility lane without creating a rail destination or new route (zero surface addition).
                        The name is defined in **only one place**: `vaultAgentPanel.title` —
                        since the chip, tooltip, aria, and panel header all read the same key, changing the name
                        changes all four places together (the name may be reviewed again).
                        Desktop only: on the web there is no safe place to put the key nor a path to send it,
                        so we do not draw a door that will not open. */}
                  {llmBridgeAvailable ? (
                    <Tooltip content={tAgent('title')} side="bottom" withProvider={false}>
                      <ChromeChip
                        /*
                         * The press closes what it opened. It used to call
                         * `openVaultAgent` only, so a chip wearing the active
                         * tone and reporting `aria-expanded="true"` ignored
                         * every press after the first: measured 2026-09-20
                         * with a folder open at 1512, the second and third
                         * presses left the state true and the map's canvas at
                         * 1055 of 1448. The dock keeps its own close button;
                         * this is the one a person reaches for after opening
                         * it here, and it matches the review chip beside it.
                         */
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
                        data-testid="topology-vault-agent-toggle"
                        active={agentDockOpen}
                        compact={topologyUtilityChromeCompact}
                        icon={<MessageCircle />}
                      >
                        {tAgent('title')}
                      </ChromeChip>
                    </Tooltip>
                  ) : null}
                  {/* The permanent "switch to my data" entry point that survives
                        dismissing the first-run card. Visible only in static sample mode
                        (independent of the card) and gone once a real vault is
                        connected. Standard chrome-tile spec, a quiet support surface. */}
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
                        // Lane shrink steps: below `2xl` the kbd cap folds away
                        // (mirroring the search chip's existing ⌘K rule), below `xl`
                        // the label folds too and it becomes icon-only. This chip's
                        // 225px of label + kbd was the main cause of overlap with the
                        // centre search lane and the expanded INDEX between 768 and
                        // 1365 (measured: 35px intrusion at 1280). The aria-label and
                        // tooltip preserve the meaning, and the first-run card's CTA
                        // exposes the same action with a permanent label.
                        // ⚠️ The width half of the fold is **not optional** (2026-09-05
                        // audit, F15). Hiding the label alone left `px-3.5` around a
                        // 16px icon, so below `xl` this chip measured **44×36** while
                        // every other icon-only control in the same lane measured
                        // 36×36 — one role, two sizes, and the difference recorded
                        // only which file collapsed it. `CHIP_COMPACT_BOX` is the same
                        // box `ChromeChip`'s own `compact` prop applies; the two paths
                        // now end in the same rectangle.
                        className={`max-2xl:[&_[data-chip-kbd]]:hidden max-xl:[&_[data-chip-label]]:hidden ${CHROME_CHIP_COMPACT_BELOW_XL}`}
                      >
                        {t('controls.switchToMyDataLabel')}
                      </ChromeChip>
                    </Tooltip>
                  ) : null}
                  {/* The recent-changes spotlight lens toggle. Its state lives in the
                        URL as `?recent=`, which is what makes a shared link and an
                        agent's reproduction show the same thing. */}
                  <Tooltip
                    /*
                     * Why three branches. Owner, 2026-08-03: *"Why does nothing happen when I press 'recent changes'?"*
                     * (pressing "recent changes" does
                     * nothing).
                     *
                     * The empty-state text used to be one line — "edit a document and
                     * we will point it out here" — which, to someone looking at the
                     * sample, presumes **there is a document of theirs to edit**. The
                     * real reason is different: the sample's dates are whenever this
                     * repo last touched those fixtures, which has nothing to do with
                     * the user, so this feature **cannot mean anything before a folder
                     * is opened**. A different reason needs a different sentence.
                     *
                     * No popup. Opening a modal to say "there is nothing" makes the
                     * person who pressed do the work twice, and it is the category this
                     * repo forbids as popup soup (the 2026-08-02 decision in the chip
                     * comment below still stands). Instead, **disabled now looks
                     * disabled** — its not doing so was why people only found out by
                     * pressing (`chrome-chip.tsx`, `DISABLED_CLASS`).
                     */
                    content={
                      spotlightOn || recentChanges.recentNodeIds.size > 0
                        ? t('controls.spotlightTooltip')
                        : vault.status === 'loaded'
                          ? t('controls.spotlightEmptyTooltip')
                          : t('controls.spotlightSampleTooltip')
                    }
                    side="bottom"
                    withProvider={false}
                  >
                    <ChromeChip
                      onClick={handleToggleSpotlight}
                      /*
                                                                   * With nothing changed it **cannot be pressed**. Owner,
                                                                   * 2026-08-02: *"If there are no changes, shouldn't we just disable the button click?
                                                                   * Or have pressing it pop up 'nothing changed'?"*
                                                                   * (when there are no changes, just disable the button — or have
                                                                   * pressing it pop up "nothing changed").
                                                                   *
                                                                   * The popup option was not taken: opening a modal to state an
                                                                   * absence makes the person who pressed do the work twice, and it
                                                                   * is the category this repo forbids as popup soup.
                                                                   *
                                                                   * **Nor is it hidden.** Disappearing turns it into "was there a
                                                                   * recent-changes feature?", a problem already hit in this very
                                                                   * session (an unlabelled icon nobody could find). The place stays
                                                                   * and the tooltip gives the reason — the same discipline as
                                                                   * `BlockImportModule`'s "keep it disabled with a hint, never
                                                                   * conceal it".
                                                                   *
                                                                   * While it is on it must remain **switchable off**, so it is
                                                                   * disabled only when off with zero highlights.
                                                                   *
                                                                   * On the sample it is **not disabled** — pressing it opens the
                                                                   * folder guidance. Disabled is only for "my folder is open and
                                                                   * there are no recent changes", where there really is nothing to
                                                                   * show.
                                                                   */
                      disabled={
                        !spotlightNeedsVault && !spotlightOn && recentChanges.recentNodeIds.size === 0
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
                      /*
                                                                   * The name is **always** shown. Owner, 2026-08-02: *"Where is the 'recent
                                                                   * changes' button? There isn't one."* (where is the "recent
                                                                   * changes" button? there isn't one).
                                                                   *
                                                                   * The previous `max-2xl` **hid the label below 1536px**, while
                                                                   * its neighbours hide theirs below 1280px — so in a 1512px window
                                                                   * **this one button alone** lost its name and became an
                                                                   * unlabelled clock icon. Of course it could not be found.
                                                                   *
                                                                   * This chip has since absorbed what the old "N changes" button
                                                                   * did, making it the **only place in the top chrome that speaks
                                                                   * about change**. That place has no business standing unnamed.
                                                                   *
                                                                   * The window and count are carried as a badge inside the chip
                                                                   * rather than the unlabelled mono text that used to float in the
                                                                   * lane (same grammar and tokens as the docs chip's pinned-count
                                                                   * badge). The INDEX segment already shows the same "last N days ·
                                                                   * count", so a duplicate string went away too, and the badge
                                                                   * survives every compact/shrink step, so the count is visible
                                                                   * even below `xl`. The window itself is preserved in the
                                                                   * aria-label and title.
                                                                   */
                      badge={
                        spotlightOn ? (
                          <span
                            aria-live="polite"
                            data-testid="topology-spotlight-window-summary"
                            data-utility-count-badge="spotlight-recent"
                            data-surface-token="--topology-utility-lane-count-surface"
                            data-text-token="--topology-utility-lane-count-text"
                            className="inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-[color:var(--topology-utility-lane-count-surface)] px-1.5 font-mono text-label tabular-nums text-[color:var(--topology-utility-lane-count-text)]"
                            aria-label={t('controls.spotlightWindowSummary', {
                              days: recentChanges.windowDays,
                              count: recentChanges.recentNodeIds.size,
                            })}
                            title={t('controls.spotlightWindowSummary', {
                              days: recentChanges.windowDays,
                              count: recentChanges.recentNodeIds.size,
                            })}
                          >
                            {recentChanges.recentNodeIds.size}
                          </span>
                        ) : null
                      }
                    >
                      {t('controls.spotlightLabel')}
                    </ChromeChip>
                  </Tooltip>
                  {/*
                      ⚠️ Two chips were removed from this lane (2026-08-03), under one
                      adopted rule: **a chip over the map earns its place only if it
                      changes the map.**

                      ① The workspace chip (PO council verdict; owner: *"Isn't this just the docs
                      entry in the rail?"* — isn't this just the docs
                      entry in the rail?). It opened a drawer and never changed the map;
                      that is the rail's job. It also used **two different names inside
                      one control** — its label said one thing and its tooltip another —
                      while the rail already had a docs entry, so the same word appeared
                      twice on one screen. **The drawer still exists**: the `D` shortcut
                      (listed in the shortcut sheet) and the INDEX footer path both open
                      it. A chip was removed, not a surface. This was a rediscovery — the
                      old "N changes" button had been removed on 2026-08-02 for **the
                      same reason** (a round trip that changes no map state) — so the rule
                      itself was recorded in the ledger this time.

                      **The drawer still exists** — the `D` shortcut (listed in the shortcut sheet)
                      still opens it. We removed only a chip, not a surface.

                      This is a rediscovery: on 2026-08-02, "N changes" was already deleted for **the same reason**
                      (it does a round trip without changing map state). Without a rule,
                      we were discovering them one by one manually — so this time
                      we recorded the rule in the ledger.
                    */}
                  {/* The history entry point below `lg`. At `lg+` the rail destination
                        owns it; where the rail disappears this chrome tile leads to the
                        same destination, so a different breakpoint still reaches **the
                        same surface**.

                        2026-07-25: this tile used to open a 560px modal. When history was
                        promoted to a destination it became a link — if mobile alone saw a
                        modal, one feature would live on two surfaces. The `audiencePlain`
                        gate was removed with it: a destination is exposed to every
                        audience ("who changed what meaning, when" is information planners
                        and executives read, not developer work), and an entry-point count
                        that varies by audience is exactly the problem that consolidation
                        was meant to end. */}
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
                  {/* Settings entry point below `lg`. The nav rail is `lg+` only, so
                        below it there was no way to reach settings at all. The same
                        single settings sheet the rail slot opens is placed at the end of
                        the lane as a chrome-tile variant; the bottom tab bar's
                        five-destination contract is untouched. At `lg+` the rail's gear
                        owns it. */}
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
                  {/* Work status is the left segment of the bell's control, and the bell stands as the
                        last square tile of this row. The same component owns both feeds and
                        outside click/Escape to avoid duplicating polling/read state. */}
                  <CompanionHome compact />
                  <AgentActivityChip
                    /*
                     * The stack recedes for a datasheet — but not out from under an open
                     * notification panel. Pressing a result focuses that node on the map,
                     * which raises the datasheet, which used to unmount the bell mid-read:
                     * one press on the first of four unread rows and the other three had no
                     * door left (design-interaction, 2026-09-12).
                     */
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
