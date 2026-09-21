import type { useHomeWorkbenchController } from "./use-home-workbench-controller";
import type { useTopologyAuthoring } from "./use-topology-authoring";
import type { useTopologyCanvasFocus } from "./use-topology-canvas-focus";
import type { useTopologyRouteControls } from "./use-topology-route-controls";
import type { useTopologyVaultReadModel } from "./use-topology-vault-read-model";

import { readFirstRunStarterDismissed, writeFirstRunStarterDismissed } from "@/features/first-run-starter";
import { useSurfaceSwap } from "@/shared/lib/use-presence";
import { TOAST_TOP_OFFSET_UNDER_MAP_TOOLBAR_PX } from "@/shared/ui/toast-position";
import { VAULT_START_STEPS_DISMISSED_KEY } from "@/widgets/topology-controls";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { resolveContextualIndexState } from "../lib/resolve-contextual-index-state";
import { useIndexSelectionOverride } from "./use-index-selection-override";

interface Options {
  v2DatasheetModel: { slug: string; nodeId: string; title: string; sourceTitle: string | null; kind: string; domain: { id: string; title: string; } | null; powered: boolean; updatedAtLabel: string | null; metric: { contains: number; usedBy: number; dependsOn: number; belongsTo: number; evidence: number; }; groups: import("@/widgets/ontology-map/ui/map-datasheet").V2ConnectionGroupsView; evidence: { rows: import("@/widgets/ontology-map/ui/map-datasheet").V2EvidenceRow[]; total: number; }; codeLocations: string[]; handoffText: string; documentHref: string | null; mentionDocumentHref: string | null; meaningEditHref: string; lastEditSubject: { kind: import("@/shared/lib/last-edit-subject").LastEditSubjectKind; ageLabel: string; } | null; mtimeConflict: boolean; } | null;
  analysisMode: import("@/views/home/model/url-state").TopologyAnalysisMode;
  setRouteState: (updater: Partial<import("@/views/home/model/url-state").HomeRouteState> | ((current: import("@/views/home/model/url-state").HomeRouteState) => import("@/views/home/model/url-state").HomeRouteState), options?: import("@/views/home/model/use-home-route-state").HomeRouteStateUpdateOptions | undefined) => void;
  routeState: import("@/views/home/model/url-state").HomeRouteState;
  meaningEditorIntent: boolean;
  indexState: import("@/widgets/topology-index-panel/lib/index-panel-state").IndexPanelState | null;
  topologyAuthoring: Pick<ReturnType<typeof useTopologyAuthoring>, "canCreateNode">;
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
  const { canCreateNode } = topologyAuthoring;

