import type { useHomeWorkbenchController } from "./use-home-workbench-controller";
import type { useTopologyAuthoring } from "./use-topology-authoring";
import type { useTopologyCanvasFocus } from "./use-topology-canvas-focus";
import type { useTopologyIndexPresentation } from "./use-topology-index-presentation";
import type { useTopologyVaultReadModel } from "./use-topology-vault-read-model";

import { buildDocsVaultHref } from "@/entities/docs-vault";
import { buildTopologyMeaningEditorNodeHref, buildTopologyReturnMarker, resolveNodeAgentTarget, resolveNodeDocument } from "@/entities/knowledge-graph";
import { useHeldValue } from "@/shared/lib/use-presence";
import { LG_BREAKPOINT_PX, useViewportBelow } from "@/shared/lib/use-viewport-below";
import { buildV2ConnectionGroups, buildV2Connections, buildV2EvidenceRows, formatV2HandoffText } from "@/widgets/ontology-map";
import { useCallback, useLayoutEffect, useMemo, useState } from "react";
import { isSearchLaneCrowded, SEARCH_LANE_CROWDED_BELOW_PX } from "./search-lane-density";
import { selectTopologyPathRouteState } from "./url-state";
import { useFullDetailA1Model } from "./use-full-detail-a1-model";
import { useRetainedDatasheetModel } from "./use-retained-datasheet-model";

