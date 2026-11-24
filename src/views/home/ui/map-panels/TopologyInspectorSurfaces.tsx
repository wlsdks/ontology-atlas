import type { useAcpRuntimeController } from "../../model/agent/use-acp-runtime-controller";
import type { useHomeWorkbenchController } from "../../model/use-home-workbench-controller";
import type { useTopologyAgentOrchestration } from "../../model/agent/use-topology-agent-orchestration";
import type { useTopologyAuthoring } from "../../model/authoring/use-topology-authoring";
import type { useTopologyCanvasFocus } from "../../model/use-topology-canvas-focus";
import type { useTopologyCreateIntent } from "../../model/authoring/use-topology-create-intent";
import type { useTopologyExplorationLenses } from "../../model/map-canvas/use-topology-exploration-lenses";
import type { useTopologyGraphProjection } from "../../model/map-canvas/use-topology-graph-projection";
import type { useTopologyInspectorState } from "../../model/inspector/use-topology-inspector-state";
import type { useTopologyKeyboard } from "../../model/keyboard/use-topology-keyboard";
import type { useTopologyNavigationActions } from "../../model/use-topology-navigation-actions";
import type { useTopologyPreferences } from "../../model/use-topology-preferences";
import type { useTopologyRouteControls } from "../../model/route-state/use-topology-route-controls";
import type { useTopologySourceActions } from "../../model/project-source/use-topology-source-actions";
import type { useTopologySourceReadiness } from "../../model/project-source/use-topology-source-readiness";
import type { useTopologyVaultReadModel } from "../../model/use-topology-vault-read-model";


import { daysBehind } from "@/entities/docs-vault";
import { MeaningEditorPanel } from "@/features/ontology-meaning-editor";
import { formatProjectSourceHandoff } from "@/shared/lib/project-source/project-source-receipt";
import { Dialog, Surface, controlClass } from "@/shared/ui";
import { morphName, runMorph } from "@/shared/motion/shared-element";
import { OntologyMapClusterHoverCard, OntologyMapContextMenu, OntologyMapDetailPanel, OntologyMapEdgeHoverCard, OntologyMapEdgePanel } from "@/widgets/ontology-map";
import { ProjectDrawer } from "@/widgets/project-drawer";
import { CreateNodeForm } from "../create/CreateNodeForm";
import { useTranslations } from "next-intl";
import { normalizeKindLabelKey } from "../../lib/inspector/topology-node-significance";
import { returnFocusIfDropped } from "../../lib/keyboard/topology-focus-return";
import { resolveNodeVaultRef } from "../../lib/authoring/topology-node-edit";
import { type ConceptReviewTarget, type ReadConceptBody, useConceptReview } from "../../model/inspector/use-node-datasheet-model";
import { parseFrontmatter } from "@/shared/lib/vault-document/parse-frontmatter";
import { useCallback, useEffect, useMemo, useRef } from "react";
import { CodeReader } from "@/widgets/code-reader";
import { useConceptCodeReader } from "../../model/inspector/use-concept-code-reader";
import { READER_GAP_PX, useCodeReaderPlacement } from "../../model/inspector/use-code-reader-placement";
import type { CodeReaderRoom } from "../../model/inspector/use-code-reader-room";

const CODE_ROW_SELECTOR = '[data-testid="map-detail-panel-code"]';

const FULL_DETAIL_TITLE_ID = "topology-full-detail-title";

