import type { useAcpRuntimeController } from "./use-acp-runtime-controller";
import type { useHomeWorkbenchController } from "./use-home-workbench-controller";
import type { useTopologyAuthoring } from "./use-topology-authoring";
import type { useTopologyGraphProjection } from "./use-topology-graph-projection";
import type { useTopologyIndexPresentation } from "./use-topology-index-presentation";
import type { useTopologyPreferences } from "./use-topology-preferences";
import type { useTopologyVaultReadModel } from "./use-topology-vault-read-model";

import { resolveNodeAgentTarget } from "@/entities/knowledge-graph";
import { buildBusinessFlowRequest, nodeIntent, screenIntentFor, sentenceForIntent, type FirstWordsLabels, type ScreenContextSnapshot } from "@/features/vault-agent";
import { buildAgentAnalyzePrompt } from "@/shared/config/agent-prompts";
import { consumeQueuedAgentChatIntent, subscribeAgentChatIntent } from "@/shared/lib/agent-chat-intent";
import { RIGHT_DOCK_WIDTH_VAR } from "@/shared/lib/right-dock-reserve";
import { getTauriVaultRootPath } from "@/shared/lib/tauri-vault-fs";
import { useAgentDockDefaultOpen } from "@/shared/lib/use-agent-dock-default";
import { useLatestRef } from "@/shared/lib/use-latest-ref";
import { useCallback, useEffect, useMemo, useRef } from "react";
import { agentChatDoor } from "./agent-chat-door";
import { planRouteAskDockSync, type RouteAskDockRequest } from "./route-ask-dock-sync";
function hashAskRequest(kind: string, ref: string): number {
  const source = `${kind}:${ref}`;
  let hash = 0;
  for (let index = 0; index < source.length; index += 1) {
    hash = (hash * 31 + source.charCodeAt(index)) | 0;
  }
  return hash;
}
interface Options {
  setOntologySearchOpen: React.Dispatch<React.SetStateAction<boolean>>;
  setVaultAgentPrefill: React.Dispatch<React.SetStateAction<{ text: string; nonce: number; } | null>>;
  routeState: import("@/views/home/model/url-state").HomeRouteState;
  agentDockTouchedRef: React.RefObject<boolean>;
  setRouteState: (updater: Partial<import("@/views/home/model/url-state").HomeRouteState> | ((current: import("@/views/home/model/url-state").HomeRouteState) => import("@/views/home/model/url-state").HomeRouteState), options?: import("@/views/home/model/use-home-route-state").HomeRouteStateUpdateOptions | undefined) => void;
  agentDockDefaultOpen: ReturnType<typeof useAgentDockDefaultOpen>;
  topologyIndexPresentation: Pick<ReturnType<typeof useTopologyIndexPresentation>, "handleIndexTabExpand">;
  topologyPreferences: Pick<ReturnType<typeof useTopologyPreferences>, "businessFlowRequestText">;
  topologyAuthoring: Pick<ReturnType<typeof useTopologyAuthoring>, "setCreateNodeOpen">;
  homeWorkbenchController: Pick<
    ReturnType<typeof useHomeWorkbenchController>,
    | "workbenchOpenRef"
    | "requestWorkbenchSection"
    | "setAcpChatOpen"
    | "setAcpDockFrameOpen"
    | "setVaultAgentOpen"
    | "setMeaningWorkbenchOpen"
    | "workbenchSectionRef"
    | "setAnalysisParentRunId"
    | "setAnalysisParentRequestText"
    | "acpChatOpen"
    | "vaultAgentOpen"
    | "acpDockFrameOpen"
    | "meaningWorkbenchOpen"
    | "reviewUsesSheet"
  >;
  acpRuntimeController: Pick<
    ReturnType<typeof useAcpRuntimeController>,
    | "acpRuntime"
    | "cancelAcpSessionStart"
    | "setChatMounted"
    | "setAgentOpeningRequest"
    | "chatWidth"
    | "requestedAcpRuntimeRef"
    | "setAcpRuntimeId"
    | "pendingAgentChatPromptRef"
    | "setPendingAgentChatRuntimeId"
    | "pendingAgentChatRuntimeId"
  >;
  topologyGraphProjection: Pick<ReturnType<typeof useTopologyGraphProjection>, "realmTitle" | "ontologyMapGraph">;
  topologyVaultReadModel: Pick<
    ReturnType<typeof useTopologyVaultReadModel>,
    | "selectedOntologyNode"
    | "spotlightOn"
    | "gitVaultPath"
    | "tAgent"
    | "vaultConceptFacts"
    | "llmBridgeAvailable"
    | "vault"
  >;
}
export function useTopologyAgentOrchestration({
  setOntologySearchOpen, setVaultAgentPrefill, routeState, agentDockTouchedRef, setRouteState,
  agentDockDefaultOpen, topologyVaultReadModel, topologyGraphProjection, acpRuntimeController,
  homeWorkbenchController, topologyAuthoring, topologyPreferences, topologyIndexPresentation
}: Options) {
  const { selectedOntologyNode, spotlightOn, gitVaultPath, tAgent, vaultConceptFacts, llmBridgeAvailable, vault } = topologyVaultReadModel;
  const { realmTitle, ontologyMapGraph } = topologyGraphProjection;
  const visibleNodeCount = ontologyMapGraph.nodes.length;
  const vaultHandle = vault.handle;
  const vaultConceptFactsRef = useLatestRef(vaultConceptFacts);
  const {
    acpRuntime, cancelAcpSessionStart, setChatMounted, setAgentOpeningRequest, chatWidth,
    requestedAcpRuntimeRef, setAcpRuntimeId, pendingAgentChatPromptRef, setPendingAgentChatRuntimeId,
    pendingAgentChatRuntimeId
  } = acpRuntimeController;
  const {
    workbenchOpenRef, requestWorkbenchSection, setAcpChatOpen, setAcpDockFrameOpen, setVaultAgentOpen,
    setMeaningWorkbenchOpen, workbenchSectionRef, setAnalysisParentRunId, setAnalysisParentRequestText,
    acpChatOpen, vaultAgentOpen, acpDockFrameOpen, meaningWorkbenchOpen, reviewUsesSheet
  } = homeWorkbenchController;
  const { setCreateNodeOpen } = topologyAuthoring;
  const { businessFlowRequestText } = topologyPreferences;
  const { handleIndexTabExpand } = topologyIndexPresentation;


  /**
   * Injected every turn, so the model never needs a tool for it. Names match the screen
   * (`resolveNodeAgentTarget`), since a pasted handoff works only if human and agent use one name.
   */
  const vaultAgentScreenContext = useMemo<ScreenContextSnapshot>(() => {
    const target = resolveNodeAgentTarget(selectedOntologyNode);
    return {
      focusedSlug: target.ref,
      focusedTitle: selectedOntologyNode?.title ?? null,
      focusedKind: selectedOntologyNode?.kind ?? null,
      lenses: spotlightOn ? ["recent-changes"] : [],
      projectTitle: realmTitle ?? null,
      visibleNodeCount,
    };
  }, [selectedOntologyNode, spotlightOn, realmTitle, visibleNodeCount]);

  /**
   * One chat panel, one door: the detected coding agent (ACP, with this folder's MCP tools), else
   * the API-key branch; never both at once.
   */
  const agentChatUsesRuntime = Boolean(acpRuntime && gitVaultPath);

  const openVaultAgent = useCallback(() => {
    const alreadyOpen = workbenchOpenRef.current.agent || workbenchOpenRef.current.meaning;
    requestWorkbenchSection('conversation');
    if (!alreadyOpen) cancelAcpSessionStart();
    if (agentChatUsesRuntime) {
      setChatMounted(true);
      if (!alreadyOpen) setAcpChatOpen(false);
      else if (!workbenchOpenRef.current.agent) setAcpChatOpen(true);
      setAcpDockFrameOpen(true);
      setVaultAgentOpen(false);
    } else {
      setAcpDockFrameOpen(false);
      setMeaningWorkbenchOpen(false);
      setVaultAgentOpen(true);
      setAcpChatOpen(false);
    }
    // Retreating surfaces take their own close paths, so nothing blinks out.
    setOntologySearchOpen(false);
    setCreateNodeOpen(false);
  }, [workbenchOpenRef, requestWorkbenchSection, cancelAcpSessionStart, agentChatUsesRuntime, setOntologySearchOpen, setCreateNodeOpen, setChatMounted, setAcpChatOpen, setAcpDockFrameOpen, setVaultAgentOpen, setMeaningWorkbenchOpen]);
  const handleWorkbenchSectionChange = useCallback((tab: 'meaning' | 'history' | 'conversation') => {
    workbenchSectionRef.current = tab;
    if (tab === 'conversation' && agentChatUsesRuntime && !workbenchOpenRef.current.agent) {
      setChatMounted(true); setAcpDockFrameOpen(true); setAcpChatOpen(true);
    }
  }, [agentChatUsesRuntime, setAcpChatOpen, setAcpDockFrameOpen, setChatMounted, workbenchOpenRef, workbenchSectionRef]);

  /** The same keys as the empty-chat chips, so one idea is not phrased two ways. */
  const firstWordsLabels = useMemo<FirstWordsLabels>(
    () => ({
      missingDefinition: (title) => tAgent("firstWords.missingDefinition", { title }),
      missingDomain: (title) => tAgent("firstWords.missingDomain", { title }),
      missingRelations: (title) => tAgent("firstWords.missingRelations", { title }),
      mapReview: tAgent("firstWords.mapReview"),
      emptyVault: tAgent("firstWords.emptyVault"),
    }),
    [tAgent],
  );

  /**
   * The sentence comes from `screenIntentFor`, matching the empty chat's first chip; opening seats
   * it, sending stays manual.
   */
  const askAgentAboutSelectedNode = useCallback(() => {
    const intent = screenIntentFor(selectedOntologyNode, vaultConceptFactsRef.current);
    if (!intent) return;
    setVaultAgentPrefill({
      text: sentenceForIntent(intent, firstWordsLabels),
      nonce: Date.now(),
    });
    openVaultAgent();
  }, [selectedOntologyNode, vaultConceptFactsRef, setVaultAgentPrefill, firstWordsLabels, openVaultAgent]);

  /** A constant URL must not re-seat on every render. */
  const BUSINESS_FLOW_PREFILL_NONCE = 0;
  const businessFlowRequest = useMemo(
    () => buildBusinessFlowRequest({ request: businessFlowRequestText }),
    [businessFlowRequestText],
  );

  /** `?ask=`: the URL is the state and carries only the intent kind; the sentence is written here. */
  const askPrefill = useMemo(() => {
    // Rebuilt from the app's localized string, so no sentence rides a shared URL and old links get
    // today's request.
    if (llmBridgeAvailable && routeState.askBusinessFlow) {
      return {
        text: businessFlowRequest,
        // Constant for a constant URL, so a re-render never overwrites a draft.
        nonce: BUSINESS_FLOW_PREFILL_NONCE,
      };
    }
    if (!llmBridgeAvailable || !routeState.askIntent) return null;
    const intent = nodeIntent(selectedOntologyNode, routeState.askIntent);
    if (!intent) return null;
    return {
      text: sentenceForIntent(intent, firstWordsLabels),
      // The same URL gives the same value, so a render never overwrites the draft.
      nonce: hashAskRequest(routeState.askIntent, "ref" in intent ? intent.ref : ""),
    };
  }, [
    llmBridgeAvailable,
    routeState.askBusinessFlow,
    routeState.askIntent,
    selectedOntologyNode,
    firstWordsLabels,
    businessFlowRequest,
  ]);

  /**
   * A route request must open the physical dock (`acpDockFrameOpen`), or it owns a zero-width
   * panel. Remembering request and branch keeps keystrokes from reopening it; a late-discovered
   * runtime may replace the key branch once. Closing marks the dock touched before clearing the
   * URL, so the next render cannot reopen it.
   */
  const routeAskDockRequestRef = useRef<RouteAskDockRequest | null>(null);
  useEffect(() => {
    const requestKey = askPrefill
      ? `${askPrefill.nonce}:${askPrefill.text}`
      : null;
    const branch = agentChatUsesRuntime ? "runtime" : "key";
    const plan = planRouteAskDockSync({
      requestKey,
      branch,
      touched: agentDockTouchedRef.current,
      previous: routeAskDockRequestRef.current,
    });
    routeAskDockRequestRef.current = plan.next;
    if (plan.resetTouched) {
      agentDockTouchedRef.current = false;
    }
    if (plan.shouldOpen) openVaultAgent();
  }, [agentChatUsesRuntime, agentDockTouchedRef, askPrefill, openVaultAgent]);

  /** Closing also withdraws the URL request, or the derived state reopens the panel. */
  const closeVaultAgent = useCallback(() => {
    agentDockTouchedRef.current = true;
    cancelAcpSessionStart();
    // Stays drawn through the close so the exit animation can run; `Surface` reports `onExited` to
    // unmount.
    // Set here too because a URL request never goes through this function.
    setChatMounted(true);
    // One window, one close for whichever branch is open.
    setAcpDockFrameOpen(false);
    setVaultAgentOpen(false);
    setAcpChatOpen(false);
    setVaultAgentPrefill(null);
    setMeaningWorkbenchOpen(false);
    setAgentOpeningRequest(null);
    setAnalysisParentRunId(null);
    setAnalysisParentRequestText(null);
    setRouteState(
      { askIntent: null, askBusinessFlow: false },
      { replace: true },
    );
  }, [agentDockTouchedRef, cancelAcpSessionStart, setChatMounted, setAcpDockFrameOpen, setVaultAgentOpen, setAcpChatOpen, setVaultAgentPrefill, setMeaningWorkbenchOpen, setAgentOpeningRequest, setAnalysisParentRunId, setAnalysisParentRequestText, setRouteState]);

  /** Which branch owns the one panel; a URL "ask this" follows the same rule. */
  const {
    runtime: runtimeChatOpen,
    key: keyChatOpen,
    /** The chip's pressed state reads this. */
    open: agentChatOpen,
  } = agentChatDoor({
    hasRuntime: agentChatUsesRuntime,
    runtimeOpen: acpChatOpen,
    keyOpen: vaultAgentOpen,
    hasAskIntent: Boolean(askPrefill),
  });
  const agentDockOpen = agentChatOpen || acpDockFrameOpen || meaningWorkbenchOpen;

  /** Expanding INDEX retires the agent, or the map squeezes between two panels. */
  const handleIndexTabExpandFromAgent = useCallback(() => {
    if (agentDockOpen) closeVaultAgent();
    handleIndexTabExpand();
  }, [agentDockOpen, closeVaultAgent, handleIndexTabExpand]);

  /** Built here because it must carry the vault path; an i18n string alone names no folder. */
  const analyzePrompt = useMemo(
    () =>
      buildAgentAnalyzePrompt({
        vaultPath:
          (vaultHandle ? getTauriVaultRootPath(vaultHandle) : null) ??
          vaultHandle?.name ??
          null,
      }),
    [vaultHandle],
  );

  /** Seats it in the composer; a person still sends, like "ask about this". */
  const sendAnalyzeToAgent = useCallback(() => {
    setVaultAgentPrefill({ text: analyzePrompt, nonce: Date.now() });
    openVaultAgent();
  }, [analyzePrompt, openVaultAgent, setVaultAgentPrefill]);

  // Publishes the dock width for floating map cards (`right-dock-reserve.ts`) and the top-centred
  // toaster (`app/globals.css`). It reads `chatWidth`, the state the dock draws from, because a
  // ResizeObserver missed the replacement node and left the variable unset.
  useEffect(() => {
    const root = document.documentElement;
    if (!agentDockOpen || reviewUsesSheet) {
      root.style.removeProperty(RIGHT_DOCK_WIDTH_VAR);
      return undefined;
    }
    root.style.setProperty(RIGHT_DOCK_WIDTH_VAR, `${Math.round(chatWidth.width)}px`);
    return () => {
      root.style.removeProperty(RIGHT_DOCK_WIDTH_VAR);
    };
  }, [agentDockOpen, reviewUsesSheet, chatWidth.width]);

  // The settings Agents section's "open a chat with this tool" names the runtime; the same door
  // opens it.
  useEffect(() => {
    const accept = (runtimeId: string | null, prompt: string | null) => {
      const target = runtimeId ?? acpRuntime?.id ?? null;
      requestedAcpRuntimeRef.current = target;
      setAcpRuntimeId(target);
      // Held until the dock mounts, or the panel never receives it.
      pendingAgentChatPromptRef.current = prompt;
      setPendingAgentChatRuntimeId(target);
      return true;
    };
    const queued = consumeQueuedAgentChatIntent();
    if (queued) window.queueMicrotask(() => accept(queued.runtimeId, queued.prompt));
    return subscribeAgentChatIntent((runtimeId,prompt)=>{
      if(runtimeId===null&&!agentChatUsesRuntime)return false;
      return accept(runtimeId,prompt);
    });
  }, [acpRuntime?.id, agentChatUsesRuntime, pendingAgentChatPromptRef, requestedAcpRuntimeRef, setAcpRuntimeId, setPendingAgentChatRuntimeId]);

  useEffect(() => {
    if (
      pendingAgentChatRuntimeId === undefined ||
      (pendingAgentChatRuntimeId !== null && acpRuntime?.id !== pendingAgentChatRuntimeId) ||
      !agentChatUsesRuntime
    ) {
      return;
    }
    let cancelled = false;
    window.queueMicrotask(() => {
      if (cancelled) return;
      agentDockTouchedRef.current = true;
      requestedAcpRuntimeRef.current = null;
      openVaultAgent();
      const prompt = pendingAgentChatPromptRef.current;
      pendingAgentChatPromptRef.current = null;
      if (prompt) setAgentOpeningRequest({ text: prompt, nonce: Date.now(), scopeKey: JSON.stringify([gitVaultPath, 'meaning']) });
      setPendingAgentChatRuntimeId(undefined);
    });
    return () => {
      cancelled = true;
    };
  }, [pendingAgentChatRuntimeId, acpRuntime?.id, agentChatUsesRuntime, openVaultAgent, gitVaultPath, pendingAgentChatPromptRef, requestedAcpRuntimeRef, setAgentOpeningRequest, setPendingAgentChatRuntimeId, agentDockTouchedRef]);

  // Opens through the same door, since a branch picked here would make two chat panels.
  useEffect(() => {
    if (agentDockDefaultOpen !== true || agentDockTouchedRef.current) return;
    openVaultAgent();
  }, [agentDockDefaultOpen, agentDockTouchedRef, openVaultAgent]);
  return {
    closeVaultAgent, agentDockOpen, runtimeChatOpen, openVaultAgent, handleIndexTabExpandFromAgent,
    analyzePrompt, agentChatUsesRuntime, sendAnalyzeToAgent, askAgentAboutSelectedNode, keyChatOpen,
    vaultAgentScreenContext, askPrefill, handleWorkbenchSectionChange, businessFlowRequest
  };
}
