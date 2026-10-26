import type { useTopologyAgentOrchestration } from "../agent/use-topology-agent-orchestration";
import type { useTopologyAuthoring } from "../authoring/use-topology-authoring";
import type { useTopologyCanvasFocus } from "../use-topology-canvas-focus";
import type { useTopologyExplorationLenses } from "../map-canvas/use-topology-exploration-lenses";
import type { useTopologyGraphProjection } from "../map-canvas/use-topology-graph-projection";
import type { useTopologyInspectorState } from "../inspector/use-topology-inspector-state";
import type { useTopologyNavigationActions } from "../use-topology-navigation-actions";
import type { useTopologyRouteControls } from "../route-state/use-topology-route-controls";
import type { useHomeWorkbenchController } from "../use-home-workbench-controller";

import { type ProjectImpactMode } from "@/entities/project";
import { useFirstRunSampleModeSettled } from "@/features/first-run-starter";
import { useClaimShellKey } from "@/shared/lib/keyboard/shell-key-claims";
import { useFlatMapView } from "@/shared/lib/preferences/appearance-preferences";
import { useTypingShortcuts } from "@/shared/lib/keyboard/use-typing-shortcut";
import { useCallback, useEffect, useEffectEvent } from "react";
import { shouldSuppressGlobalShortcuts } from "../../lib/keyboard/blocking-surface";
import { resolveTopologyEscLadderAction } from "../../lib/keyboard/topology-esc-ladder";
import { useFocusReturnOnClose } from "./use-focus-return-on-close";

const CANVAS_RETURN = ["ontology-map-canvas"] as const;
/** The tidy row that opens it on a populated map; the canvas otherwise. */
const BOOTSTRAP_RETURN = ["topology-index-uncataloged-docs", "ontology-map-canvas"] as const;
/** The popover's own "full detail" button, still under the closed overlay. */
const FULL_DETAIL_RETURN = ["map-detail-panel-open-full-detail", "ontology-map-canvas"] as const;

interface Options {
  setOntologySearchOpen: React.Dispatch<React.SetStateAction<boolean>>;
  setShortcutsOpen: React.Dispatch<React.SetStateAction<boolean>>;
  setDocsDrawerOpen: React.Dispatch<React.SetStateAction<boolean>>;
  ontologySearchOpen: boolean;
  localGraphRoot: string | null;
  setLocalGraphStack: React.Dispatch<React.SetStateAction<string[]>>;
  setRouteState: (updater: Partial<import("@/views/home/model/route-state/url-state").HomeRouteState> | ((current: import("@/views/home/model/route-state/url-state").HomeRouteState) => import("@/views/home/model/route-state/url-state").HomeRouteState), options?: import("@/views/home/model/route-state/use-home-route-state").HomeRouteStateUpdateOptions | undefined) => void;
  sampleModeSettled: ReturnType<typeof useFirstRunSampleModeSettled>;
  requestVaultOpen: () => void;
  topologyAgentOrchestration: Pick<ReturnType<typeof useTopologyAgentOrchestration>, "agentDockOpen" | "closeVaultAgent">;
  homeWorkbenchController: Pick<ReturnType<typeof useHomeWorkbenchController>, "workbenchOpenRef">;
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
export function useTopologyKeyboard({
  setOntologySearchOpen, setShortcutsOpen, setDocsDrawerOpen, ontologySearchOpen,
  localGraphRoot, setLocalGraphStack, setRouteState, sampleModeSettled, requestVaultOpen,
  topologyGraphProjection, topologyNavigationActions, topologyAuthoring, topologyCanvasFocus,
  topologyInspectorState, topologyRouteControls, topologyExplorationLenses, topologyAgentOrchestration,
  homeWorkbenchController
}: Options) {
  const { canvasSelectedSlug, resolvedRealmSlug } = topologyGraphProjection;
  const { handleClose } = topologyNavigationActions;
  const { setSelectedEdge, closeCreateNode, selectedEdge, createNodeOpen, bootstrapOpen, setBootstrapOpen, acpTurnActivityFrame } = topologyAuthoring;
  const {
    contextMenuNode, fullDetailOpen, selectedRelationActive, closeContextMenu, setFullDetailSlug,
    setSelectedRelationActive, setNodePopoverDismissed
  } = topologyCanvasFocus;
  const { nodePopoverVisible } = topologyInspectorState;
  const flatMap = useFlatMapView();
  const { handleExitRealm } = topologyRouteControls;
  const { routedConstellation, setActiveConstellation } = topologyExplorationLenses;
  const { agentDockOpen, closeVaultAgent } = topologyAgentOrchestration;
  const { workbenchOpenRef } = homeWorkbenchController;


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
      workbenchOpen: workbenchOpenRef.current.agent || workbenchOpenRef.current.meaning,
      realmActive: resolvedRealmSlug !== null,
      selectedEdgeActive: selectedEdge !== null,
      contextMenuOpen: contextMenuNode !== null,
      createNodeOpen,
      bootstrapOpen,
      searchOpen: ontologySearchOpen,
      fullDetailOpen,
      selectedRelationActive,
      hasSelection: canvasSelectedSlug != null,
      nodePopoverOpen: !flatMap && nodePopoverVisible,
      hasLocalGraphRoot: localGraphRoot !== null,
    });
    // With no review above it, Escape leaves the realm before other map states.
    if (action === "close-realm") {
      handleExitRealm();
      return;
    }
    switch (action) {
      case "close-workbench":
        event.preventDefault();
        closeVaultAgent();
        break;
      case "close-edge-popover":
        // The popover returns focus to its trigger itself (`OntologyMapEdgePanel`).
        setSelectedEdge(null);
        break;
      case "close-context-menu":
        closeContextMenu();
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
  return { handleSelectImpactMode } as const;
}