interface TopologyInspectorSurfacesProps {
  grayAreaOpen?: boolean;
  grayAreaAction?: {label:string;onOpen:()=>void};
  projectsError: string | null;
  heldProjectsError: string | null;
  renderProjects: import("@/entities/project/model/project").Project[];
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
    | "summaryHistoryUnavailable"
    | "llmBridgeAvailable"
    | "setNeedsVaultReason"
    | "selectedOntologyNode"
    | "vault"
    | "gitVaultPath"
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
    | "heldFullDetailModel"
    | "fullDetailModel"
  >;
  topologyNavigationActions: Pick<ReturnType<typeof useTopologyNavigationActions>, "handleClose" | "handleSelect" | "handleDatasheetClose">;
  topologyKeyboard: Pick<ReturnType<typeof useTopologyKeyboard>, "handleSelectImpactMode">;
  topologyAuthoring: Pick<
    ReturnType<typeof useTopologyAuthoring>,
    | "createNodeOpen"
    | "nodeEditTarget"
    | "setMeaningEditorState"
    | "meaningEditorSource"
    | "openMeaningEditor"
    | "canCreateNode"
    | "heldMeaningEditorState"
    | "meaningEditorCandidates"
    | "setMeaningPreview"
    | "applyMeaningEditor"
    | "closeMeaningEditor"
    | "meaningEditorRelations"
    | "removeIncomingRelation"
    | "hoverEdgeCardModel"
    | "selectedEdge"
    | "clusterHoverCardModel"
    | "heldEdgePanelModel"
    | "edgePanelOpen"
    | "setSelectedEdge"
    | "createNode"
    | "closeCreateNode"
    | "createNodeDomainOptions"
    | "createNodeExistingConcepts"
    | "renameConcept"
    | "saveConceptDescription"
    | "deleteReferrers"
    | "deleteConcept"
  >;
  topologyPreferences: Pick<ReturnType<typeof useTopologyPreferences>, "t" | "tKinds" | "tWorkbench" | "audiencePlain" | "activeLocale">;
  topologyCreateIntent: Pick<ReturnType<typeof useTopologyCreateIntent>, "createNodeDefaults" | "openCreateNode">;
  topologyExplorationLenses: Pick<ReturnType<typeof useTopologyExplorationLenses>, "drawerProject">;
  codeReaderRoom: CodeReaderRoom;
}

