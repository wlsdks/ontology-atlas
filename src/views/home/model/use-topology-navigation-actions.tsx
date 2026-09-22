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
         * Selected from the INDEX tree (owner remark, 2026-07-24): pressing a row in
         * the list collapsed the left panel to a slim tab, so the child they had just
         * expanded disappeared. The context "I am reading the list" is unambiguous, so
         * the left panel stays open in that case. A selection made on the map still
         * collapses it and widens the map.
         */
        keepIndexOpen?: boolean;
      },
    ) => {
      // Ontology node clicks and shareable vault slugs both stay on /topology;
      // selected-node resolution happens against `ontologyInsight`.
      interactionSelectedSlugRef.current = slug;
      // Galaxy is an overview the reader chose, so opening one star's datasheet
      // must not silently replace that overview with the collapsed spine. Flat
      // keeps the standing select = collapse behavior, and explicit Galaxy
      // expansion/focus actions still own their own state transitions.
      if (!galaxy) setExpandAllActive(false);
      setHoverEdge(null);
      // Selections chosen in the INDEX tree do not collapse the list (owner
      // critique 2026-07-24: clicking a row collapsed the panel into a slim tab, hiding the child just expanded).
      // Selections chosen on the map collapse as before, widening the map.
      setFullDetailSlug(null);
      setSelectedRelationActive(false);
      setNodePopoverDismissed(false);
      const project = projectBySlug.get(slug);
      // The path-mode vs. ordinary-selection branch belongs to
      // `resolveTopologyNodeClickRouteState`; its own comment in
      // `../model/url-state.ts` carries the background.
      setRouteState((current) =>
        resolveTopologyNodeClickRouteState(current, slug, {
          isHub: Boolean(project?.isHub),
          preserveImpact: options?.preserveImpact,
        }),
      );
      // `setRouteState` publishes through useSyncExternalStore synchronously.
      // Start the expanded session afterwards so the selection transition cannot
      // reset this interaction before the INDEX frame reads it.
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
    // Connection is not something the agent guesses; it is handled by the folder picker gateway of the installed app.
    // First open the project datasheet to let the user select the actual code folder.
    closeVaultAgent();
    handleSelect(unboundProjectSource.nodeId, { keepIndexOpen: true });
    return true;
  }, [closeVaultAgent, handleSelect, unboundProjectSource]);

  // Replaying loads the stored steps as the session trail; "you are here" is then
  // the end of that trail, so the last step is ego-focused.
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
      // Closing a focus returns to the map: a background click, Esc, or the popover's
      // ✕ all collapse the expansion. That completes the symmetry of click = select,
      // badge = expand, close = collapse.
      analysisMode:
        current.analysisMode === "focus" ? "overview" : current.analysisMode,
    }));
  }, [interactionSelectedSlugRef, setFullDetailSlug, setSelectedRelationActive, setRouteState]);

  const handleDatasheetClose = useCallback(() => {
    const focusReturnNodeId = panelDatasheetModel?.nodeId ?? null;
    // On the 3D dome, ✕ folds the panel; it does not throw the selection away. Owner,
    // 2026-08-18: *"Pressing ✕ just closes it and cancels the selection too, which makes it hard to look at."* (pressing ✕ just closes it and cancels the selection too, which makes it
    // hard to look at). The selection and its ego highlight stay; only the panel folds,
    // reusing the first step of the Esc dismissal order (`nodePopoverDismissed`) with no
    // new state. Deselecting belongs to a background click or the second Esc, and
    // reopening is another click on that node (on the dome a re-click reselects rather
    // than deselects — `topology-pointer-handlers.ts`). 2D keeps the close = collapse
    // symmetry from the 2026-07 ledger; the dome has no expansion or density gate, so
    // that symmetry has no premise there.
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