interface Options {
  setExpandAllActive: React.Dispatch<React.SetStateAction<boolean>>;
  setRouteState: (updater: Partial<import("@/views/home/model/url-state").HomeRouteState> | ((current: import("@/views/home/model/url-state").HomeRouteState) => import("@/views/home/model/url-state").HomeRouteState), options?: import("@/views/home/model/use-home-route-state").HomeRouteStateUpdateOptions | undefined) => void;
  nodeFocus: import("@/views/home/lib/topology-node-focus").TopologyNodeFocusModel | null;
  v2DatasheetModel: { slug: string; nodeId: string; title: string; sourceTitle: string | null; kind: string; domain: { id: string; title: string; } | null; powered: boolean; updatedAtLabel: string | null; metric: { contains: number; usedBy: number; dependsOn: number; belongsTo: number; evidence: number; }; groups: import("@/widgets/ontology-map/ui/map-datasheet").V2ConnectionGroupsView; evidence: { rows: import("@/widgets/ontology-map/ui/map-datasheet").V2EvidenceRow[]; total: number; }; codeLocations: string[]; handoffText: string; documentHref: string | null; mentionDocumentHref: string | null; meaningEditHref: string; lastEditSubject: { kind: import("@/shared/lib/last-edit-subject").LastEditSubjectKind; ageLabel: string; } | null; mtimeConflict: boolean; } | null;
  analysisMode: import("@/views/home/model/url-state").TopologyAnalysisMode;
  selectedSlug: string | null;
  topologyIndexPresentation: Pick<ReturnType<typeof useTopologyIndexPresentation>, "agentDockRequestedOpen" | "renderedIndexState">;
  homeWorkbenchController: Pick<ReturnType<typeof useHomeWorkbenchController>, "meaningWorkbenchOpen" | "acpDockFrameOpen" | "reviewUsesSheet">;
  topologyAuthoring: Pick<
    ReturnType<typeof useTopologyAuthoring>,
    | "nodeBody"
    | "nodeEditTarget"
    | "saveNodeExplanation"
    | "meaningEditorState"
    | "meaningEditorSource"
    | "createNodeOpen"
    | "edgePanelOpen"
  >;
  topologyVaultReadModel: Pick<ReturnType<typeof useTopologyVaultReadModel>, "ontologyInsight" | "handoffSource" | "selectedOntologyNode" | "changedSlugs" | "vault">;
  topologyCanvasFocus: Pick<
    ReturnType<typeof useTopologyCanvasFocus>,
    | "interactionSelectedSlugRef"
    | "setFullDetailSlug"
    | "setSelectedRelationActive"
    | "contextMenuNode"
    | "fullDetailOpen"
    | "fullDetailSlug"
    | "selectedRelationActive"
    | "nodePopoverDismissed"
    | "detailKeyboardTargetRef"
    | "detailCloseButtonRef"
  >;
}
export function useTopologyInspectorState({
  setExpandAllActive, setRouteState, nodeFocus, v2DatasheetModel, analysisMode, selectedSlug,
  topologyCanvasFocus, topologyVaultReadModel, topologyAuthoring, homeWorkbenchController,
  topologyIndexPresentation
}: Options) {
  const {
    interactionSelectedSlugRef, setFullDetailSlug, setSelectedRelationActive, contextMenuNode, fullDetailOpen,
    fullDetailSlug, selectedRelationActive, nodePopoverDismissed, detailKeyboardTargetRef,
    detailCloseButtonRef
  } = topologyCanvasFocus;
  const { ontologyInsight, handoffSource, selectedOntologyNode, changedSlugs, vault } = topologyVaultReadModel;
  const { nodeBody, nodeEditTarget, saveNodeExplanation, meaningEditorState, meaningEditorSource, createNodeOpen, edgePanelOpen } = topologyAuthoring;
  const { meaningWorkbenchOpen, acpDockFrameOpen, reviewUsesSheet } = homeWorkbenchController;
  const { agentDockRequestedOpen, renderedIndexState } = topologyIndexPresentation;

  // Sets this node as the path source and enters path mode through `selectTopologyPathRouteState`.
  const handleSetPathSource = useCallback(
    (slug: string) => {
      setExpandAllActive(false);
      interactionSelectedSlugRef.current = null;
      setFullDetailSlug(null);
      setSelectedRelationActive(false);
      setRouteState((current) =>
        selectTopologyPathRouteState(current, {
          sourceSlug: slug,
          targetSlug: null,
        }),
      );
    },
    [setExpandAllActive, interactionSelectedSlugRef, setFullDetailSlug, setSelectedRelationActive, setRouteState],
  );
  // Built like `v2DatasheetModel` but for the right-clicked node, which need not be selected.
  // `domainTitle: null` skips the drawer model; the payload degrades to `domain: -`.
  const contextMenuModel = useMemo(() => {
    if (!contextMenuNode || !ontologyInsight) return null;
    const node = ontologyInsight.nodes.find((n) => n.id === contextMenuNode.slug);
    if (!node) return null;
    const sourceSlug = node.evidenceIds[0] ?? null;
    // Without an evidence list the label changes instead of dropping the link.
    const { ownSlug, mentionedInSlug } = resolveNodeDocument(node);
    // The document slug, or the reference as written.
    const agentTarget = resolveNodeAgentTarget(node);
    const slug = agentTarget.ref ?? sourceSlug ?? node.id;
    const connections = buildV2Connections(node.id, ontologyInsight.nodes, ontologyInsight.edges);
    const groups = buildV2ConnectionGroups(connections);
    const evidenceRows = buildV2EvidenceRows(node.evidenceIds);
    const handoffText = formatV2HandoffText({
      source: handoffSource,
      slug,
      documented: agentTarget.documented,
      kind: node.kind,
      domainTitle: null,
      contains: groups.contains.total,
      usedBy: groups.usedBy.total,
      dependsOn: groups.dependsOn.total,
      belongsTo: groups.belongsTo.total,
      evidence: evidenceRows.length,
      containsNames: groups.contains.rows.map((connection) => connection.title),
      usedByNames: groups.usedBy.rows.map((connection) => connection.title),
      dependsNames: groups.dependsOn.rows.map((connection) => connection.title),
      belongsToNames: groups.belongsTo.rows.map((connection) => connection.title),
    });
    return {
      nodeId: node.id,
      title: node.display ?? node.title,
      slug,
      // A document opened from the map keeps a crumb back to its node.
      documentHref: ownSlug
        ? buildDocsVaultHref({ slug: ownSlug, via: buildTopologyReturnMarker(node.id) })
        : null,
      mentionDocumentHref: mentionedInSlug
        ? buildDocsVaultHref({
          slug: mentionedInSlug,
          via: buildTopologyReturnMarker(node.id),
        })
        : null,
      meaningEditHref: buildTopologyMeaningEditorNodeHref(node.id),
      handoffText,
    };
  }, [contextMenuNode, handoffSource, ontologyInsight]);
  // Held through the exit window, or it closes as an empty menu. Keyed by slug and position.
  const contextMenuKey = contextMenuNode
    ? `${contextMenuNode.slug}@${contextMenuNode.x},${contextMenuNode.y}`
    : null;
  const heldContextMenu = useHeldValue(
    contextMenuNode && contextMenuModel
      ? { anchor: { x: contextMenuNode.x, y: contextMenuNode.y }, model: contextMenuModel }
      : null,
    contextMenuKey,
  );

  // Same source as the compact datasheet, so the two surfaces' numbers cannot drift.
  const fullDetailA1Model = useFullDetailA1Model({
    open: fullDetailOpen,
    nodeFocus,
    selectedOntologyNode,
    insight: ontologyInsight,
    changedSlugs,
    nodeBody,
    nodeEditTarget,
    vaultLoaded: vault.manifest !== null,
    onSaveExplanation: saveNodeExplanation,
    datasheet: v2DatasheetModel,
  });
  // The model turns null on close, so the exit window holds it. Keyed by slug: an unkeyed
  //
  // per-render `useMemo` value crashes the map with React #301.
  const heldFullDetailA1Model = useHeldValue(fullDetailA1Model, fullDetailSlug);
  const selectedNodeFocusActive =
    Boolean(
      selectedOntologyNode &&
      ontologyInsight &&
      nodeFocus &&
      !fullDetailOpen &&
      analysisMode !== "path",
    );
  const meaningEditorOpen = Boolean(
    meaningEditorState &&
    meaningEditorSource &&
    meaningEditorState.sourceId === meaningEditorSource.id &&
    selectedNodeFocusActive &&
    !selectedRelationActive &&
    !createNodeOpen &&
    !nodePopoverDismissed,
  );
  // Drives both the Esc ladder's `nodePopoverOpen` and the popover's render guard, so they agree.
  const nodePopoverVisible =
    selectedNodeFocusActive &&
    !meaningWorkbenchOpen &&
    !acpDockFrameOpen &&
    !selectedRelationActive &&
    !createNodeOpen &&
    !nodePopoverDismissed;
  // The panel owns its exit window (`<Surface>` in `OntologyMapDetailPanel`); this only takes the
  // positioner
  // down on its `onExited`. The helper holds the last snapshot while `v2DatasheetModel` is null;
  // another node never inherits it.
  const panelOpen = nodePopoverVisible && Boolean(v2DatasheetModel) && !meaningEditorOpen;
  const [nodePanelMounted, setNodePanelMounted] = useState(false);
  // Set during render: an effect would drop the positioner on the first open frame.
  if ((panelOpen || meaningEditorOpen) && !nodePanelMounted) setNodePanelMounted(true);
  const panelDatasheetModel = useRetainedDatasheetModel(
    v2DatasheetModel,
    selectedOntologyNode?.id ?? null,
  );
  useLayoutEffect(() => {
    if (!panelOpen || detailKeyboardTargetRef.current !== panelDatasheetModel?.nodeId) return;
    // Related-node navigation replaces the inspector; keep focus on its stable close control.
    const close = detailCloseButtonRef.current;
    if (close) {
      close.focus({ preventScroll: true });
      detailKeyboardTargetRef.current = null;
    }
  }, [detailCloseButtonRef, detailKeyboardTargetRef, panelDatasheetModel?.nodeId, panelOpen]);
  const selectedNodeOwnsRightRail = selectedNodeFocusActive && !meaningWorkbenchOpen && !acpDockFrameOpen;
  // The connection card stands where the node inspector does, so the right-rail tiles and activity
  // chip step aside.
  const selectedEdgeOwnsRightRail = edgePanelOpen && !meaningWorkbenchOpen && !acpDockFrameOpen;
  const inspectorOwnsRightRail = selectedNodeOwnsRightRail || selectedEdgeOwnsRightRail;
  const topologyUtilityChromeState = selectedRelationActive
    ? "collapsed-active-relation"
    : inspectorOwnsRightRail
      ? "selected-node-inspector"
      : selectedSlug
        ? "compact-focus"
        : "visible";
  const topologyUtilityChromeCompact =
    reviewUsesSheet ||
    topologyUtilityChromeState === "compact-focus" ||
    topologyUtilityChromeState === "selected-node-inspector" ||
    agentDockRequestedOpen;
  // See `search-lane-density.ts` for the measured band.
  const searchLaneCrowded = isSearchLaneCrowded({
    viewportBelowCrowdedWidth: useViewportBelow(SEARCH_LANE_CROWDED_BELOW_PX),
    indexExpanded: renderedIndexState === "expanded",
  });
  // Below `lg` the node sheet covers the expanded INDEX, whose controls stay tabbable but
  // unpressable,
  // so INDEX is demoted there; at `lg` and above both coexist. `inert` removes rows from focus and
  // the a11y
  // tree, `pointer-events-none` stops stray taps.
  const indexDemotedByNodeSheet =
    useViewportBelow(LG_BREAKPOINT_PX) && nodePanelMounted && Boolean(panelDatasheetModel);
  // Raised only while the activity inbox is open: the lane's `z-20` context traps the inbox under
  // later tiles,
  // and a permanent raise pokes through the scrim (`--z-map-scrim`, 25).
  // Gate: `tests/e2e/agent-activity-placement.spec.ts`.
  const [activityInboxOpen, setActivityInboxOpen] = useState(false);
  const topologyUtilityLaneSuppressionContract = selectedRelationActive
    ? "selected-relation-inspector-owns-right-rail"
    : inspectorOwnsRightRail
      ? "selected-node-inspector-owns-right-rail"
      : undefined;
  return {
    panelDatasheetModel, nodePopoverVisible, topologyUtilityChromeState, topologyUtilityChromeCompact,
    topologyUtilityLaneSuppressionContract, searchLaneCrowded, selectedNodeFocusActive, nodePanelMounted,
    inspectorOwnsRightRail, activityInboxOpen, selectedEdgeOwnsRightRail, setActivityInboxOpen,
    indexDemotedByNodeSheet, panelOpen, meaningEditorOpen, setNodePanelMounted, heldContextMenu,
    contextMenuModel, handleSetPathSource, heldFullDetailA1Model, fullDetailA1Model
  } as const;
}
