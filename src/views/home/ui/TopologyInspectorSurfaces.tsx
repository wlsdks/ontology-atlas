import type { useAcpRuntimeController } from "../model/use-acp-runtime-controller";
import type { useHomeWorkbenchController } from "../model/use-home-workbench-controller";
import type { useTopologyAgentOrchestration } from "../model/use-topology-agent-orchestration";
import type { useTopologyAuthoring } from "../model/use-topology-authoring";
import type { useTopologyCanvasFocus } from "../model/use-topology-canvas-focus";
import type { useTopologyCreateIntent } from "../model/use-topology-create-intent";
import type { useTopologyExplorationLenses } from "../model/use-topology-exploration-lenses";
import type { useTopologyGraphProjection } from "../model/use-topology-graph-projection";
import type { useTopologyInspectorState } from "../model/use-topology-inspector-state";
import type { useTopologyKeyboardTour } from "../model/use-topology-keyboard-tour";
import type { useTopologyNavigationActions } from "../model/use-topology-navigation-actions";
import type { useTopologyPreferences } from "../model/use-topology-preferences";
import type { useTopologyRouteControls } from "../model/use-topology-route-controls";
import type { useTopologySourceActions } from "../model/use-topology-source-actions";
import type { useTopologySourceReadiness } from "../model/use-topology-source-readiness";
import type { useTopologyVaultReadModel } from "../model/use-topology-vault-read-model";


import { daysBehind } from "@/entities/docs-vault";
import { MeaningEditorPanel } from "@/features/ontology-meaning-editor";
import { formatProjectSourceHandoff } from "@/shared/lib/project-source-receipt";
import { Surface, controlClass } from "@/shared/ui";
import { OntologyMapClusterHoverCard, OntologyMapContextMenu, OntologyMapDetailPanel, OntologyMapEdgeHoverCard, OntologyMapEdgePanel } from "@/widgets/ontology-map";
import { ProjectDrawer } from "@/widgets/project-drawer";
import { useTranslations } from "next-intl";
import { normalizeKindLabelKey } from "../lib/topology-node-significance";
import { returnFocusIfDropped } from "../lib/topology-focus-return";


