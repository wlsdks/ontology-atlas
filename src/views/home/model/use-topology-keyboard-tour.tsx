import type { useTopologyAgentOrchestration } from "./use-topology-agent-orchestration";
import type { useTopologyAuthoring } from "./use-topology-authoring";
import type { useTopologyCanvasFocus } from "./use-topology-canvas-focus";
import type { useTopologyExplorationLenses } from "./use-topology-exploration-lenses";
import type { useTopologyGraphProjection } from "./use-topology-graph-projection";
import type { useTopologyInspectorState } from "./use-topology-inspector-state";
import type { useTopologyNavigationActions } from "./use-topology-navigation-actions";
import type { useTopologyRouteControls } from "./use-topology-route-controls";

import { type ProjectImpactMode } from "@/entities/project";
import { useFirstRunSampleModeSettled } from "@/features/first-run-starter";
import { canAutoStartGuidedTour, readGuideAutoStart, readGuidedTourStatus, resolveAnchorRect, useGuidedTour, useGuidedTourAutoStartReady, useRegisterGuideReplay, watchGuidedTourAutoStartCancel, type TourAnchor } from "@/features/guided-tour";
import { useClaimShellKey } from "@/shared/lib/shell-key-claims";
import { useTypingShortcuts } from "@/shared/lib/use-typing-shortcut";
import { useCallback, useEffect, useEffectEvent, useRef } from "react";
import { shouldSuppressGlobalShortcuts } from "../lib/blocking-surface";
import { resolveTourAnchorNodeId } from "../lib/resolve-tour-anchor-node";
import { resolveTopologyEscLadderAction } from "../lib/topology-esc-ladder";
import { useFocusReturnOnClose } from "./use-focus-return-on-close";

const CANVAS_RETURN = ["ontology-map-canvas"] as const;
/** The tidy row that opens it on a populated map; the canvas otherwise. */
const BOOTSTRAP_RETURN = ["topology-index-uncataloged-docs", "ontology-map-canvas"] as const;
/** The popover's own "full detail" button, still under the closed overlay. */
const FULL_DETAIL_RETURN = ["map-detail-panel-open-full-detail", "ontology-map-canvas"] as const;
const TOUR_RETURN = ["topology-tour-button", "ontology-map-canvas"] as const;