  // Bound to the datasheet being *shown*, not merely to its model existing, so the Esc
  // dismissal order is honoured: after the first press (popover closed, selection
  // kept) the left panel must come back. The realm ledger is exempt from the
  // automatic demotion because it is a realm's only exit and navigation surface.
  const topologySelectionActive = Boolean(v2DatasheetModel) && !nodePopoverDismissed;
  const {
    manualExpand: indexManualExpandDuringSelection,
    markManualExpand: markIndexManualExpandDuringSelection,
    beginExpandedSelection: beginExpandedIndexSelection,
  } = useIndexSelectionOverride(topologySelectionActive);
  // Clicking the collapsed edge tab always means "give the slot back to
  // INDEX" — the analysis rail owns the slot only because of a non-overview
  // mode (focus/path/health), so returning to overview is always enough.
  const handleIndexTabExpand = useCallback(() => {
    setIndexPreference("expanded");
    // A manual expand during a selection beats the automatic demotion for the rest
    // of that selection. The selection-session hook resets this at the exact
    // inactive/active transition, before the next frame can inherit it.
    markIndexManualExpandDuringSelection();
    // Same for the empty-map demotion. Without this line the tab depresses and
    // nothing happens, because the demotion re-collapses it every render.
    setIndexManualExpandWhileEmpty(true);
    if (analysisMode !== "overview") {
      setRouteState((current) => ({ ...current, analysisMode: "overview" }));
    }
  }, [analysisMode, markIndexManualExpandDuringSelection, setIndexManualExpandWhileEmpty, setIndexPreference, setRouteState]);
  /*
   * Toasts stand under the map's top toolbar (owner, 2026-09-06: the bottom-right
   * corner sat behind the agent dock and outside the person's attention). The
   * toaster is top-centred everywhere; only the map plants a larger top offset so
   * the box clears the 36px toolbar tiles. `--app-right-dock-width`, published by the
   * dock effect below, keeps it centred over the map area rather than the viewport.
   */
  const readoutStackRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const root = document.documentElement;
    root.style.setProperty("--app-toast-top-offset", `${TOAST_TOP_OFFSET_UNDER_MAP_TOOLBAR_PX}px`);
    return () => {
      root.style.removeProperty("--app-toast-top-offset");
    };
  }, []);
  // Click focus signature — aligns the growth origin (transform-origin) of the popover with the screen coordinates of the just-clicked node.
  // The panel is keyed by slug and re-mounts + triggers `.topology-chrome-in` appearance every time the node changes, so
  // using the slug as a dependency and injecting the origin converted to the positioner's local coordinate system as a CSS variable before paint (useLayoutEffect) (inheritance → internal panels read it). If no recent (<600ms) canvas pointer exists (list/keyboard selection), clears the variable to fall back to existing `center top`.
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
    // Convert the click point into the panel box's local coordinates and clamp it
    // inside. The panel is anchored top-right, so the node is usually down and to the
    // left; making that corner the origin is what reads as the popover growing out of
    // the node.
    const ox = Math.max(0, Math.min(rect.width, pointer.x - rect.left));
    const oy = Math.max(0, Math.min(rect.height, pointer.y - rect.top));
    positioner.style.setProperty("--topology-chrome-in-origin", `${ox}px ${oy}px`);
  }, [lastCanvasPointerRef, nodePopoverPositionerRef, nodePopoverSlug]);
  // Owner follow-up, 2026-07-24: the realm and spotlight ledgers close during a node
  // selection too — having the left and right panels both open at once is
  // uncomfortable. The escape affordance survives in the ✕ on the realm/lens chips and
  // in Esc, so keeping the ledger permanently visible is not required. It returns when
  // the selection clears.
  /** Is this a map with no concepts to hold yet? See `indexManualExpandWhileEmpty`. */
  const topologyGraphEmpty = (ontologyInsight?.nodes.length ?? 0) === 0;
  /*
   * Opening the agent dock on the right puts INDEX through the same session demotion.
   * With both up, the map — the thing you need in order to judge what the agent is
   * changing — is left as a narrow corridor in the middle. No stored preference is
   * touched, so closing the chat restores the user's INDEX state. An ask intent
   * arriving in the URL honours the same spatial contract from its first frame.
   */
  const agentDockRequestedOpen =
    meaningWorkbenchOpen ||
    acpDockFrameOpen ||
    vaultAgentOpen ||
    Boolean(
      llmBridgeAvailable &&
      (routeState.askIntent || routeState.askBusinessFlow),
    );
  /*
   * ⚠️ Lifted out of the JSX so INDEX can yield to it (owner, 2026-08-25). The checklist centres in
   * the map area; with INDEX open that area is not the window, so the surface asking for attention
   * sat off the middle while claiming it. `resolve-contextual-index-state` now collapses INDEX while
   * this is true, which is the same shape as the existing agent-dock and meaning-editor rules.
   */
  // Declared here rather than beside its dismiss handler: `resolveContextualIndexState` below needs
  // it, and INDEX cannot yield to a surface whose visibility is computed after INDEX is resolved.
  const [startStepsDismissed, setStartStepsDismissed] = useState(() =>
    readFirstRunStarterDismissed(VAULT_START_STEPS_DISMISSED_KEY),
  );
  /**
   * Dismisses the first-steps card, meaning the last step is behind them. Session
   * scoped, so reopening the app shows the guidance again.
   */
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
    // `?index=expanded` is an explicit deep-link contract (not merely the
    // stored default). Legacy `/ontology?node=…` redirects carry it so the
    // requested INDEX context stays visible beside the selected node.
    selectionManualExpand:
      indexManualExpandDuringSelection || indexState === "expanded",
    graphEmpty: topologyGraphEmpty,
    emptyManualExpand: indexManualExpandWhileEmpty,
    agentDockOpen: agentDockRequestedOpen,
  });
  /**
   * Collapse ↔ expand is **one event** produced by one click. Previously only the
   * arriving surface got any time and the leaving one got zero frames. Drawing both
   * frames overlapped in the same slot makes **what leaves, what arrives, and the map
   * all start on the same frame**, which structurally guarantees the rule that steps
   * from one input must start within `--motion-fast` of each other.
   *
   * The exit window is the shared `EXIT_WINDOW_MS`: surfaces over the map leaving by
   * different timings would be the same defect again.
   */
  const indexSlotSwap = useSurfaceSwap(renderedIndexState);
  return {
    indexSlotSwap, renderedIndexState, agentDockRequestedOpen, handleIndexTabExpand,
    beginExpandedIndexSelection, startStepsVisible, dismissStartSteps, readoutStackRef
  };
}