interface TopologyInspectorSurfacesProps {
  projectsError: string | null;
  heldProjectsError: string | null;
  renderProjects: import("@/entities/project/model/types").Project[];
  impactMode: import("@/entities/project/model/insights").ProjectImpactMode;
  tEditProvenance: ReturnType<typeof useTranslations<"editProvenance">>;
  tSummaryFreshness: ReturnType<typeof useTranslations<"summaryFreshness">>;
  topologyRouteControls: Pick<ReturnType<typeof useTopologyRouteControls>, "handleEnterRealm">;
  acpRuntimeController: Pick<ReturnType<typeof useAcpRuntimeController>, "acpPresentationVisible">;
  homeWorkbenchController: Pick<ReturnType<typeof useHomeWorkbenchController>, "openMeaningWorkbench">;
  topologyAgentOrchestration: Pick<ReturnType<typeof useTopologyAgentOrchestration>, "askAgentAboutSelectedNode">;
  topologyGraphProjection: Pick<ReturnType<typeof useTopologyGraphProjection>, "canvasSelectedGraphNode" | "resolvedRealmSlug">;
  topologySourceActions: Pick<
    ReturnType<typeof useTopologySourceActions>,
    | "projectSourceLabels"
    | "copyV2NodeHandoff"
    | "projectSourceErrorLabel"
    | "projectSourceDegraded"
    | "projectSourceProposal"
    | "handleProjectSourceConfirmProposal"
    | "projectSourceNextActionAvailable"
    | "handleProjectSourceAction"
  >;
  topologySourceReadiness: Pick<ReturnType<typeof useTopologySourceReadiness>, "projectSource">;
  topologyVaultReadModel: Pick<
    ReturnType<typeof useTopologyVaultReadModel>,
    | "summaryFreshness"
    | "llmBridgeAvailable"
    | "setNeedsVaultReason"
    | "selectedOntologyNode"
  >;
  topologyCanvasFocus: Pick<
    ReturnType<typeof useTopologyCanvasFocus>,
    | "nodePopoverPositionerRef"
    | "detailCloseButtonRef"
    | "detailKeyboardTargetRef"
    | "handleDatasheetHoverConnection"
    | "handleDatasheetHoverEvidence"
    | "setFullDetailSlug"
    | "contextMenuNode"
    | "closeContextMenu"
    | "FullDetailCard"
    | "fullDetailOpen"
  >;
  topologyInspectorState: Pick<
    ReturnType<typeof useTopologyInspectorState>,
    | "nodePanelMounted"
    | "panelDatasheetModel"
    | "panelOpen"
    | "meaningEditorOpen"
    | "setNodePanelMounted"
    | "heldContextMenu"
    | "contextMenuModel"
    | "handleSetPathSource"
    | "heldFullDetailA1Model"
    | "fullDetailA1Model"
  >;
  topologyNavigationActions: Pick<ReturnType<typeof useTopologyNavigationActions>, "handleClose" | "handleSelect" | "handleDatasheetClose">;
  topologyKeyboardTour: Pick<ReturnType<typeof useTopologyKeyboardTour>, "handleSelectImpactMode">;
  topologyAuthoring: Pick<
    ReturnType<typeof useTopologyAuthoring>,
    | "createNodeOpen"
    | "setMeaningEditorState"
    | "meaningEditorSource"
    | "openMeaningEditor"
    | "canCreateNode"
    | "heldMeaningEditorState"
    | "meaningEditorCandidates"
    | "setMeaningPreview"
    | "applyMeaningEditor"
    | "closeMeaningEditor"
    | "hoverEdgeCardModel"
    | "selectedEdge"
    | "clusterHoverCardModel"
    | "heldEdgePanelModel"
    | "edgePanelOpen"
    | "setSelectedEdge"
  >;
  topologyPreferences: Pick<ReturnType<typeof useTopologyPreferences>, "t" | "tKinds" | "relationVocabulary" | "tWorkbench" | "audiencePlain">;
  topologyCreateIntent: Pick<ReturnType<typeof useTopologyCreateIntent>, "setCreateNodeSeedDomain" | "setCreateNodeDefaultKind" | "openCreateNode">;
  topologyExplorationLenses: Pick<ReturnType<typeof useTopologyExplorationLenses>, "drawerProject">;
}