interface Options {
  setOntologySearchOpen: React.Dispatch<React.SetStateAction<boolean>>;
  setShortcutsOpen: React.Dispatch<React.SetStateAction<boolean>>;
  setDocsDrawerOpen: React.Dispatch<React.SetStateAction<boolean>>;
  tourAutoStartReady: ReturnType<typeof useGuidedTourAutoStartReady>;
  ontologySearchOpen: boolean;
  localGraphRoot: string | null;
  setLocalGraphStack: React.Dispatch<React.SetStateAction<string[]>>;
  setRouteState: (updater: Partial<import("@/views/home/model/url-state").HomeRouteState> | ((current: import("@/views/home/model/url-state").HomeRouteState) => import("@/views/home/model/url-state").HomeRouteState), options?: import("@/views/home/model/use-home-route-state").HomeRouteStateUpdateOptions | undefined) => void;
  sampleModeSettled: ReturnType<typeof useFirstRunSampleModeSettled>;
  requestVaultOpen: () => void;
  topologyAgentOrchestration: Pick<ReturnType<typeof useTopologyAgentOrchestration>, "agentDockOpen">;
  topologyExplorationLenses: Pick<ReturnType<typeof useTopologyExplorationLenses>, "routedConstellation" | "setActiveConstellation">;
  topologyRouteControls: Pick<ReturnType<typeof useTopologyRouteControls>, "handleExitRealm">;
  topologyInspectorState: Pick<ReturnType<typeof useTopologyInspectorState>, "nodePopoverVisible">;
  topologyCanvasFocus: Pick<
    ReturnType<typeof useTopologyCanvasFocus>,
    | "contextMenuNode"
    | "fullDetailOpen"
    | "selectedRelationActive"
    | "closeContextMenu"
    | "setFullDetailSlug"
    | "setSelectedRelationActive"
    | "setNodePopoverDismissed"
  >;
  topologyAuthoring: Pick<
    ReturnType<typeof useTopologyAuthoring>,
    | "setSelectedEdge"
    | "closeCreateNode"
    | "selectedEdge"
    | "createNodeOpen"
    | "bootstrapOpen"
    | "setBootstrapOpen"
    | "acpTurnActivityFrame"
  >;
  topologyNavigationActions: Pick<ReturnType<typeof useTopologyNavigationActions>, "handleClose" | "handleSelect">;
  topologyGraphProjection: Pick<ReturnType<typeof useTopologyGraphProjection>, "ontologyMapGraph" | "canvasSelectedSlug" | "resolvedRealmSlug">;
}
export function useTopologyKeyboardTour({
  setOntologySearchOpen, setShortcutsOpen, setDocsDrawerOpen, tourAutoStartReady, ontologySearchOpen,
  localGraphRoot, setLocalGraphStack, setRouteState, sampleModeSettled, requestVaultOpen,
  topologyGraphProjection, topologyNavigationActions, topologyAuthoring, topologyCanvasFocus,
  topologyInspectorState, topologyRouteControls, topologyExplorationLenses, topologyAgentOrchestration
}: Options) {
  const { ontologyMapGraph, canvasSelectedSlug, resolvedRealmSlug } = topologyGraphProjection;
  const { handleClose, handleSelect } = topologyNavigationActions;
  const { setSelectedEdge, closeCreateNode, selectedEdge, createNodeOpen, bootstrapOpen, setBootstrapOpen, acpTurnActivityFrame } = topologyAuthoring;
  const {
    contextMenuNode, fullDetailOpen, selectedRelationActive, closeContextMenu, setFullDetailSlug,
    setSelectedRelationActive, setNodePopoverDismissed
  } = topologyCanvasFocus;
  const { nodePopoverVisible } = topologyInspectorState;
  const { handleExitRealm } = topologyRouteControls;
  const { routedConstellation, setActiveConstellation } = topologyExplorationLenses;
  const { agentDockOpen } = topologyAgentOrchestration;


  // Resolves DOM or canvas anchors here and hands the tour feature a boolean, since features may
  // not import widgets.
  const canResolveTourAnchor = useCallback(
    (anchor: TourAnchor) => {
      if (anchor === null) return true;
      if (anchor.type === "canvas-node") {
        return resolveTourAnchorNodeId(ontologyMapGraph.nodes, anchor.target) !== null;
      }
      return resolveAnchorRect(anchor.value) !== null;
    },
    [ontologyMapGraph],
  );
  const tour = useGuidedTour({
    hasSelection: canvasSelectedSlug != null,
    canResolveAnchor: canResolveTourAnchor,
    // Keeping the selection collapses the utility lane and hides the next step's anchor for good.
    onLeaveDatasheet: handleClose,
  });
  const tourAnchorRef = useRef<HTMLDivElement | null>(null);
  const tourAnchorNodeId =
    tour.open && tour.step && tour.step.anchor !== null && tour.step.anchor.type === "canvas-node"
      ? resolveTourAnchorNodeId(ontologyMapGraph.nodes, tour.step.anchor.target)
      : null;
  const activateTourAnchor = useCallback(() => {
    if (!tourAnchorNodeId) return;
    setSelectedEdge(null);
    handleSelect(tourAnchorNodeId);
  }, [handleSelect, tourAnchorNodeId, setSelectedEdge]);
  // Opening the tour retires other transient surfaces, like the create-node composer.
  const openGuidedTour = useCallback(() => {
    setOntologySearchOpen(false);
    setShortcutsOpen(false);
    setDocsDrawerOpen(false);
    closeCreateNode();
    tour.start();
  }, [closeCreateNode, setDocsDrawerOpen, setOntologySearchOpen, setShortcutsOpen, tour]);

  // The settings guide row sits in the same place on every destination; the map registers this
  // function.
  useRegisterGuideReplay(openGuidedTour);

  // Starts once when sample mode settles and no done/skipped status is stored; never for
  // local-vault users.
  const autoTourFiredRef = useRef(false);
  // `openGuidedTour` changes every render, so a ref keeps this effect's deps
  // to `tourAutoStartReady` alone, or the timer resets every render and never fires.
  const openGuidedTourRef = useRef(openGuidedTour);
  useEffect(() => {
    openGuidedTourRef.current = openGuidedTour;
  }, [openGuidedTour]);
  useEffect(() => {
    if (autoTourFiredRef.current || !tourAutoStartReady) return undefined;
    if (!readGuideAutoStart()) return undefined;
    // Once turned off, nothing appears by itself; the compass tile and settings replay still open
    // it.
    if (readGuidedTourStatus() !== null) return undefined;
    // Fires at the first moment nothing covers it (no modal open, document focused), starting 900
    // ms in. No retry cap: a cap let a long folder-picker visit lose the tour for good. The first
    // real interaction while waiting cancels it, so a card never cuts across a panel the person
    // just opened.
    let timerId = 0;
    const tick = () => {
      if (autoTourFiredRef.current) return;
      if (canAutoStartGuidedTour()) {
        autoTourFiredRef.current = true;
        stopInteractionWatch();
        openGuidedTourRef.current();
        return;
      }
      timerId = window.setTimeout(tick, 2000);
    };
    const stopInteractionWatch = watchGuidedTourAutoStartCancel(() => {
      autoTourFiredRef.current = true;
      window.clearTimeout(timerId);
    });
    timerId = window.setTimeout(tick, 900);
    return () => {
      window.clearTimeout(timerId);
      stopInteractionWatch();
    };
  }, [tourAutoStartReady]);

  // One Escape closes one surface in `resolveTopologyEscLadderAction` order, the shortcut sheet's
  // promise (`docs/features/keyboard.md`). `defaultPrevented` is checked first because Radix closes
  // on a capture-phase document listener before this bubble-phase window listener runs; `searchOpen`
  // stays a testable input for surfaces that do not prevent. The bubble phase keeps it from
  // reordering local Escape handlers.
  const handleTopologyEscape = useEffectEvent((event: globalThis.KeyboardEvent) => {
    if (event.key !== "Escape") return;
    if (event.defaultPrevented) return;
    // An Escape inside the chat panel is not the map's: cancelling an IME composition there must
    // not clear the map selection behind it. The panel closes its own things.
    const target = event.target;
    if (
      target instanceof Element &&
      target.closest('[data-testid="acp-chat-panel"], [data-testid="vault-agent-panel"]')
    ) {
      return;
    }
    const action = resolveTopologyEscLadderAction({
      realmActive: resolvedRealmSlug !== null,
      selectedEdgeActive: selectedEdge !== null,
      contextMenuOpen: contextMenuNode !== null,
      tourOpen: tour.open,
      createNodeOpen,
      bootstrapOpen,
      searchOpen: ontologySearchOpen,
      fullDetailOpen,
      selectedRelationActive,
      hasSelection: canvasSelectedSlug != null,
      nodePopoverOpen: nodePopoverVisible,
      hasLocalGraphRoot: localGraphRoot !== null,
    });
    // Inside a realm, Escape returns to the whole map before anything else.
    if (action === "close-realm") {
      handleExitRealm();
      return;
    }
    switch (action) {
      case "close-edge-popover":
        // The popover returns focus to its trigger itself (`OntologyMapEdgePanel`).
        setSelectedEdge(null);
        break;
      case "close-context-menu":
        closeContextMenu();
        break;
      case "close-tour":
        // Closes only the tour (records `skipped`): one keypress, one surface.
        tour.skip();
        break;
      case "close-create-node":
        closeCreateNode();
        break;
      case "close-bootstrap":
        setBootstrapOpen(false);
        break;
      case "close-full-detail":
        setFullDetailSlug(null);
        break;
      case "close-relation-lens":
        setSelectedRelationActive(false);
        break;
      case "close-node-popover":
        // Keeps ego focus; the next Escape sees `nodePopoverOpen: false` and deselects.
        setNodePopoverDismissed(true);
        break;
      case "deselect":
        handleClose();
        break;
      case "pop-local-graph":
        setLocalGraphStack((stack) => stack.slice(0, -1));
        break;
      case "none":
        if (routedConstellation) {
          setActiveConstellation(null);
          setRouteState({ constellationIntent: null });
        }
        break;
    }
  });

  useEffect(() => {
    const handler = (event: globalThis.KeyboardEvent) => {
      handleTopologyEscape(event);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  // Each names its opening control first, then the canvas; see `useFocusReturnOnClose`.
  useFocusReturnOnClose(bootstrapOpen, BOOTSTRAP_RETURN);
  useFocusReturnOnClose(createNodeOpen, CANVAS_RETURN);
  useFocusReturnOnClose(fullDetailOpen, FULL_DETAIL_RETURN);
  useFocusReturnOnClose(tour.open, TOUR_RETURN);

  const handleSelectImpactMode = useCallback(
    (nextMode: ProjectImpactMode) => {
      setRouteState((current) => ({
        ...current,
        impactMode: nextMode,
      }));
    },
    [setRouteState],
  );

  // One predicate (`blocking-surface`) silences global shortcuts while a blocking surface is open.
  const shortcutsSuppressed = shouldSuppressGlobalShortcuts({
    createNodeOpen,
    tourOpen: tour.open,
    // `blocked`: the agent stopped and the permission card waits.
    agentAwaitingDecision: acpTurnActivityFrame?.activity.state === "blocked",
  });

  // The map answers ⌘K and `?` itself (`shell-key-claims.ts`), so both join the Esc order and
  // suppression.
  useClaimShellKey("search");
  useClaimShellKey("shortcuts");

  // ⌘K opens the one palette of nodes and projects; Shift changes nothing, so the sheet lists ⌘K
  // alone.
  useTypingShortcuts([
    {
      combo: { key: "k", meta: true },
      onFire: () => {
        if (shortcutsSuppressed) return;
        setOntologySearchOpen((v) => !v);
      },
    },
    {
      combo: { key: "?" },
      onFire: () => {
        if (shortcutsSuppressed) return;
        setShortcutsOpen((v) => !v);
      },
    },
    {
      combo: { key: "d" },
      onFire: () => {
        if (shortcutsSuppressed) return;
        // With the agent dock open, D would cover the conversation with the full-width documents
        // drawer;
        // the dock is not modal, so only this shortcut goes quiet.
        if (agentDockOpen) return;
        setDocsDrawerOpen((v) => !v);
      },
    },
    {
      // ⌘O switches from the sample to the user's folder; the first-run hint and the top pill
      // point here.
      // With a real vault the gate is off.
      combo: { key: "o", meta: true },
      onFire: () => {
        if (shortcutsSuppressed) return;
        if (!sampleModeSettled) return;
        requestVaultOpen();
      },
    },
  ]);
  return { openGuidedTour, tour, tourAnchorNodeId, tourAnchorRef, handleSelectImpactMode, activateTourAnchor } as const;
}
