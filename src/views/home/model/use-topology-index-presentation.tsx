import type { useHomeWorkbenchController } from "./use-home-workbench-controller";
import type { useTopologyAuthoring } from "./use-topology-authoring";
import type { useTopologyCanvasFocus } from "./use-topology-canvas-focus";
import type { useTopologyRouteControls } from "./use-topology-route-controls";
import type { useTopologyVaultReadModel } from "./use-topology-vault-read-model";

import { readFirstRunStarterDismissed, writeFirstRunStarterDismissed } from "@/features/first-run-starter";
import { useSurfaceSwap } from "@/shared/lib/use-presence";
import { VAULT_START_STEPS_DISMISSED_KEY } from "@/widgets/topology-controls";
import { useCallback, useLayoutEffect, useRef, useState } from "react";
import { resolveContextualIndexState } from "../lib/resolve-contextual-index-state";
import { useIndexSelectionOverride } from "./use-index-selection-override";

interface Options {
  v2DatasheetModel: { slug: string; nodeId: string; title: string; sourceTitle: string | null; kind: string; domain: { id: string; title: string; } | null; powered: boolean; updatedAtLabel: string | null; metric: { contains: number; usedBy: number; dependsOn: number; belongsTo: number; evidence: number; }; groups: import("@/widgets/ontology-map/ui/map-datasheet").V2ConnectionGroupsView; evidence: { rows: import("@/widgets/ontology-map/ui/map-datasheet").V2EvidenceRow[]; total: number; }; codeLocations: string[]; handoffText: string; documentHref: string | null; mentionDocumentHref: string | null; meaningEditHref: string; lastEditSubject: { kind: import("@/shared/lib/last-edit-subject").LastEditSubjectKind; ageLabel: string; } | null; mtimeConflict: boolean; } | null;
  analysisMode: import("@/views/home/model/url-state").TopologyAnalysisMode;
  setRouteState: (updater: Partial<import("@/views/home/model/url-state").HomeRouteState> | ((current: import("@/views/home/model/url-state").HomeRouteState) => import("@/views/home/model/url-state").HomeRouteState), options?: import("@/views/home/model/use-home-route-state").HomeRouteStateUpdateOptions | undefined) => void;
  routeState: import("@/views/home/model/url-state").HomeRouteState;
  meaningEditorIntent: boolean;
  indexState: import("@/widgets/topology-index-panel/lib/index-panel-state").IndexPanelState | null;
  topologyAuthoring: Pick<ReturnType<typeof useTopologyAuthoring>, "canCreateNode" | "selectedEdge">;
  homeWorkbenchController: Pick<ReturnType<typeof useHomeWorkbenchController>, "meaningWorkbenchOpen" | "acpDockFrameOpen" | "vaultAgentOpen">;
  topologyVaultReadModel: Pick<ReturnType<typeof useTopologyVaultReadModel>, "ontologyInsight" | "llmBridgeAvailable">;
  topologyRouteControls: Pick<
    ReturnType<typeof useTopologyRouteControls>,
    | "setIndexPreference"
    | "setIndexManualExpandWhileEmpty"
    | "baseRenderedIndexState"
    | "indexManualExpandWhileEmpty"
  >;
  topologyCanvasFocus: Pick<ReturnType<typeof useTopologyCanvasFocus>, "nodePopoverDismissed" | "nodePopoverPositionerRef" | "lastCanvasPointerRef">;
}
export function useTopologyIndexPresentation({
  v2DatasheetModel, analysisMode, setRouteState, routeState, meaningEditorIntent, indexState,
  topologyCanvasFocus, topologyRouteControls, topologyVaultReadModel, homeWorkbenchController,
  topologyAuthoring
}: Options) {
  const { nodePopoverDismissed, nodePopoverPositionerRef, lastCanvasPointerRef } = topologyCanvasFocus;
  const { setIndexPreference, setIndexManualExpandWhileEmpty, baseRenderedIndexState, indexManualExpandWhileEmpty } = topologyRouteControls;
  const { ontologyInsight, llmBridgeAvailable } = topologyVaultReadModel;
  const { meaningWorkbenchOpen, acpDockFrameOpen, vaultAgentOpen } = homeWorkbenchController;
  const { canCreateNode, selectedEdge } = topologyAuthoring;

  // Bound to the datasheet being shown, so after the first Esc (popover closed, selection kept)
  // INDEX returns. An open edge panel docks in the same slot, so INDEX yields to it too. The realm
  // ledger is exempt as a realm's only exit.
  const topologySelectionActive = (Boolean(v2DatasheetModel) && !nodePopoverDismissed) || selectedEdge !== null;
  const {
    manualExpand: indexManualExpandDuringSelection,
    markManualExpand: markIndexManualExpandDuringSelection,
    beginExpandedSelection: beginExpandedIndexSelection,
  } = useIndexSelectionOverride(topologySelectionActive);
  // The analysis rail owns the slot only in a non-overview mode, so returning to overview gives it
  // back.
  const handleIndexTabExpand = useCallback(() => {
    setIndexPreference("expanded");
    // A manual expand wins for the rest of the selection; the selection-session hook resets it.
    markIndexManualExpandDuringSelection();
    // Same for the empty-map demotion, or it re-collapses every render.
    setIndexManualExpandWhileEmpty(true);
    if (analysisMode !== "overview") {
      setRouteState((current) => ({ ...current, analysisMode: "overview" }));
    }
  }, [analysisMode, markIndexManualExpandDuringSelection, setIndexManualExpandWhileEmpty, setIndexPreference, setRouteState]);
  // Toasts stand between the walls INDEX and the dock declare (`data-toast-wall`), so the map
  // plants no offset.
  const readoutStackRef = useRef<HTMLDivElement | null>(null);
  // Aligns the popover's growth origin with the clicked node: the panel remounts per slug, so the
  // origin is injected as a CSS variable before paint. Without a canvas pointer in the last 600 ms
  // it falls back to `center top`.
  const nodePopoverSlug = v2DatasheetModel?.slug ?? null;
  useLayoutEffect(() => {
    const positioner = nodePopoverPositionerRef.current;
    if (!positioner || nodePopoverSlug === null) return;
    const pointer = lastCanvasPointerRef.current;
    if (pointer === null || performance.now() - pointer.at > 600) {
      positioner.style.removeProperty("--topology-chrome-in-origin");
      return;
    }
    const rect = positioner.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) {
      positioner.style.removeProperty("--topology-chrome-in-origin");
      return;
    }
    // Clamped inside the top-right-anchored panel, so it grows from the node's corner.
    const ox = Math.max(0, Math.min(rect.width, pointer.x - rect.left));
    const oy = Math.max(0, Math.min(rect.height, pointer.y - rect.top));
    positioner.style.setProperty("--topology-chrome-in-origin", `${ox}px ${oy}px`);
  }, [lastCanvasPointerRef, nodePopoverPositionerRef, nodePopoverSlug]);
  // The realm and spotlight ledgers also close during a selection, returning when it clears;
  // the chips' ✕ and Esc remain their exits.
  const topologyGraphEmpty = (ontologyInsight?.nodes.length ?? 0) === 0;
  // The agent dock applies the same session demotion, or the map becomes a corridor between two
  // panels.
  // The stored preference is untouched; a URL ask intent follows the same rule from its first
  // frame.
  const agentDockRequestedOpen =
    meaningWorkbenchOpen ||
    acpDockFrameOpen ||
    vaultAgentOpen ||
    Boolean(
      llmBridgeAvailable &&
      (routeState.askIntent || routeState.askBusinessFlow),
    );
  // The checklist centres in the map area, so INDEX yields while it shows. Declared here
  // because `resolveContextualIndexState` below needs it before INDEX resolves.
  const [startStepsDismissed, setStartStepsDismissed] = useState(() =>
    readFirstRunStarterDismissed(VAULT_START_STEPS_DISMISSED_KEY),
  );
  /** Session scoped, so reopening the app shows the guidance again. */
  const dismissStartSteps = useCallback(() => {
    writeFirstRunStarterDismissed(VAULT_START_STEPS_DISMISSED_KEY);
    setStartStepsDismissed(true);
  }, []);

  const startStepsVisible =
    canCreateNode && !startStepsDismissed && !agentDockRequestedOpen;

  const renderedIndexState = resolveContextualIndexState({
    baseState: baseRenderedIndexState,
    meaningEditorOpen: Boolean(meaningEditorIntent),
    selectionActive: topologySelectionActive,
    // `?index=expanded` is an explicit deep-link contract; legacy `/ontology?node=` redirects
    // carry it.
    selectionManualExpand:
      indexManualExpandDuringSelection || indexState === "expanded",
    graphEmpty: topologyGraphEmpty,
    emptyManualExpand: indexManualExpandWhileEmpty,
    agentDockOpen: agentDockRequestedOpen,
  });
  /**
   * Collapse and expand are one event: leaving, arriving and the map start on the same frame,
   *
   * within `--motion-fast`. The exit window is the shared `EXIT_WINDOW_MS`.
   */
  const indexSlotSwap = useSurfaceSwap(renderedIndexState);
  return {
    indexSlotSwap, renderedIndexState, agentDockRequestedOpen, handleIndexTabExpand,
    beginExpandedIndexSelection, startStepsVisible, dismissStartSteps, readoutStackRef
  };
}
