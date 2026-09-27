import type { useTopologyAgentOrchestration } from "./use-topology-agent-orchestration";
import type { useTopologyAuthoring } from "./use-topology-authoring";
import type { useTopologyCanvasFocus } from "./use-topology-canvas-focus";
import type { useTopologyGraphProjection } from "./use-topology-graph-projection";
import type { useTopologyIndexPresentation } from "./use-topology-index-presentation";
import type { useTopologyInspectorState } from "./use-topology-inspector-state";
import type { useTopologyPreferences } from "./use-topology-preferences";
import type { useTopologySourceReadiness } from "./use-topology-source-readiness";

import type { ChatSuggestion } from "@/features/acp-session";
import { type AcpMapIntent } from "@/widgets/acp-chat-panel";
import { useCallback } from "react";
import { restoreTopologyFocusAfterDatasheetClose } from "../lib/topology-focus-return";
import { resolveTopologyNodeClickRouteState, selectTopologyPathRouteState } from "./url-state";

interface Options {
  setExpandAllActive: React.Dispatch<React.SetStateAction<boolean>>;
  setRouteState: (updater: Partial<import("@/views/home/model/url-state").HomeRouteState> | ((current: import("@/views/home/model/url-state").HomeRouteState) => import("@/views/home/model/url-state").HomeRouteState), options?: import("@/views/home/model/use-home-route-state").HomeRouteStateUpdateOptions | undefined) => void;
  replayPastWalk: (walkId: string) => string | null;
  topologyInspectorState: Pick<ReturnType<typeof useTopologyInspectorState>, "panelDatasheetModel">;
  topologyAgentOrchestration: Pick<ReturnType<typeof useTopologyAgentOrchestration>, "closeVaultAgent">;
  topologySourceReadiness: Pick<ReturnType<typeof useTopologySourceReadiness>, "unboundProjectSource">;
  topologyIndexPresentation: Pick<ReturnType<typeof useTopologyIndexPresentation>, "beginExpandedIndexSelection">;
  topologyGraphProjection: Pick<ReturnType<typeof useTopologyGraphProjection>, "projectBySlug">;
  topologyAuthoring: Pick<ReturnType<typeof useTopologyAuthoring>, "setHoverEdge" | "setMeaningEditorState" | "setSelectedEdge">;
  topologyPreferences: Pick<ReturnType<typeof useTopologyPreferences>, "galaxy" | "view3d">;
  topologyCanvasFocus: Pick<
    ReturnType<typeof useTopologyCanvasFocus>,
    | "interactionSelectedSlugRef"
    | "setFullDetailSlug"
    | "setSelectedRelationActive"
    | "setNodePopoverDismissed"
    | "chatNodeIndex"
  >;
}
export function useTopologyNavigationActions({
  setExpandAllActive, setRouteState, replayPastWalk, topologyCanvasFocus, topologyPreferences,
  topologyAuthoring, topologyGraphProjection, topologyIndexPresentation, topologySourceReadiness,
  topologyAgentOrchestration, topologyInspectorState
}: Options) {
  const { interactionSelectedSlugRef, setFullDetailSlug, setSelectedRelationActive, setNodePopoverDismissed, chatNodeIndex } = topologyCanvasFocus;
  const { galaxy, view3d } = topologyPreferences;
  const { setHoverEdge, setMeaningEditorState, setSelectedEdge } = topologyAuthoring;
  const { projectBySlug } = topologyGraphProjection;
  const { beginExpandedIndexSelection } = topologyIndexPresentation;
  const { unboundProjectSource } = topologySourceReadiness;
  const { closeVaultAgent } = topologyAgentOrchestration;
  const { panelDatasheetModel } = topologyInspectorState;


  const handleSelect = useCallback(
    (
      slug: string,
      options?: {
        preserveImpact?: boolean;
        /**
         * A row picked in the INDEX tree keeps the panel open, since the reader is reading the
         * list;
         * a map selection still collapses it.
         */
        keepIndexOpen?: boolean;
      },
    ) => {
      // Selection resolves against `ontologyInsight`.
      interactionSelectedSlugRef.current = slug;
      // Galaxy is a chosen overview, so selecting a star keeps it; Flat keeps select = collapse.
      if (!galaxy) setExpandAllActive(false);
      setHoverEdge(null);
      setFullDetailSlug(null);
      setSelectedRelationActive(false);
      setNodePopoverDismissed(false);
      const project = projectBySlug.get(slug);
      // `resolveTopologyNodeClickRouteState` owns the path-mode branch (`../model/url-state.ts`).
      setRouteState((current) =>
        resolveTopologyNodeClickRouteState(current, slug, {
          isHub: Boolean(project?.isHub),
          preserveImpact: options?.preserveImpact,
        }),
      );
      // `setRouteState` publishes synchronously, so the expanded session starts after it and
      // survives the transition.
      if (options?.keepIndexOpen) beginExpandedIndexSelection();
    },
    [interactionSelectedSlugRef, galaxy, setExpandAllActive, setHoverEdge, setFullDetailSlug, setSelectedRelationActive, setNodePopoverDismissed, projectBySlug, setRouteState, beginExpandedIndexSelection],
  );

  const handleAcpMapIntent = useCallback(
    (intent: AcpMapIntent) => {
      if (intent.kind === "focus") {
        const nodeId = chatNodeIndex.get(intent.slug);
        if (!nodeId) return;
        setMeaningEditorState(null);
        setExpandAllActive(false);
        setSelectedEdge(null);
        handleSelect(nodeId);
        return;
      }

      const sourceId = chatNodeIndex.get(intent.from);
      const targetId = chatNodeIndex.get(intent.to);
      if (!sourceId || !targetId || sourceId === targetId) return;
      interactionSelectedSlugRef.current = null;
      setExpandAllActive(false);
      setMeaningEditorState(null);
      setSelectedEdge(null);
      setFullDetailSlug(null);
      setSelectedRelationActive(false);
      setRouteState((current) =>
        selectTopologyPathRouteState(current, {
          sourceSlug: sourceId,
          targetSlug: targetId,
        }),
      );
    },
    [chatNodeIndex, handleSelect, interactionSelectedSlugRef, setExpandAllActive, setFullDetailSlug, setMeaningEditorState, setRouteState, setSelectedEdge, setSelectedRelationActive],
  );

  const handleChatSuggestionAction = useCallback((suggestion: ChatSuggestion): boolean => {
    if (suggestion.kind !== 'connectSource' || !unboundProjectSource) return false;
    // The installed app's folder picker connects code, not the agent: open the project datasheet
    // first.
    closeVaultAgent();
    handleSelect(unboundProjectSource.nodeId, { keepIndexOpen: true });
    return true;
  }, [closeVaultAgent, handleSelect, unboundProjectSource]);

  // The last replayed step is ego-focused as "you are here".
  const handleReplayPastWalk = useCallback(
    (walkId: string) => {
      const last = replayPastWalk(walkId);
      if (last) handleSelect(last);
    },
    [replayPastWalk, handleSelect],
  );

  const handleClose = useCallback(() => {
    interactionSelectedSlugRef.current = null;
    setFullDetailSlug(null);
    setSelectedRelationActive(false);
    setRouteState((current) => ({
      ...current,
      selectedSlug: null,
      focusedHubSlug: null,
      impactMode: "none",
      meaningEditorIntent: false,
      meaningEditParam: null,
      // A background click, Esc or the popover's ✕ collapse the expansion: click selects, badge
      // expands, close collapses.
      analysisMode:
        current.analysisMode === "focus" ? "overview" : current.analysisMode,
    }));
  }, [interactionSelectedSlugRef, setFullDetailSlug, setSelectedRelationActive, setRouteState]);

  const handleDatasheetClose = useCallback(() => {
    const focusReturnNodeId = panelDatasheetModel?.nodeId ?? null;
    // On the 3D dome ✕ only folds the panel (the first Esc step, `nodePopoverDismissed`) and keeps
    // the selection;
    // the dome has no expansion to collapse. Deselect is a background click or the second Esc.
    if (view3d) {
      setNodePopoverDismissed(true);
    } else {
      handleClose();
    }
    if (typeof window === "undefined") return;
    window.requestAnimationFrame(() => {
      restoreTopologyFocusAfterDatasheetClose(focusReturnNodeId);
    });
  }, [handleClose, panelDatasheetModel?.nodeId, view3d, setNodePopoverDismissed]);
  return { handleClose, handleSelect, handleReplayPastWalk, handleDatasheetClose, handleChatSuggestionAction, handleAcpMapIntent } as const;
}
