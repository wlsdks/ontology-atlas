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

  // The "path" action tile sets this node as the path-analysis source and
  // enters path mode. Reuses `selectTopologyPathRouteState` (already defined
  // in `model/url-state.ts` for the URL-driven path deep link, but never
  // wired to an in-app interaction until now) — no new path-mode entry logic.
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
  // Context-menu quick-action model — same construction as
  // `v2DatasheetModel` (documentHref/meaningEditHref/handoffText), but keyed
  // off whichever node was right-clicked rather than the current selection,
  // since the context menu is reachable without selecting the node first.
  // `domainTitle: null` in the handoff payload is a deliberate simplification
  // (the owner-domain lookup lives in `buildNodeSignificance`, which needs the
  // full drawer model this quick lookup intentionally skips) — the payload
  // still degrades to `domain: -`, never throws or omits the field.
  const contextMenuModel = useMemo(() => {
    if (!contextMenuNode || !ontologyInsight) return null;
    const node = ontologyInsight.nodes.find((n) => n.id === contextMenuNode.slug);
    if (!node) return null;
    const sourceSlug = node.evidenceIds[0] ?? null;
    // Own document vs. a document that merely mentions it. The context menu has no
    // evidence list, so simply dropping the link for a node with no document of its
    // own would lose the information; the label changes instead and stays honest.
    const { ownSlug, mentionedInSlug } = resolveNodeDocument(node);
    // The handoff text carries the name the vault knows: the document slug, or the
    // reference as written.
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
      // Same return marker as the datasheet model: a document opened from the map keeps a
      // crumb back to the node it was opened from.
      documentHref: ownSlug
        ? buildDocsVaultHref({ slug: ownSlug, via: buildTopologyReturnMarker(node.id) })
        : null,
      mentionDocumentHref: mentionedInSlug
        ? buildDocsVaultHref({
          slug: mentionedInSlug,
          via: buildTopologyReturnMarker(node.id),
        })
        : null,
      // Editor deep links always use the canonical `<kind>:<slug>` graph node id.
      meaningEditHref: buildTopologyMeaningEditorNodeHref(node.id),
      handoffText,
    };
  }, [contextMenuNode, handoffSource, ontologyInsight]);
  /*
   * The context menu has an exit window too, and its anchor and model must be held
   * through it or it becomes an empty menu while closing. The key is slug + position:
   * right-clicking the same node somewhere else is a new value.
   */
  const contextMenuKey = contextMenuNode
    ? `${contextMenuNode.slug}@${contextMenuNode.x},${contextMenuNode.y}`
    : null;
  const heldContextMenu = useHeldValue(
    contextMenuNode && contextMenuModel
      ? { anchor: { x: contextMenuNode.x, y: contextMenuNode.y }, model: contextMenuModel }
      : null,
    contextMenuKey,
  );

  // Full detail is the datasheet expanded. Its groups and reach come from the same
  // source as the compact datasheet (derived from `buildV2Connections`, reusing
  // `buildOntologyReachability`), so the two surfaces' numbers cannot drift.
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
  /*
   * Full detail's model **becomes null the instant it closes** — that is exactly the
   * gate against deriving a model for a surface that is not on screen — so opening an
   * exit window means holding the value too. The key is the slug: this model comes
   * from a `useMemo` whose identity changes every render, and passing it with no key
   * kills the whole map with React #301 (measured on the edge panel).
   */
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
  // Whether the compact node popover is actually on screen (the same condition the
  // popover JSX renders under). Drives both the Esc dismissal order's
  // `nodePopoverOpen` step and the popover's own render guard, so the two can never
  // disagree about whether the first Esc should close it.
  const nodePopoverVisible =
    selectedNodeFocusActive &&
    !meaningWorkbenchOpen &&
    !acpDockFrameOpen &&
    !selectedRelationActive &&
    !createNodeOpen &&
    !nodePopoverDismissed;
  // Popover entrance/exit symmetry. When `panelOpen` drops to false the panel is not
  // unmounted immediately but kept for the exit animation (~120 ms). During the exit
  // the selection-derived `v2DatasheetModel` goes null, so the helper holds its latest
  // immutable snapshot. A different selected node gets no old snapshot while its own
  // model is still unavailable.
  //
  // 2026-08-03: **the exit window now belongs to the panel** (the `<Surface>` inside
  // `OntologyMapDetailPanel`). The old `usePanelPresence` + `presence` prop pairing kept
  // the window in the parent and only told the child which class to wear, which made
  // "does this surface have a way out" a fact living outside the panel's own file —
  // somewhere the hard-cut ratchet's detector cannot see. All that remains here is
  // **when to take the positioner down**, and the answer is the panel's own `onExited`
  // notification: two exit timers on one surface means neither is the truth.
  const panelOpen = nodePopoverVisible && Boolean(v2DatasheetModel) && !meaningEditorOpen;
  const [nodePanelMounted, setNodePanelMounted] = useState(false);
  // Adjusted during render. Raising this in an effect leaves the positioner missing on
  // the first open frame and delays the entrance by one frame (`useHeldValue` holds
  // during render for the same reason).
  if ((panelOpen || meaningEditorOpen) && !nodePanelMounted) setNodePanelMounted(true);
  const panelDatasheetModel = useRetainedDatasheetModel(
    v2DatasheetModel,
    selectedOntologyNode?.id ?? null,
  );
  useLayoutEffect(() => {
    if (!panelOpen || detailKeyboardTargetRef.current !== panelDatasheetModel?.nodeId) return;
    // Related-node navigation replaces the inspector and its focused row. Keep
    // keyboard focus on the new inspector's stable, visible close control.
    const close = detailCloseButtonRef.current;
    if (close) {
      close.focus({ preventScroll: true });
      detailKeyboardTargetRef.current = null;
    }
  }, [detailCloseButtonRef, detailKeyboardTargetRef, panelDatasheetModel?.nodeId, panelOpen]);
  const selectedNodeOwnsRightRail = selectedNodeFocusActive && !meaningWorkbenchOpen && !acpDockFrameOpen;
  /*
   * The connection card stands where the node inspector stands (same right inset, same
   * top), so it owns the right rail on the same terms: the help, agent and recent tiles
   * and the activity chip step aside while it is up. Owner's screen, 2026-09-06: with a
   * relation card open the tiles and the "Claude Agent, last worked" chip sat under
   * its header, half covered.
   */
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
  // Width-driven compaction of the search lane alone — see `search-lane-density.ts`
  // for the measured band. The utility group keeps its own state-driven rule.
  const searchLaneCrowded = isSearchLaneCrowded({
    viewportBelowCrowdedWidth: useViewportBelow(SEARCH_LANE_CROWDED_BELOW_PX),
    indexExpanded: renderedIndexState === "expanded",
  });
  /*
   * `<lg` the selected-node sheet and the expanded INDEX are **not two surfaces
   * sharing a screen** — the sheet is drawn over the INDEX. Measured 2026-09-05
   * (390×844 and 834×1112, node picked from the INDEX tree): 24 of the INDEX's 25
   * controls hit-tested to the sheet, so every one of them was a control the user
   * could see, could reach with Tab, and could not press. At `lg` and above the two
   * genuinely coexist — the approved chrome spec draws both over the map — so this
   * is a width-bound demotion, not a new exclusivity rule.
   *
   * `inert` and `pointer-events-none` are one pair: `inert` removes the rows from the
   * a11y tree and the focus order, `pointer-events-none` keeps a stray tap from
   * landing on a row the sheet is painting over. The wrapper already uses exactly
   * this pair for its exit frame.
   */
  const indexDemotedByNodeSheet =
    useViewportBelow(LG_BREAKPOINT_PX) && nodePanelMounted && Boolean(panelDatasheetModel);
  /*
   * The utility lane is raised one step **only while the activity inbox is open**.
   * Owner, 2026-08-17: *"Should the notification cover what is above?"* (the notification should cover what is
   * above). The lane's `z-20` creates a stacking context the inbox inside it cannot
   * escape, so the right-hand tool tiles — also `z-20` but later in the DOM — painted
   * over it. It is not raised permanently because the lane would then poke through the
   * scrim (`--z-map-scrim`, 25) whenever the scrim is meant to cover it.
   * Gate: `tests/e2e/agent-activity-placement.spec.ts`.
   */
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
