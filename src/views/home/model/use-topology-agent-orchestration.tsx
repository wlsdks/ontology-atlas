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
   * Screen context — this agent's single biggest advantage. It is injected from the
   * system side every turn, so the model never has to ask for it with a tool and it is
   * always fresh. Names are passed as the screen names them (the handoff slug decided
   * by `resolveNodeAgentTarget`): a handoff only works the moment it is pasted if the
   * human and the agent use the same name.
   */
  const vaultAgentScreenContext = useMemo<ScreenContextSnapshot>(() => {
    const target = resolveNodeAgentTarget(selectedOntologyNode);
    return {
      focusedSlug: target.ref,
      focusedTitle: selectedOntologyNode?.title ?? null,
      focusedKind: selectedOntologyNode?.kind ?? null,
      lenses: spotlightOn ? ["recent-changes"] : [],
      projectTitle: realmTitle ?? null,
      visibleNodeCount: ontologyMapGraph.nodes.length,
    };
  }, [selectedOntologyNode, spotlightOn, realmTitle, ontologyMapGraph.nodes.length]);

  /**
   * **One chat panel** (owner decision, 2026-08-16).
   *
   * There are two ways to hold a conversation here: through a coding agent installed
   * on this machine (ACP), or through an API key the user supplied. Each used to have
   * **its own door and its own panel**, and neither knew whether the other was open —
   * so two similar-looking chat panels could appear to the right of the map at once.
   * Owner: *"Is this chat a different thing from that agent? It's confusing."* (this chat is a
   * different thing from that agent, isn't it? it's confusing).
   *
   * Two branches is a fact and not itself the problem; **two doors and two panels**
   * was. So there is one door:
   *
   * - a coding agent, if one is detected (it can do more — it uses this folder's MCP
   *   tools directly and rides the subscription and settings the user already has)
   * - otherwise the key branch, which is what remains for people who use no coding
   *   agent
   * - **never both at once**
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
    // The surfaces that retreat take their own close paths, so nothing simply blinks
    // out.
    setOntologySearchOpen(false);
    setCreateNodeOpen(false);
  }, [workbenchOpenRef, requestWorkbenchSection, cancelAcpSessionStart, agentChatUsesRuntime, setOntologySearchOpen, setCreateNodeOpen, setChatMounted, setAcpChatOpen, setAcpDockFrameOpen, setVaultAgentOpen, setMeaningWorkbenchOpen]);
  const handleWorkbenchSectionChange = useCallback((tab: 'meaning' | 'history' | 'conversation') => {
    workbenchSectionRef.current = tab;
    if (tab === 'conversation' && agentChatUsesRuntime && !workbenchOpenRef.current.agent) {
      setChatMounted(true); setAcpDockFrameOpen(true); setAcpChatOpen(true);
    }
  }, [agentChatUsesRuntime, setAcpChatOpen, setAcpDockFrameOpen, setChatMounted, workbenchOpenRef, workbenchSectionRef]);

  /**
   * On-screen wording for the first line, read from **the same keys** as the panel's
   * empty-chat chips. If each entry point picked its own phrasing, the same idea would
   * be said two different ways.
   */
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
   * "Ask about this" on the node detail. The sentence is written by the first-line
   * generator (`screenIntentFor`), so it is character-for-character the empty chat's
   * first chip and the two entry points cannot diverge. Pressing it opens the panel and
   * seats the sentence in the input; sending is still the send button.
   */
  const askAgentAboutSelectedNode = useCallback(() => {
    const intent = screenIntentFor(selectedOntologyNode, vaultConceptFacts);
    if (!intent) return;
    setVaultAgentPrefill({
      text: sentenceForIntent(intent, firstWordsLabels),
      nonce: Date.now(),
    });
    openVaultAgent();
  }, [selectedOntologyNode, vaultConceptFacts, setVaultAgentPrefill, firstWordsLabels, openVaultAgent]);

  /**
   * Arriving from the insight queue with `?ask=` in the URL.
   *
   * **The URL is the state.** Nothing is copied into React state, so "is the panel
   * open" and "what is being asked" live in one place, and going Back to that URL
   * restores the same context. The URL carries only the **kind of intent**; the
   * sentence is written here, by the same generator as the empty-chat chips.
   */
  /** Constant: the URL is constant, so the seat must not re-fire on every render. */
  const BUSINESS_FLOW_PREFILL_NONCE = 0;
  const businessFlowRequest = useMemo(
    () => buildBusinessFlowRequest({ request: businessFlowRequestText }),
    [businessFlowRequestText],
  );

  const askPrefill = useMemo(() => {
    /*
     * The whole-graph request arrives named, not carried, so it is rebuilt here
     * from the app's own localized string. That keeps the sentence out of a URL
     * that gets copied and shared, and means a link made last week still opens
     * this week's request rather than a frozen copy of it.
     */
    if (llmBridgeAvailable && routeState.askBusinessFlow) {
      return {
        text: businessFlowRequest,
        // Constant for a constant URL, so a re-render never overwrites a draft
        // the person has started editing.
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
   * A route-carried request must open the **physical** dock, not only select which
   * branch owns it. `agentChatDoor` can derive `runtimeChatOpen`, but the ACP panel's
   * width and `Surface.open` are intentionally animated from `acpDockFrameOpen`; without
   * going through the one door here, a runtime request owns an invisible zero-width
   * panel.
   *
   * Remember request + resolved branch. Ordinary renders (including every keystroke in
   * the draft) must not call `openVaultAgent` again, while an asynchronously discovered
   * coding runtime may replace the fallback key branch exactly once. Closing marks the
   * dock touched before clearing the URL, so the intermediate render cannot reopen it.
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

  /**
   * Closing also withdraws the request in the URL. Otherwise the derived state reopens
   * the panel after every close and it reads as "close does not work".
   */
  const closeVaultAgent = useCallback(() => {
    agentDockTouchedRef.current = true;
    cancelAcpSessionStart();
    /*
     * It **stays drawn** through the close, so the exit animation has somewhere to
     * run; `Surface` reports `onExited` when it is finished and it unmounts then.
     * (Set again here because some paths — a request arriving in the URL — never go
     * through this function.)
     */
    setChatMounted(true);
    // Since there is only one window, there is only one way to close it — this single action closes whichever branch was open.
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

  /**
   * Which branch currently owns **the one panel**.
   *
   * An "ask this" arriving in the URL follows the same rule: with a coding agent
   * present, that sentence lands in its composer. Previously only this request opened
   * the key branch separately, so the panel a chip opened and the panel a node opened
   * were **different panels**.
   */
  const {
    runtime: runtimeChatOpen,
    key: keyChatOpen,
    /** Is a chat panel up right now, on either branch? The chip's pressed state reads
     * this. */
    open: agentChatOpen,
  } = agentChatDoor({
    hasRuntime: agentChatUsesRuntime,
    runtimeOpen: acpChatOpen,
    keyOpen: vaultAgentOpen,
    hasAskIntent: Boolean(askPrefill),
  });
  const agentDockOpen = agentChatOpen || acpDockFrameOpen || meaningWorkbenchOpen;

  /**
   * Pressing the collapsed INDEX tab is an explicit choice to go back to the left
   * workbench. Expanding it while the agent is open would squeeze the map between two
   * panels again, so the same input retires the agent as INDEX arrives. Both surfaces
   * use the motion they already have.
   */
  const handleIndexTabExpandFromAgent = useCallback(() => {
    if (agentDockOpen) closeVaultAgent();
    handleIndexTabExpand();
  }, [agentDockOpen, closeVaultAgent, handleIndexTabExpand]);

  /**
   * The instruction to analyse this folder, built by something that **knows the vault
   * path**. Left as an i18n string it would carry no path, and the sentence alone
   * would not tell the agent which folder to look at.
   */
  const analyzePrompt = useMemo(
    () =>
      buildAgentAnalyzePrompt({
        vaultPath:
          (vault.handle ? getTauriVaultRootPath(vault.handle) : null) ??
          vault.handle?.name ??
          null,
      }),
    [vault.handle],
  );

  /**
   * Seats that instruction **in the chat composer**. A person still does the sending —
   * the same contract, and the same state, as "ask about this" on a node.
   */
  const sendAnalyzeToAgent = useCallback(() => {
    setVaultAgentPrefill({ text: analyzePrompt, nonce: Date.now() });
    openVaultAgent();
  }, [analyzePrompt, openVaultAgent, setVaultAgentPrefill]);

  /*
   * The dock's width is published for the surfaces that must stay clear of it: the
   * cards floating over the map (`right-dock-reserve.ts`) and the top-centred toaster,
   * which shifts by half of it to stay centred over the map area (`app/globals.css`).
   * A corner toast used to land on the composer (2026-08-16); the toaster moved to the
   * top centre on 2026-09-06.
   *
   * The width is the same state the dock is drawn from (`chatWidth`, dragged and
   * remembered), so no rect is measured: the previous ResizeObserver watched the node
   * that existed when the dock opened and missed the one that replaced it, leaving the
   * variable unset while a 460px dock stood open (measured in the export, 2026-09-06).
   * A sheet-wide review reserves nothing, as before.
   */
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

  /*
   * "Open a chat with this tool" in the settings sheet's Agents section arrives here
   * (2026-08-16 review: the screen people went to in order to connect had no door
   * through to connecting). There is still one door — this only names the runtime and
   * the same function does the opening.
   */
  useEffect(() => {
    const accept = (runtimeId: string | null, prompt: string | null) => {
      const target = runtimeId ?? acpRuntime?.id ?? null;
      requestedAcpRuntimeRef.current = target;
      setAcpRuntimeId(target);
      // Held rather than set now: the panel only exists once the dock opens below, and a request
      // handed to a panel that is not mounted is a request nobody receives.
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

  /*
   * Opening by itself goes through **the same door**. It lives here because
   * `openVaultAgent` above has to read runtime state — the moment this effect picks a
   * branch of its own, there are two chat panels.
   */
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
