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
import { useCallback, useMemo } from "react";
import { useLatestRef } from "@/shared/lib/use-latest-ref";
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

type SelectOptions = { preserveImpact?:boolean;keepIndexOpen?:boolean };
type SelectionContext = {
  interactionSelectedSlugRef: Options['topologyCanvasFocus']['interactionSelectedSlugRef'];
  galaxy:boolean;
  setExpandAllActive:Options['setExpandAllActive'];
  setHoverEdge:Options['topologyAuthoring']['setHoverEdge'];
  setFullDetailSlug:Options['topologyCanvasFocus']['setFullDetailSlug'];
  setSelectedRelationActive:Options['topologyCanvasFocus']['setSelectedRelationActive'];
  setNodePopoverDismissed:Options['topologyCanvasFocus']['setNodePopoverDismissed'];
  projectBySlug:Options['topologyGraphProjection']['projectBySlug'];
  setRouteState:Options['setRouteState'];
  beginExpandedIndexSelection:Options['topologyIndexPresentation']['beginExpandedIndexSelection'];
};
function selectFromCurrentContext(context:React.RefObject<SelectionContext>,slug:string,options?:SelectOptions) {
  const current=context.current;
  current.interactionSelectedSlugRef.current=slug;
  if(!current.galaxy)current.setExpandAllActive(false);
  current.setHoverEdge(null);
  current.setFullDetailSlug(null);
  current.setSelectedRelationActive(false);
  current.setNodePopoverDismissed(false);
  const isHub=Boolean(current.projectBySlug.get(slug)?.isHub);
  current.setRouteState(route=>resolveTopologyNodeClickRouteState(route,slug,{isHub,preserveImpact:options?.preserveImpact}));
  if(options?.keepIndexOpen)current.beginExpandedIndexSelection();
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


  const selectionContext=useLatestRef({interactionSelectedSlugRef,galaxy,setExpandAllActive,setHoverEdge,
    setFullDetailSlug,setSelectedRelationActive,setNodePopoverDismissed,projectBySlug,setRouteState,beginExpandedIndexSelection});
  // Renderers may cache this callback across equally shaped folders. It resolves
  // only the current committed selection context, without pinning an old index.
  const handleSelect=useMemo(()=>selectFromCurrentContext.bind(null,selectionContext),[selectionContext]);

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