export function TopologyInspectorSurfaces({
  projectsError, heldProjectsError, renderProjects, impactMode, tEditProvenance, tSummaryFreshness,
  topologyPreferences, topologyAuthoring, topologyKeyboardTour, topologyNavigationActions,
  topologyInspectorState, topologyCanvasFocus, topologyVaultReadModel, topologySourceReadiness,
  topologySourceActions, topologyGraphProjection, topologyAgentOrchestration, homeWorkbenchController,
  acpRuntimeController, topologyRouteControls, topologyExplorationLenses, topologyCreateIntent
}: TopologyInspectorSurfacesProps) {
  const { drawerProject } = topologyExplorationLenses;
  const { setCreateNodeSeedDomain, setCreateNodeDefaultKind, openCreateNode } = topologyCreateIntent;

  const { t, tKinds, relationVocabulary, tWorkbench, audiencePlain } = topologyPreferences;
  const {
    createNodeOpen, setMeaningEditorState, meaningEditorSource, openMeaningEditor, canCreateNode,
    heldMeaningEditorState, meaningEditorCandidates, setMeaningPreview, applyMeaningEditor,
    closeMeaningEditor, hoverEdgeCardModel, selectedEdge, clusterHoverCardModel, heldEdgePanelModel,
    edgePanelOpen, setSelectedEdge
  } = topologyAuthoring;
  const { handleSelectImpactMode } = topologyKeyboardTour;
  const { handleClose, handleSelect, handleDatasheetClose } = topologyNavigationActions;
  const {
    nodePanelMounted, panelDatasheetModel, panelOpen, meaningEditorOpen, setNodePanelMounted, heldContextMenu,
    contextMenuModel, handleSetPathSource, heldFullDetailA1Model, fullDetailA1Model
  } = topologyInspectorState;
  const {
    nodePopoverPositionerRef, detailCloseButtonRef, detailKeyboardTargetRef, handleDatasheetHoverConnection,
    handleDatasheetHoverEvidence, setFullDetailSlug, contextMenuNode, closeContextMenu, FullDetailCard,
    fullDetailOpen
  } = topologyCanvasFocus;
  const { summaryFreshness, llmBridgeAvailable, setNeedsVaultReason, selectedOntologyNode } = topologyVaultReadModel;
  const { projectSource } = topologySourceReadiness;
  const {
    projectSourceLabels, copyV2NodeHandoff, projectSourceErrorLabel, projectSourceDegraded,
    projectSourceProposal, handleProjectSourceConfirmProposal, projectSourceNextActionAvailable,
    handleProjectSourceAction
  } = topologySourceActions;
  const { canvasSelectedGraphNode, resolvedRealmSlug } = topologyGraphProjection;
  const { askAgentAboutSelectedNode } = topologyAgentOrchestration;
  const { openMeaningWorkbench } = homeWorkbenchController;
  const { acpPresentationVisible } = acpRuntimeController;
  const { handleEnterRealm } = topologyRouteControls;

  return (<>
    <Surface
      open={Boolean(projectsError)}
      origin="top center"
      role="alert"
      className="pointer-events-auto absolute left-1/2 top-[52px] z-40 flex -translate-x-1/2 items-center gap-3 rounded-full border border-[color:var(--color-danger-a32)] bg-[color:var(--color-surface-deep-a98)] px-4 py-2 text-body text-[color:var(--color-text-primary)] shadow-[var(--shadow-elevation-1)]"
    >
      <span className="font-mono text-label uppercase tracking-[var(--tracking-caps-16)] text-[color:var(--color-danger-text)]">
        Error
      </span>
      <span>{heldProjectsError}</span>
      <button
        type="button"
        onClick={() => {
          if (typeof window !== "undefined") window.location.reload();
        }}
        className={controlClass({
          shape: "pill",
          size: "sm",
          className:
            "ml-2 font-mono uppercase tracking-[var(--tracking-caps-14)] hover:bg-[color:var(--color-overlay-2)] hover:text-[color:var(--color-text-primary)]",
        })}
      >
        {t('errorBanner.retry')}
      </button>
    </Surface>
    {!createNodeOpen ? (
      <ProjectDrawer
        project={drawerProject}
        allProjects={renderProjects}
        activeProjectId={null}
        impactMode={impactMode}
        onChangeImpactMode={handleSelectImpactMode}
        onClose={handleClose}
        onSelectProject={(slug) =>
          handleSelect(slug, { preserveImpact: impactMode !== "none" })
        }
        containerLabel={null}
      />
    ) : null}
    {/* Presence gate: even after `panelOpen` goes false, this stays mounted until the
            exit animation finishes (~140 ms), drawing the same content from the retained
            `panelDatasheetModel` as it folds away. The window belongs to the `<Surface>`
            inside the panel; this gate only takes the positioner down when that surface
            reports `onExited`. */}
    {nodePanelMounted && panelDatasheetModel ? (
      <div
        ref={nodePopoverPositionerRef}
        data-testid="topology-node-popover-positioner"
        data-topology-camera-obstacle="side-panel"
        data-position-contract="selected-inspector-aligns-to-right-inset"
        data-fixed-surface-role="selected-node-inspector"
        data-fixed-surface-measure-target="topology-node-popover"
        data-selected-inspector-overlap-contract="fixed-surface-hides-overlapping-map-cards"
        data-selected-inspector-gutter-contract="no-phantom-utility-rail"
        data-position-top-token="--topology-node-popover-top"
        data-position-right-inset-token="--topology-node-popover-right-inset"
        // `topology-ui-scale` is a plain CSS class, not a Tailwind variant, so it is
        // always applied (zoom 1 by default, real zoom only at ≥1920px / ≥2400px). It
        // must scale at the same ratio as the brand pill or the clearance against
        // `--topology-index-top` stops holding at those widths.
        /*
         * `<lg` this is a **bottom sheet**, not a top-anchored full-bleed one
         * (2026-09-05 audit, F1/F4/F5). Three things changed together and they
         * are one decision:
         *
         * ① `bottom-…` instead of `top-[72px]`. Anchored to the top, the sheet
         *    grew downward with its content — measured 366×691 at 390×844, 76.8%
         *    of the canvas with 93 of 125 nodes under it, and at taller content it
         *    ran 41px past the bottom tab bar and took its own primary action out
         *    of reach. Anchored to the bottom above
         *    `--map-panel-bottom-reserve` (which already carries the tab
         *    bar plus safe area below `lg`) the footer cannot reach the bar, and
         *    the height cap on `--map-inspector-max-height` decides the
         *    top edge, so the ego graph stays on screen above it. That cap is the
         *    inspector's alone — the meaning editor shares this positioner and
         *    keeps the full `--map-panel-max-height`, because a form must
         *    be able to show its own submit row.
         * ② `pointer-events-none` here with `pointer-events-auto` on the painted
         *    child. This element is a positioning wrapper: at 834 it measured
         *    810px wide while only 520px painted, so 290px of the map answered
         *    taps as if it were the sheet.
         * ③ The camera obstacle marker stays — `computeFreeArea` now reads the
         *    measured width first and treats a full-width declaration as the bar
         *    it is, so the same attribute means «right panel» at `lg` and «bottom
         *    sheet» below it without a second marker.
         */
        className="topology-ui-scale pointer-events-none fixed inset-x-3 bottom-[var(--map-panel-bottom-reserve)] z-30 flex justify-center lg:inset-x-auto lg:bottom-auto lg:right-[var(--topology-node-popover-right-inset)] lg:top-[var(--topology-node-popover-top)] lg:block"
      >
        <div className="pointer-events-none grid">
          {panelDatasheetModel ? (
            <OntologyMapDetailPanel
              closeButtonRef={detailCloseButtonRef}
              key={panelDatasheetModel.slug}
              open={panelOpen}
              onExited={() => {
                if (!meaningEditorOpen) setNodePanelMounted(false);
              }}
              nodeId={panelDatasheetModel.nodeId}
              slug={panelDatasheetModel.slug}
              title={panelDatasheetModel.title}
              sourceTitle={panelDatasheetModel.sourceTitle}
              kind={panelDatasheetModel.kind}
              domain={panelDatasheetModel.domain}
              powered={panelDatasheetModel.powered}
              summaryStaleness={
                summaryFreshness.has(panelDatasheetModel.slug)
                  ? { behindByDays: daysBehind(summaryFreshness.get(panelDatasheetModel.slug)!) }
                  : null
              }
              groups={panelDatasheetModel.groups}
              evidence={panelDatasheetModel.evidence}
              codeLocations={panelDatasheetModel.codeLocations}
              updatedAtLabel={panelDatasheetModel.updatedAtLabel}
              lastEditSubject={panelDatasheetModel.lastEditSubject}
              mtimeConflict={panelDatasheetModel.mtimeConflict}
              handoffText={projectSource.view
                ? `${panelDatasheetModel.handoffText}\n\n${formatProjectSourceHandoff(projectSource.view)}`
                : panelDatasheetModel.handoffText}
              documentHref={panelDatasheetModel.documentHref}
              meaningEditHref={panelDatasheetModel.meaningEditHref}
              labels={{
                kindLabel: tKinds(normalizeKindLabelKey(panelDatasheetModel.kind)),
                domainLabel: t("nodeDatasheet.domainLabel"),
                poweredOn: t("nodeDatasheet.poweredOn"),
                poweredOff: t("nodeDatasheet.poweredOff"),
                // `usedBy` aggregates a direction rather than one relation type, so it
                // keeps its own i18n key. `contains`, `dependsOn`, `belongsTo`, and
                // `evidence` map 1:1 onto relation types and come from the shared
                // vocabulary's plain register, so the map, the editor, and this panel
                // manage the same word in one place. The wording is unchanged; the point
                // is preventing drift.
                metricContains: relationVocabulary("contains", "plain"),
                containsShowAll: t("nodeDatasheet.containsShowAll"),
                groupShowMore: t("nodeDatasheet.groupShowMore"),
                groupShowFewer: t("nodeDatasheet.groupShowFewer"),
                containsShowSummary: t("nodeDatasheet.containsShowSummary"),
                containsOtherGroup: t("nodeDatasheet.containsOtherGroup"),
                metricUsedBy: t("nodeDatasheet.metricUsedBy"),
                metricDependsOn: relationVocabulary("depends_on", "plain"),
                metricBelongsTo: relationVocabulary("belongs_to", "plain"),
                metricEvidence: relationVocabulary("describes", "plain"),
                // H1 B2/A — typed-fact label hover explanation + explicit scope for "direct" connection.
                metricContainsHelp: t("nodeDatasheet.metricContainsHelp"),
                metricUsedByHelp: t("nodeDatasheet.metricUsedByHelp"),
                metricDependsOnHelp: t("nodeDatasheet.metricDependsOnHelp"),
                metricBelongsToHelp: t("nodeDatasheet.metricBelongsToHelp"),
                metricEvidenceHelp: t("nodeDatasheet.metricEvidenceHelp"),
                noConnections: t("nodeDatasheet.noConnections"),
                // 「Code locations」 (Code locations): the actual code evidence — source file paths.
                codeLocationsLabel: t("nodeDatasheet.codeLocationsLabel"),
                codeLocationsCopyLabel: t("nodeDatasheet.codeLocationsCopyLabel"),
                codeLocationsCopiedLabel: t("nodeDatasheet.codeLocationsCopiedLabel"),
                // The same `editProvenance` namespace as `DocFrontmatterBlock` — one
                // source, no drift.
                editSubjectPrefix: tEditProvenance("prefix"),
                summaryFreshnessPrefix: tSummaryFreshness("prefix"),
                summaryFreshnessLag: summaryFreshness.has(panelDatasheetModel.slug)
                  ? tSummaryFreshness("lag", {
                    count: daysBehind(summaryFreshness.get(panelDatasheetModel.slug)!),
                  })
                  : undefined,
                summaryFreshnessAction: tSummaryFreshness("action"),
                editSubjectAgent: tEditProvenance("subjectAgent"),
                editSubjectHuman: tEditProvenance("subjectHuman"),
                editConflictMessage: tEditProvenance("conflictMessage"),
                handoff: t("nodeDatasheet.handoff"),
                close: t("controls.close"),
                openFullDetail: t("nodeDatasheet.openFullDetail"),
                actionsGroupLabel: t("nodeDatasheet.actionsGroupLabel"),
                actionDocument: t("nodeDatasheet.actionDocument"),
                actionEditRelations: t("nodeDatasheet.actionEditRelations"),
                actionEditMenu: t("nodeDatasheet.actionEditMenu"),
                actionMore: t("nodeDatasheet.actionMore"),
                actionCreateLinked: t("nodeDatasheet.actionCreateLinked"),
                actionCopyHandoff: t("nodeDatasheet.actionCopyHandoff"),
                actionAskAgent: llmBridgeAvailable
                  ? t("nodeDatasheet.actionAskAgent")
                  : undefined,
                actionRealm: t("realm.enterAction"),
                // Result-description tooltip (owner approved) — plain text explaining "what happens when pressed"
                // rather than label repetition. Area expansion reuses existing orbit button tooltips.
                actionAskAgentTip: t("nodeDatasheet.actionAskAgentTip"),
                sourceHeading: projectSourceLabels?.heading,
                sourceKind: projectSourceLabels?.sourceKind,
                sourceStatus: projectSourceLabels?.status,
                sourceMeasuredAt: projectSourceLabels?.measuredAt,
                sourceCurrentness: projectSourceLabels?.currentness,
                sourceGap: projectSourceLabels?.gap,
                sourceWhy: projectSourceLabels?.why,
                sourceGapLabel: t("nodeDatasheet.sourceGapLabel"),
                sourceAction: projectSourceLabels?.action,
                sourceRelationsShow: t("nodeDatasheet.sourceRelationsShow"),
                sourceRelationsHide: t("nodeDatasheet.sourceRelationsHide"),
                sourceOntologyDocument: t("nodeDatasheet.sourceOntologyDocument"),
                sourceBusy: projectSourceLabels?.busy,
              }}
              onSelectConnection={(id) => {
                detailKeyboardTargetRef.current = document.activeElement?.matches(':focus-visible') ? id : null;
                setMeaningEditorState(null);
                handleSelect(id);
              }}
              onHoverConnection={handleDatasheetHoverConnection}
              onHoverEvidence={handleDatasheetHoverEvidence}
              onCopyHandoff={copyV2NodeHandoff}
              onEditRelations={
                () => {
                  if (meaningEditorSource) {
                    openMeaningEditor({
                      sourceId: meaningEditorSource.id,
                      relation: "dependsOn",
                      targetId: null,
                    });
                  } else {
                    setNeedsVaultReason("editNeedsVault");
                  }
                }
              }
              /*
               * "Create one from here" is passed **only on a domain node**.
               *
               * Domain → capability is expressed by one `domain:` key in the new
               * document, so no new write semantics are needed. Other combinations
               * (capability → element, say) require editing the parent document's list,
               * which makes it *editing someone else's document* rather than *creating*
               * — a different act, and drawing a door where that cannot happen is a
               * false affordance.
               *
               * It is **visible on the sample too**. Owner, 2026-08-03: *"Show it in sample mode
               * as well, and have pressing it lead into connecting a folder."* (show it in sample mode
               * as well, and have pressing it lead into connecting a folder). Previously
               * the tile vanished entirely when `canCreateNode` was false, which is why
               * the owner asked *"Why did creating a node right here disappear?"* (why did
               * creating a node right here disappear?) — a locked feature that quietly
               * goes away becomes "was that ever there?". The same pattern was already
               * fixed once on the recent-changes chip. Now the place stays and pressing
               * it offers **the route to a folder**.
               */
              onCreateLinked={
                canvasSelectedGraphNode?.kind === "domain" && !canCreateNode
                  ? () => setNeedsVaultReason("createNeedsVault")
                  : canCreateNode && canvasSelectedGraphNode?.kind === "domain"
                    ? () => {
                      const tail = canvasSelectedGraphNode.id.includes(":")
                        ? canvasSelectedGraphNode.id.slice(canvasSelectedGraphNode.id.indexOf(":") + 1)
                        : canvasSelectedGraphNode.id;
                      setCreateNodeSeedDomain(tail);
                      setCreateNodeDefaultKind("capability");
                      openCreateNode();
                    }
                    : undefined
              }
              // In environments without an agent surface (web), we do not inject; handoff copy
              // takes over as the primary action. We do not draw a door that will not open.
              onAskAgent={llmBridgeAvailable ? askAgentAboutSelectedNode : undefined}
              meaningReview={{ label: tWorkbench('meaningTitle'), onOpen: openMeaningWorkbench }}
              suppressPrimaryAction={acpPresentationVisible}
              onClose={handleDatasheetClose}
              projectSource={projectSource.view}
              projectSourceBusy={projectSource.busy}
              projectSourceError={projectSourceErrorLabel}
              projectSourceDegraded={projectSourceDegraded}
              projectSourceProposal={projectSourceProposal}
              onProjectSourceConfirmProposal={projectSourceProposal
                ? handleProjectSourceConfirmProposal
                : undefined}
              onProjectSourceAction={projectSourceNextActionAvailable
                ? handleProjectSourceAction
                : undefined}
              onEnterRealm={
                // The secondary discovery path is offered only for a container node
                // (one with children) outside any realm. For a leaf, or when already
                // inside a realm, it is omitted and no button renders.
                resolvedRealmSlug === null && panelDatasheetModel.groups.contains.total > 0
                  ? () => handleEnterRealm(panelDatasheetModel.nodeId)
                  : undefined
              }
              onOpenFullDetail={
                selectedOntologyNode
                  ? () => setFullDetailSlug(selectedOntologyNode.id)
                  : undefined
              }
              // Slice C — non-developer (plain) mode treats handoff copy action + original
              // path subline (slice B) as developer chrome and hides them.
              showHandoff={!audiencePlain}
              showSourcePath={!audiencePlain}
              className="col-start-1 row-start-1 max-lg:w-[min(520px,calc(100vw-1.5rem))]"
            />
          ) : null}
          {meaningEditorSource && heldMeaningEditorState ? (
            <MeaningEditorPanel
              key={`meaning:${meaningEditorSource.id}`}
              open={meaningEditorOpen}
              source={meaningEditorSource}
              candidates={meaningEditorCandidates}
              initialRelation={heldMeaningEditorState.initialRelation}
              initialTargetId={heldMeaningEditorState.initialTargetId}
              initialWhy={heldMeaningEditorState.initialWhy}
              onPreview={setMeaningPreview}
              onApply={applyMeaningEditor}
              onClose={closeMeaningEditor}
              onExited={() => {
                if (!panelOpen) setNodePanelMounted(false);
              }}
              className="col-start-1 row-start-1 max-lg:w-[min(520px,calc(100vw-1.5rem))]"
            />
          ) : null}
        </div>
      </div>
    ) : null}
    {/* The edge hover card renders even while a node has focus — user report: "with
            a node clicked, hovering a line shows no tooltip". It is mutually exclusive
            with the edge popover only, since that would be two surfaces for the same
            meaning. */}
    {hoverEdgeCardModel && !selectedEdge && !createNodeOpen ? (
      <OntologyMapEdgeHoverCard
        sentence={hoverEdgeCardModel.sentence}
        typeLabel={hoverEdgeCardModel.typeLabel}
        why={hoverEdgeCardModel.why}
        clickHint={t("edgeHover.clickHint")}
        x={hoverEdgeCardModel.x}
        y={hoverEdgeCardModel.y}
        avoid={hoverEdgeCardModel.avoid}
      />
    ) : null}
    {/* Cluster-chip hover tooltip, mutually exclusive with the edge card and the
            create composer. (The pointer handler already clears the edge hover when a
            chip is hovered; this is belt and braces.) */}
    {clusterHoverCardModel && !hoverEdgeCardModel && !createNodeOpen ? (
      <OntologyMapClusterHoverCard
        sentence={clusterHoverCardModel.sentence}
        x={clusterHoverCardModel.x}
        y={clusterHoverCardModel.y}
      />
    ) : null}
    {/* This one has an exit: it used to vanish in one frame on close, having an
            entrance and no way out. `Surface` owns the exit window, the exit class, and
            `inert`, while `useHeldValue` holds the model through it. */}
    {heldEdgePanelModel ? (
      <Surface
        open={edgePanelOpen}
        data-testid="topology-edge-popover-positioner"
        /* The same reserved right as the node inspector: with the dock open the rule in
                           globals.css moves this card left by the dock's width, so the two never cover
                           each other (measured overlapping at 1512 before the role was set). */
        data-fixed-surface-role="selected-node-inspector"
        className="topology-ui-scale fixed inset-x-3 top-[72px] z-30 flex justify-center lg:inset-x-auto lg:right-[var(--topology-node-popover-right-inset)] lg:top-[var(--topology-node-popover-top)] lg:block"
      >
        <OntologyMapEdgePanel
          sentence={heldEdgePanelModel.sentence}
          typeLabel={heldEdgePanelModel.typeLabel}
          fromId={heldEdgePanelModel.fromId}
          toId={heldEdgePanelModel.toId}
          fromTitle={heldEdgePanelModel.fromTitle}
          toTitle={heldEdgePanelModel.toTitle}
          why={heldEdgePanelModel.why}
          declaredBy={heldEdgePanelModel.declaredBy}
          updatedAtLabel={heldEdgePanelModel.updatedAtLabel}
          meaningEditHref={heldEdgePanelModel.meaningEditHref}
          onEditRelation={
            heldEdgePanelModel.meaningRelation
              ? () => {
                if (heldEdgePanelModel.contextualEditable) {
                  openMeaningEditor({
                    sourceId: heldEdgePanelModel.fromId,
                    relation: heldEdgePanelModel.meaningRelation!,
                    targetId: heldEdgePanelModel.toId,
                  });
                } else {
                  setNeedsVaultReason("editNeedsVault");
                }
                setSelectedEdge(null);
              }
              : undefined
          }
          noReasonHint={heldEdgePanelModel.why ? null : t("edgePanel.noReason")}
          labels={{
            kicker: t("edgePanel.kicker"),
            declaredByLabel: t("edgePanel.declaredBy"),
            editRelation: t("edgePanel.editRelation"),
            close: t("edgePanel.close"),
            openDoc: t("edgePanel.openDoc"),
          }}
          onSelectNode={(id) => {
            setMeaningEditorState(null);
            setSelectedEdge(null);
            handleSelect(id);
          }}
          onClose={() => setSelectedEdge(null)}
          className="pointer-events-auto max-lg:w-[min(400px,calc(100vw-1.5rem))]"
        />
      </Surface>
    ) : null}
    {/* Same skeleton as the edge panel: once a held model exists the slot stays, and
            `Surface`'s `open` decides visibility (closed, it renders `null`, so the DOM
            cost is zero). A separate mount flag would mean calling setState inside an
            effect, which is a cascading render. */}
    {heldContextMenu ? (
      <OntologyMapContextMenu
        open={Boolean(contextMenuNode && contextMenuModel)}
        position={heldContextMenu.anchor}
        documentHref={heldContextMenu.model.documentHref}
        mentionDocumentHref={heldContextMenu.model.mentionDocumentHref}
        meaningEditHref={heldContextMenu.model.meaningEditHref}
        labels={{
          actionDocument: t("nodeDatasheet.actionDocument"),
          actionMentionDocument: t("nodeDatasheet.actionMentionDocument"),
          actionMentionDocumentTip: t("nodeDatasheet.actionMentionDocumentTip"),
          actionEditRelations: t("nodeDatasheet.actionEditRelations"),
          actionCopyHandoff: t("nodeDatasheet.actionCopyHandoff"),
          actionPath: t("nodeDatasheet.actionPath"),
          openFullDetail: t("nodeDatasheet.openFullDetail"),
        }}
        onCopyHandoff={() => {
          copyV2NodeHandoff(heldContextMenu.model.handoffText);
          closeContextMenu();
        }}
        onSetPathSource={() => {
          handleSetPathSource(heldContextMenu.model.nodeId);
          closeContextMenu();
        }}
        onOpenFullDetail={() => {
          handleSelect(heldContextMenu.model.nodeId);
          setFullDetailSlug(heldContextMenu.model.nodeId);
          closeContextMenu();
        }}
        onClose={closeContextMenu}
        ariaLabel={t("nodeDatasheet.contextMenuAriaLabel", { name: heldContextMenu.model.title })}
        // The menu held focus; once it has gone the canvas takes it back, so the
        // arrow keys walk the map again from where they were.
        onExited={() => returnFocusIfDropped("ontology-map-canvas")}
      />
    ) : null}
    {/* Full-bleed surface, **opacity only** (`motion="overlay"`). It used to have
            `map-overlay-in` applied by hand and therefore only a way in; closing made the
            whole screen vanish in one frame, giving the protagonist zero frames while the
            map got 200 ms. `Surface` now owns the matching way out (`map-overlay-out`),
            `inert`, and the exit window. */}
    {heldFullDetailA1Model && FullDetailCard ? (
      <Surface
        open={fullDetailOpen && fullDetailA1Model !== null}
        motion="overlay"
        data-testid="topology-full-detail-a1-positioner"
        data-full-detail-motion-token="--topology-motion-panel-duration"
        className="fixed inset-0 z-50 overflow-y-auto bg-[color:var(--color-canvas)]"
      >
        <FullDetailCard
          node={heldFullDetailA1Model.node}
          groups={heldFullDetailA1Model.groups}
          reach={heldFullDetailA1Model.reach}
          breadcrumb={heldFullDetailA1Model.breadcrumb}
          bodyMarkdown={heldFullDetailA1Model.bodyMarkdown}
          explanationEdit={heldFullDetailA1Model.explanationEdit}
          documentHref={heldFullDetailA1Model.documentHref}
          mentionDocumentHref={heldFullDetailA1Model.mentionDocumentHref}
          codeLocations={heldFullDetailA1Model.codeLocations}
          projectSource={projectSource.view}
          projectSourceLabels={projectSourceLabels}
          projectSourceBusy={projectSource.busy}
          projectSourceError={projectSourceErrorLabel}
          onProjectSourceAction={projectSource.canRunSourceAction
            ? projectSource.runNextAction
            : undefined}
          onSelectNode={(id) => handleSelect(id)}
          onClose={handleClose}
          onBackToMap={handleClose}
        />
      </Surface>
    ) : null}
  </>);
}
