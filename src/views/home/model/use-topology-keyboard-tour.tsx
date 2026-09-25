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
/** The tidy row that opens it on a populated map; the canvas when it came from elsewhere. */
const BOOTSTRAP_RETURN = ["topology-index-uncataloged-docs", "ontology-map-canvas"] as const;
/** The popover's own "full detail" button, still there under the closed overlay. */
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


  // The guided tour (`src/features/guided-tour`) is the map screen's own literacy
  // tour. `canResolveTourAnchor` lets this view resolve a testid (DOM) or canvas-node
  // (graph) anchor and hand the feature only a boolean, because the feature may not
  // import widgets (FSD import direction).
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
    // Measured regression: not clearing the selection on leaving the datasheet step
    // left node focus collapsing the utility lane (including the spotlight toggle), so
    // the recent-changes step's anchor became permanently unresolvable and the step
    // after it unreachable.
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
  // Opening the tour retires the other transient surfaces, following the same
  // "openX closes the rest" convention as the create-node composer.
  const openGuidedTour = useCallback(() => {
    setOntologySearchOpen(false);
    setShortcutsOpen(false);
    setDocsDrawerOpen(false);
    closeCreateNode();
    tour.start();
  }, [closeCreateNode, setDocsDrawerOpen, setOntologySearchOpen, setShortcutsOpen, tour]);

  // The map's own re-entry is the compass tile top right, but the settings menu's
  // guide row has to be in the same place across all seven destinations so nobody hunts
  // for it per screen. The other five register through the shell's `DestinationGuide`;
  // the map registers this function.
  useRegisterGuideReplay(openGuidedTour);

  // First-visit auto tour (onboarding round, 2026-07-24). The tour existed but its
  // only entry point was a rail icon, so non-developers never found it. It starts once
  // when sample mode has settled (first run with no vault chosen, restore attempted)
  // and no done/skipped status is stored. Skipping records `skipped`, so it does not
  // return on a later visit, and for local-vault users `sampleModeSettled` is false so
  // it never fires at all.
  const autoTourFiredRef = useRef(false);
  // `openGuidedTour` depends on the tour object and is rebuilt every render, so as a
  // dependency it made this effect clear its timer every render and never reach the
  // timeout (measured regression). A ref mirror pins the deps to `tourAutoStartReady`
  // alone, and the guard is raised only when it actually fires.
  const openGuidedTourRef = useRef(openGuidedTour);
  useEffect(() => {
    openGuidedTourRef.current = openGuidedTour;
  }, [openGuidedTour]);
  useEffect(() => {
    if (autoTourFiredRef.current || !tourAutoStartReady) return undefined;
    if (!readGuideAutoStart()) return undefined;
    // For anyone who turned the guide off, nothing ever appears by itself. The compass
    // tile and settings › replay still open it, so the guidance is not gone — it only
    // comes when called.
    if (readGuidedTourStatus() !== null) return undefined;
    // The first attempt is 900 ms in, after layout and camera settle, so the first card
    // opens over a stable screen. Stacked-transient guard (Design Guardian,
    // 2026-07-24): if a modal is open at that moment (the folder guide sheet, say) or
    // document focus has left (a background tab load, the OS folder picker), it does not
    // fire on top of it.
    //
    // Retries used to be capped at 10 (~19 s), and that cap was itself the defect:
    // reading the first screen's folder guide sheet and going through the OS picker
    // easily passes 19 s, after which the tour **disappears forever** with nothing
    // recorded in storage. Measured 2026-07-26: leaving the modal up for 27 s meant the
    // tour never appeared.
    //
    // So the cap is gone. It looks like infinite retry, but the behaviour is "**fire at
    // the first moment the way is clear**", which is exactly what is wanted — it does not
    // ambush the user later, it appears as soon as nothing is covering it. A tick is
    // three `querySelector` calls, it stops on fire and on unmount, and it only ever runs
    // for someone who has never seen the tour.
    //
    // But "the first moment the way is clear" can arrive after the user has started
    // exploring on their own. Measured 2026-07-26: after dismissing the sheet with
    // "later", users who clicked a node 2–6 s afterwards got card 1/7 cutting across the
    // detail panel they had just opened. So the first real interaction while waiting
    // **cancels** the fire. (Adding exceptions to the guard instead was already shown to
    // backfire — the guidance covering the very thing it introduces.) Cancelling blocks
    // nothing: settings › guide › replay and the compass tile open the same tour.
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

  // The Esc dismissal order — which surface a single Escape closes, one step at a
  // time (the shortcut sheet's `stepCloseOverlays` promise; `docs/FEATURES.md`). This
  // is an ordering of surfaces, not a ramp of values. The composer, shortcuts, and
  // docs-drawer overlays already close
  // themselves on Escape; this effect covers what previously had no Escape
  // binding at all — the full-detail drawer, the relation lens, the selected
  // node itself, and the local-graph ego-drill breadcrumb (which used to pop
  // unconditionally on every Escape, racing with whatever else was open).
  //
  // `searchOpen: ontologySearchOpen` is passed so the resolver returns "none"
  // while the palette (a Radix `Dialog`) is open — otherwise this
  // window-level handler ALSO fired on the same keypress (e.g. deselecting
  // the node underneath), so one Escape closed both the palette AND the
  // selection.
  //
  // `event.defaultPrevented` is checked FIRST and is what actually closes the
  // race in the browser: Radix's `DismissableLayer` registers its own Escape
  // handler on `document` with `{ capture: true }` (`useEscapeKeydown`) and
  // calls `event.preventDefault()` + synchronously flushes
  // `onOpenChange(false)` — verified live, this had ALREADY happened
  // (`ontologySearchOpen` read back `false`, `event.defaultPrevented` already
  // `true`) by the time this bubble-phase `window` listener ran on the SAME
  // keypress. `searchOpen` stays as an explicit, testable input for the
  // decision table (see `topology-esc-ladder.test.ts`) and covers any future
  // dismissable surface that does the same without calling
  // `preventDefault()`; `defaultPrevented` covers Radix's actual (capture +
  // synchronous-flush) behavior. Kept on the bubble phase (not capture) so
  // this doesn't reorder relative to unrelated local Escape handlers (e.g.
  // inline-field-edit cancel) elsewhere on the page.
  const handleTopologyEscape = useEffectEvent((event: globalThis.KeyboardEvent) => {
    if (event.key !== "Escape") return;
    if (event.defaultPrevented) return;
    /*
     * ⚠️ **An Escape pressed inside the chat panel is not the map's** (2026-08-16
     * review).
     *
     * This listener is on `window` and did not look at `event.target`, so pressing
     * Escape while typing in the chat composer — which a hand does routinely to
     * cancel a Korean IME composition — **cleared the selection on the map behind
     * it**. Changing something the user is not even looking at is not the
     * one-step-at-a-time this order promises.
     *
     * The chat panel closes its own things (the past-conversation list). When it has
     * nothing left to close, nothing happening is the right outcome — better than
     * reaching into the map.
     */
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
    // Leaving a realm comes first in the order: inside a realm, Escape returns to the
    // whole map before anything else, ahead even of the edge popover.
    if (action === "close-realm") {
      handleExitRealm();
      return;
    }
    switch (action) {
      case "close-edge-popover":
        // With the edge popover open, the first Escape closes that — the highest
        // consumer after leaving a realm, the same contract as the node popover. The
        // popover returns focus to its trigger itself (`OntologyMapEdgePanel`).
        setSelectedEdge(null);
        break;
      case "close-context-menu":
        closeContextMenu();
        break;
      case "close-tour":
        // Escape closes only the tour (recording `skipped`) and does not fall
        // through to another surface: one keypress, one surface.
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
        // Hide the popover but keep the ego focus (the dim). The NEXT Escape sees
        // `nodePopoverOpen: false` and falls through to "deselect".
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

  /*
   * Where focus lands when a canvas surface closes, by any path (Escape, cancel, backdrop,
   * finish). Each names the control that opened it first, then the canvas; see
   * `useFocusReturnOnClose`.
   */
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

  // Global shortcuts go dead while a blocking surface is open. This used to be a
  // hand-written `if (createNodeOpen) return;` per surface, which **left the tour
  // out** — the `?` shortcut modal stacking on top of the tour was actually
  // reproducible. One predicate (`blocking-surface`) now decides, so a new surface is
  // one edit in one place.
  const shortcutsSuppressed = shouldSuppressGlobalShortcuts({
    createNodeOpen,
    tourOpen: tour.open,
    // `blocked` is this app's word for "the agent stopped and the permission card is waiting".
    agentAwaitingDecision: acpTurnActivityFrame?.activity.state === "blocked",
  });

  /*
   * The map answers ⌘K and `?` itself, so the shell's own sheet and search stand aside while it
   * is mounted (`shell-key-claims.ts`): its search selects on the canvas, its sheet closes the
   * map's other surfaces, and both take part in the Esc order and the suppression below.
   */
  useClaimShellKey("search");
  useClaimShellKey("shortcuts");

  // ⌘K opens the one palette (ontology nodes + projects); Shift is accepted and changes
  // nothing, which is why the shortcut sheet lists ⌘K alone (2026-09-26). ⌘K used to open a
  // project-only palette in which an ontology node could never be found. `useTypingShortcuts`
  // does not require Shift to be up, so one combo covers both.
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
        // The documents drawer is a full-width overlay. With the agent dock open, a stray
        // physical D (under a Korean layout that key types a common consonant) covered the chat that had just
        // opened, and the person saw the drawer where the answer should have been
        // (installed app, 2026-08-31). The dock is not a modal, so the other shortcuts stay
        // live; only the one that would paint over the conversation goes quiet.
        if (agentDockOpen) return;
        setDocsDrawerOpen((v) => !v);
      },
    },
    {
      // ⌘O switches from the static sample to the user's own markdown folder. The
      // first-run card's ⌘O hint and the top "switch to my data" pill both point at
      // this handler, so the shortcut survives dismissing the card. With a real vault
      // connected the gate is off and it does nothing.
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