export function TopologyInspectorSurfaces({
  grayAreaOpen, grayAreaAction,
  projectsError, heldProjectsError, renderProjects, impactMode, tEditProvenance, tSummaryFreshness,
  topologyPreferences, topologyAuthoring, topologyKeyboard, topologyNavigationActions,
  topologyInspectorState, topologyCanvasFocus, topologyVaultReadModel, topologySourceReadiness,
  topologySourceActions, topologyGraphProjection, topologyAgentOrchestration, homeWorkbenchController,
  acpRuntimeController, topologyRouteControls, topologyExplorationLenses, topologyCreateIntent,
  codeReaderRoom
}: TopologyInspectorSurfacesProps) {
  const { drawerProject } = topologyExplorationLenses;
  const { createNodeDefaults, openCreateNode } = topologyCreateIntent;

  const { t, tKinds, tWorkbench, audiencePlain, activeLocale } = topologyPreferences;
  const {
    createNodeOpen, nodeEditTarget, setMeaningEditorState, meaningEditorSource, openMeaningEditor, canCreateNode,
    heldMeaningEditorState, meaningEditorCandidates, setMeaningPreview, applyMeaningEditor,
    closeMeaningEditor, meaningEditorRelations, removeIncomingRelation, hoverEdgeCardModel, selectedEdge, clusterHoverCardModel, heldEdgePanelModel,
    edgePanelOpen, setSelectedEdge, createNode, closeCreateNode, createNodeDomainOptions, createNodeExistingConcepts,
    renameConcept, saveConceptDescription, deleteReferrers, deleteConcept
  } = topologyAuthoring;
  const conceptWritable = canCreateNode && nodeEditTarget !== null;
  const { handleSelectImpactMode } = topologyKeyboard;
  const { handleClose, handleSelect, handleDatasheetClose } = topologyNavigationActions;
  const {
    nodePanelMounted, panelDatasheetModel, panelOpen, meaningEditorOpen, setNodePanelMounted, heldContextMenu,
    contextMenuModel, handleSetPathSource, heldFullDetailModel, fullDetailModel
  } = topologyInspectorState;
  const {
    nodePopoverPositionerRef, detailCloseButtonRef, detailKeyboardTargetRef, handleDatasheetHoverConnection,
    handleDatasheetHoverEvidence, setFullDetailSlug, contextMenuNode, closeContextMenu, FullDetailCard,
    fullDetailOpen
  } = topologyCanvasFocus;
  const { summaryFreshness, summaryHistoryUnavailable, llmBridgeAvailable, setNeedsVaultReason, selectedOntologyNode, vault, gitVaultPath } = topologyVaultReadModel;
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
  const panelShown = Boolean(!grayAreaOpen && nodePanelMounted && panelDatasheetModel);
  const vaultFiles = vault.status === "loaded" ? vault.fileHandles : null;
  const readConceptBody = useMemo<ReadConceptBody>(
    () => vaultFiles
      ? async (slug) => {
        const handle = vaultFiles.get(slug);
        return handle ? parseFrontmatter(await (await handle.getFile()).text()).body : null;
      }
      : null,
    [vaultFiles],
  );
  const reviewTarget = useMemo<ConceptReviewTarget | null>(
    () => panelShown && nodeEditTarget
      ? { slug: nodeEditTarget.vaultSlug, frontmatter: nodeEditTarget.frontmatter, mtime: nodeEditTarget.mtime }
      : null,
    [panelShown, nodeEditTarget],
  );
  const conceptReview = useConceptReview(reviewTarget, readConceptBody);
  const codeConcept = useMemo(
    () => panelShown && nodeEditTarget
      ? { slug: nodeEditTarget.vaultSlug, frontmatter: nodeEditTarget.frontmatter, mtime: nodeEditTarget.mtime }
      : null,
    [panelShown, nodeEditTarget],
  );
  const conceptCode = useConceptCodeReader({ concept: codeConcept, readBody: readConceptBody, vaultPath: gitVaultPath });
  const measurePanelWidth = useCallback(
    () => nodePopoverPositionerRef.current?.querySelector<HTMLElement>('[data-testid="map-detail-panel"]')?.offsetWidth ?? 0,
    [nodePopoverPositionerRef],
  );
  const { state: readerRoomState, hold: holdReaderRoom, release: releaseReaderRoom, seatSettled: readerSeatSettled } = codeReaderRoom;
  const readerPlacement = useCodeReaderPlacement(conceptCode.readerOpen, nodePopoverPositionerRef, measurePanelWidth, holdReaderRoom);
  const readerShown = conceptCode.readerOpen && readerPlacement !== null && conceptCode.target !== null;
  const readerReplacesList = readerShown && readerPlacement.mode === "replace";
  const { readerOpen, close: closeConceptCode } = conceptCode;
  // The room goes back when the reader closes; the person taking it back closes the reader.
  useEffect(() => {
    if (readerOpen && readerRoomState === "withdrawn") closeConceptCode();
    else if (!readerOpen && readerRoomState !== "none") releaseReaderRoom();
  }, [readerOpen, readerRoomState, closeConceptCode, releaseReaderRoom]);
  // Closing from inside the reader hands focus back to the Code row that opened it.
  const closeReaderToCodeRow = useCallback(() => {
    closeConceptCode();
    requestAnimationFrame(() => {
      nodePopoverPositionerRef.current?.querySelector<HTMLElement>(CODE_ROW_SELECTOR)?.focus({ preventScroll: true });
    });
  }, [closeConceptCode, nodePopoverPositionerRef]);
  const onlyProjectSlug = renderProjects.length === 1 ? renderProjects[0]!.slug : null;
  const codeReaderSurface = conceptCode.target && readerPlacement && panelDatasheetModel ? (
    <CodeReader
      key={`${panelDatasheetModel.slug}\0${conceptCode.target.path}`}
      open={readerShown}
      widthPx={readerPlacement.widthPx}
      replacesList={readerPlacement.mode === "replace"}
      conceptTitle={panelDatasheetModel.title}
      target={conceptCode.target}
      reader={conceptCode.reader}
      documentModifiedMs={conceptCode.documentModifiedMs}
      nextSteps={{
        askToFind: llmBridgeAvailable ? askAgentAboutSelectedNode : undefined,
        openCodeFolder: onlyProjectSlug ? () => handleSelect(onlyProjectSlug) : undefined,
      }}
      onClose={closeReaderToCodeRow}
    />
  ) : null;
  // One reader slides between its two seats: left of the panel, or over the panel's own place.
  const readerSpacerPx = !readerShown
    ? 0
    : readerReplacesList
      ? Math.max(0, readerPlacement.widthPx - readerPlacement.panelWidthPx)
      : readerPlacement.widthPx + READER_GAP_PX;
  const readerOffsetPx = readerPlacement?.mode === "beside" ? readerPlacement.panelWidthPx + READER_GAP_PX : 0;
  const readerSpacerRef = useRef<HTMLDivElement | null>(null);
  const readerSeatKey = readerShown ? `${readerPlacement.mode}:${readerPlacement.widthPx}` : null;
  // The map is told once the seat's width has landed, so the camera reads the box the reader keeps.
  useEffect(() => {
    const spacer = readerSpacerRef.current;
    if (readerSeatKey === null || !spacer) return;
    let cancelled = false;
    const frame = requestAnimationFrame(() => {
      const moving = typeof spacer.getAnimations === "function" ? spacer.getAnimations() : [];
      if (moving.length === 0) readerSeatSettled();
      else void Promise.all(moving.map((animation) => animation.finished)).then(() => { if (!cancelled) readerSeatSettled(); }, () => undefined);
    });
    return () => {
      cancelled = true;
      cancelAnimationFrame(frame);
    };
  }, [readerSeatKey, readerSeatSettled]);

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
    <Surface
      open={canCreateNode && createNodeOpen}
      motion="overlay"
      data-testid="topology-create-node-panel"
      data-placement-contract="selected-inspector-aligns-to-right-inset"
      data-topology-camera-obstacle="side-panel"
      className="topology-ui-scale pointer-events-auto fixed inset-x-3 bottom-[var(--map-panel-bottom-reserve)] z-30 flex justify-center lg:inset-x-auto lg:bottom-auto lg:right-[var(--topology-node-popover-right-inset)] lg:top-[var(--topology-node-popover-top)] lg:block"
    >
      <div className="w-[var(--map-panel-width)] max-lg:w-[min(520px,calc(100vw-1.5rem))]">
        <CreateNodeForm
          key={createNodeDefaults.opening}
          defaultKind={createNodeDefaults.kind}
          defaultParent={createNodeDefaults.parent}
          parentOptions={createNodeDomainOptions}
          existingConcepts={createNodeExistingConcepts}
          primaryLocale={activeLocale}
          secondaryLocale={activeLocale === "en" ? "ko" : "en"}
          onCreate={createNode}
          onOpenExisting={(id) => {
            closeCreateNode();
            handleSelect(id);
          }}
          onClose={closeCreateNode}
        />
      </div>
    </Surface>
    {/* Stays mounted until the panel's `<Surface>` reports `onExited`, drawing the retained model
       as it folds. */}
    {panelShown && panelDatasheetModel ? (
      <div
        ref={nodePopoverPositionerRef}
        data-testid="topology-node-popover-positioner"
        data-topology-camera-obstacle={panelOpen ? "side-panel" : "none"}
        data-position-contract="selected-inspector-aligns-to-right-inset"
        data-fixed-surface-role="selected-node-inspector"
        data-fixed-surface-measure-target="topology-node-popover"
        data-selected-inspector-overlap-contract="fixed-surface-hides-overlapping-map-cards"
        data-selected-inspector-gutter-contract="no-phantom-utility-rail"
        data-position-top-token="--topology-node-popover-top"
        data-position-right-inset-token="--topology-node-popover-right-inset"
        // `topology-ui-scale`: the same wide-screen zoom as INDEX and the toolbar. Below `lg` this
        // is a bottom sheet above `--map-panel-bottom-reserve`: top-anchored it grew over the ego
        // graph and past the tab bar. `--map-inspector-max-height` caps the inspector only; the
        // meaning editor keeps `--map-panel-max-height` for its submit row. The wrapper ignores
        // pointers so its unpainted width does not eat map taps; `computeFreeArea` reads the
        // measured width of the obstacle marker.
        className="topology-ui-scale pointer-events-none fixed inset-x-3 bottom-[var(--map-panel-bottom-reserve)] z-30 flex justify-center lg:inset-x-auto lg:bottom-auto lg:right-[var(--topology-node-popover-right-inset)] lg:top-[var(--topology-node-popover-top)] lg:block"
      >
        <div className="pointer-events-none relative flex items-start justify-end">
        {/* Holds the reader's width in the panel's box, so the camera and the map's names keep
            clear of it; the width moves on the reflow clock and waits for the text to clear. */}
        <div
          ref={readerSpacerRef}
          aria-hidden
          data-testid="code-reader-slot"
          style={{ width: readerSpacerPx, transitionDelay: readerShown ? undefined : "var(--motion-fast)" }}
          className={`shrink-0 transition-[width] duration-[var(--agent-panel-reflow-duration)] ease-[var(--topology-motion-ease-out)] max-lg:hidden ${readerShown ? "h-[var(--map-inspector-max-height)]" : ""}`}
        />
        <div className="pointer-events-none grid">
          {panelDatasheetModel ? (
            <div
              inert={readerReplacesList || undefined}
              data-testid="concept-panel-place"
              data-code-reader-replaced={readerReplacesList || undefined}
              style={{ opacity: readerReplacesList ? 0 : 1 }}
              className="col-start-1 row-start-1 flex justify-end transition-opacity duration-[var(--motion-fast)] ease-[var(--motion-ease)]"
            >
            <OntologyMapDetailPanel
              discoveryAction={grayAreaAction}
              closeButtonRef={detailCloseButtonRef}
              key={panelDatasheetModel.slug}
              open={panelOpen}
              onExited={() => {
                if (!meaningEditorOpen) setNodePanelMounted(false);
              }}
              nodeId={panelDatasheetModel.nodeId}
              slug={panelDatasheetModel.slug}
              title={panelDatasheetModel.title}
              kind={panelDatasheetModel.kind}
              owner={panelDatasheetModel.owner}
              definition={panelDatasheetModel.definition}
              review={conceptReview}
              powered={panelDatasheetModel.powered}
              summaryStaleness={
                summaryFreshness.has(panelDatasheetModel.slug)
                  ? { behindByDays: daysBehind(summaryFreshness.get(panelDatasheetModel.slug)!) }
                  : null
              }
              summaryHistoryUnavailable={summaryHistoryUnavailable.has(panelDatasheetModel.slug)}
              groups={panelDatasheetModel.groups}
              reach={panelDatasheetModel.reach}
              updatedAtLabel={panelDatasheetModel.updatedAtLabel}
              mtimeConflict={panelDatasheetModel.mtimeConflict}
              handoffText={projectSource.view
                ? `${panelDatasheetModel.handoffText}\n\n${formatProjectSourceHandoff(projectSource.view)}`
                : panelDatasheetModel.handoffText}
              documentHref={panelDatasheetModel.documentHref}
              meaningEditHref={panelDatasheetModel.meaningEditHref}
              labels={{
                kindLabel: tKinds(normalizeKindLabelKey(panelDatasheetModel.kind)),
                noConnections: t("nodeDatasheet.noConnections"),
                domainLinks: (count) => t("nodeDatasheet.domainLinks", { count }),
                summaryFreshnessPrefix: tSummaryFreshness("prefix"),
                summaryFreshnessLag: summaryFreshness.has(panelDatasheetModel.slug)
                  ? tSummaryFreshness("lag", {
                    count: daysBehind(summaryFreshness.get(panelDatasheetModel.slug)!),
                  })
                  : undefined,
                summaryFreshnessAction: tSummaryFreshness("action"),
                summaryHistoryUnavailable: tSummaryFreshness("unavailable"),
                editConflictMessage: tEditProvenance("conflictMessage"),
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
                actionAskAgentShort: t("nodeDatasheet.actionAskAgentShort"),
                actionRealm: t("realm.enterAction"),
                actionAskAgentTip: t("nodeDatasheet.actionAskAgentTip"),
                sourceHeading: t("nodeDatasheet.sourceHeading"),
                sourceRecord: t("nodeDatasheet.sourceRecord"),
                sourcePending: t("nodeDatasheet.sourcePending"),
                sourceKind: projectSourceLabels?.sourceKind,
                sourceStatus: projectSourceLabels?.status,
                sourceMeasuredAt: projectSourceLabels?.measuredAt,
                sourceCurrentness: projectSourceLabels?.currentness,
                sourceGap: projectSourceLabels?.gap,
                sourceWhy: projectSourceLabels?.why,
                sourceGapLabel: t("nodeDatasheet.sourceGapLabel"),
                sourceAction: projectSourceLabels?.action,
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
              // Only on a domain node: a capability inside it is one `domain:` key on the new file.
              // It shows on the sample too and leads to connecting a folder, since a locked feature
              // that vanishes reads as never having existed.
              onCreateLinked={
                canvasSelectedGraphNode?.kind === "domain" && !canCreateNode
                  ? () => setNeedsVaultReason("createNeedsVault")
                  : canCreateNode && canvasSelectedGraphNode?.kind === "domain"
                    ? () => openCreateNode({ kind: "capability", parent: resolveNodeVaultRef(canvasSelectedGraphNode) })
                    : undefined
              }
              onRename={conceptWritable ? renameConcept : undefined}
              onSaveDescription={conceptWritable ? saveConceptDescription : undefined}
              deleteConcept={conceptWritable ? { referrers: deleteReferrers, onDelete: deleteConcept } : undefined}
              // Without an agent surface (web) only the handoff copy is offered; no door that will
              // not open.
              onAskAgent={llmBridgeAvailable ? askAgentAboutSelectedNode : undefined}
              meaningReview={{ label: tWorkbench('meaningTitle'), onOpen: openMeaningWorkbench }}
              suppressPrimaryAction={acpPresentationVisible}
              onClose={handleDatasheetClose}
              projectSource={projectSource.view}
              projectSourceLoading={projectSource.loading}
              projectSourceBusy={projectSource.busy}
              projectSourceError={projectSourceErrorLabel}
              projectSourceDegraded={projectSourceDegraded}
              projectSourceProposal={projectSourceProposal}
              onProjectSourceConfirmProposal={projectSourceProposal
                ? handleProjectSourceConfirmProposal
                : undefined}
              onProjectSourceAction={projectSourceNextActionAvailable
                ? () => handleProjectSourceAction(handleSelect)
                : undefined}
              onEnterRealm={
                // Only for a container outside any realm.
                resolvedRealmSlug === null && panelDatasheetModel.groups.contains.total > 0
                  ? () => handleEnterRealm(panelDatasheetModel.nodeId)
                  : undefined
              }
              onOpenFullDetail={
                selectedOntologyNode
                  ? () => {
                    const open = () => setFullDetailSlug(selectedOntologyNode.id);
                    if (FullDetailCard) runMorph(open, [morphName("concept", panelDatasheetModel.nodeId)]);
                    else open();
                  }
                  : undefined
              }
              showHandoff={!audiencePlain}
              codeRow={conceptCode.target ? {
                path: conceptCode.target.path,
                citeCount: conceptCode.target.ranges.length,
                readerOpen: conceptCode.readerOpen,
                onToggle: conceptCode.toggle,
              } : undefined}
              className="max-lg:w-[min(520px,calc(100vw-1.5rem))]"
            />
            </div>
          ) : null}
          {meaningEditorSource && heldMeaningEditorState ? (
            <MeaningEditorPanel
              key={`meaning:${meaningEditorSource.id}`}
              open={meaningEditorOpen}
              source={meaningEditorSource}
              candidates={meaningEditorCandidates}
              relations={meaningEditorRelations}
              initialRelation={heldMeaningEditorState.initialRelation}
              initialTargetId={heldMeaningEditorState.initialTargetId}
              initialWhy={heldMeaningEditorState.initialWhy}
              onPreview={setMeaningPreview}
              onApply={applyMeaningEditor}
              onEditIncoming={(row) =>
                openMeaningEditor({ sourceId: row.otherId, relation: row.relation, targetId: meaningEditorSource.id })
              }
              onRemoveIncoming={removeIncomingRelation}
              onClose={closeMeaningEditor}
              onExited={() => {
                if (!panelOpen) setNodePanelMounted(false);
              }}
              className="col-start-1 row-start-1 max-lg:w-[min(520px,calc(100vw-1.5rem))]"
            />
          ) : null}
        </div>
        {codeReaderSurface ? (
          <div
            data-testid="code-reader-seat"
            style={{ translate: `${-readerOffsetPx}px 0` }}
            className="pointer-events-none absolute right-0 max-lg:bottom-0 lg:top-0 transition-[translate] duration-[var(--agent-panel-reflow-duration)] ease-[var(--topology-motion-ease-out)]"
          >
            {codeReaderSurface}
          </div>
        ) : null}
        </div>
      </div>
    ) : null}
    {/* Shows even with node focus; exclusive only with the edge popover, which carries the same
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
    {clusterHoverCardModel && !hoverEdgeCardModel && !createNodeOpen ? (
      <OntologyMapClusterHoverCard
        sentence={clusterHoverCardModel.sentence}
        x={clusterHoverCardModel.x}
        y={clusterHoverCardModel.y}
      />
    ) : null}
    {/* `Surface` owns the exit window, class and `inert`; `useHeldValue` holds the model through
       it. */}
    {heldEdgePanelModel ? (
      <Surface
        open={edgePanelOpen}
        data-testid="topology-edge-popover-positioner"
        // With the dock open, globals.css moves this card left by the dock width, like the node
        // inspector.
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
                if (heldEdgePanelModel.contextualEditable && heldEdgePanelModel.declaringId === heldEdgePanelModel.fromId) {
                  openMeaningEditor({
                    sourceId: heldEdgePanelModel.fromId,
                    relation: heldEdgePanelModel.meaningRelation!,
                    targetId: heldEdgePanelModel.toId,
                  });
                } else if (heldEdgePanelModel.contextualEditable && heldEdgePanelModel.declaringId) {
                  openMeaningEditor({ sourceId: heldEdgePanelModel.declaringId });
                } else if (canCreateNode) {
                  openMeaningEditor({ sourceId: heldEdgePanelModel.fromId });
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
    {/* A held model keeps the slot and `Surface`'s `open` decides visibility; a separate mount
       flag would need setState in an effect. */}
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
        onExited={() => returnFocusIfDropped("ontology-map-canvas")}
      />
    ) : null}
    {/* A centred sheet over the dimmed map: `Dialog` owns trap, Escape, scrim close and focus return. */}
    {heldFullDetailModel && FullDetailCard ? (
      <Dialog
        open={fullDetailOpen && fullDetailModel !== null}
        onClose={() => setFullDetailSlug(null)}
        size="lg"
        labelledBy={FULL_DETAIL_TITLE_ID}
        initialFocus="none"
        testId="topology-full-detail-positioner"
        className="p-0"
      >
        <FullDetailCard
          node={heldFullDetailModel.node}
          groups={heldFullDetailModel.groups}
          reach={heldFullDetailModel.reach}
          titleId={FULL_DETAIL_TITLE_ID}
          bodyMarkdown={heldFullDetailModel.bodyMarkdown}
          explanationEdit={heldFullDetailModel.explanationEdit}
          documentHref={heldFullDetailModel.documentHref}
          mentionDocumentHref={heldFullDetailModel.mentionDocumentHref}
          codeLocations={heldFullDetailModel.codeLocations}
          codePath={heldFullDetailModel.codePath}
          projectSource={projectSource.view}
          projectSourceLabels={projectSourceLabels}
          projectSourceBusy={projectSource.busy}
          projectSourceError={projectSourceErrorLabel}
          onProjectSourceAction={projectSourceNextActionAvailable
            ? () => handleProjectSourceAction(handleSelect)
            : undefined}
          onSelectNode={(id) => handleSelect(id)}
          onClose={() => setFullDetailSlug(null)}
        />
      </Dialog>
    ) : null}
  </>);
}
