import type { useAcpRuntimeController } from "../model/use-acp-runtime-controller";
import type { useHomeWorkbenchController } from "../model/use-home-workbench-controller";
import type { useTopologyAgentActivity } from "../model/use-topology-agent-activity";
import type { useTopologyAgentOrchestration } from "../model/use-topology-agent-orchestration";
import type { useTopologyAnalysisReview } from "../model/use-topology-analysis-review";
import type { useTopologyAuthoring } from "../model/use-topology-authoring";
import type { useTopologyCanvasFocus } from "../model/use-topology-canvas-focus";
import type { useTopologyNavigationActions } from "../model/use-topology-navigation-actions";
import type { useTopologyPreferences } from "../model/use-topology-preferences";
import type { useTopologyVaultReadModel } from "../model/use-topology-vault-read-model";

import { resolveNodeAgentTarget } from "@/entities/knowledge-graph";
import { AGENT_DOCK_INSET_SURFACE_CLASS, Surface, WidgetErrorFallback } from "@/shared/ui";
import { ErrorBoundary } from "@/shared/ui/error-boundary";
import { AcpChatPanel, AcpChatResizeHandle } from "@/widgets/acp-chat-panel";
import { AnalysisWorkbench, MeaningContext } from "@/widgets/analysis-workbench";
import dynamic from "next/dynamic";
import { resolveAnalysisFindingTarget } from '../model/analysis-finding-target';
const VaultAgentPanel = dynamic(
  () => import("@/widgets/vault-agent-panel").then((m) => m.VaultAgentPanel),
  { ssr: false },
);

interface TopologyAgentDockProps {
  vaultAgentPrefill: { text: string; nonce: number; } | null;
  chatSuggestions: import("@/features/acp-session/model/chat-suggestions").ChatSuggestion[];
  routeState: import("@/views/home/model/url-state").HomeRouteState;
  topologyCanvasFocus: Pick<ReturnType<typeof useTopologyCanvasFocus>, "chatKnownSlugs" | "chatKnownRelations" | "handleChatHoverSlug">;
  topologyAuthoring: Pick<ReturnType<typeof useTopologyAuthoring>, "edgePanelModel" | "selectedEdge" | "setAcpRelationPreview">;
  topologyAnalysisReview: Pick<
    ReturnType<typeof useTopologyAnalysisReview>,
    | "meaningAnalysisContext"
    | "analysisCapture"
    | "relationNoteGaps"
    | "openAnalysisEvidence"
    | "showAnalysisRelation"
    | "meaningRelations"
    | "captureTaskBaseline"
  >;
  topologyAgentActivity: Pick<
    ReturnType<typeof useTopologyAgentActivity>,
    | "acpTurnStartedAtRef"
    | "acpMcpServers"
    | "handleAcpTurnActivityChange"
    | "handleAcpWorkReceipt"
  >;
  acpRuntimeController: Pick<
    ReturnType<typeof useAcpRuntimeController>,
    | "chatMounted"
    | "chatWidth"
    | "scheduleAcpSessionStart"
    | "setChatMounted"
    | "agentOpeningRequest"
    | "setAgentOpeningRequest"
    | "acpRuntime"
    | "acpRuntimes"
    | "setAcpRuntimeId"
    | "setAcpPresentationVisible"
  >;
  homeWorkbenchController: Pick<
    ReturnType<typeof useHomeWorkbenchController>,
    | "meaningWorkbenchPresence"
    | "acpDockFrameOpen"
    | "meaningWorkbenchOpen"
    | "reviewUsesSheet"
    | "acpChatOpen"
    | "workbenchSectionRequest"
    | "setMeaningWorkbenchOpen"
    | "setAnalysisFindings"
    | "setAnalysisParentRunId"
    | "setAnalysisParentRequestText"
    | "setAcpDockFrameOpen"
    | "setAcpChatOpen"
    | "showRelationMeaning"
    | "setShowRelationMeaning"
  >;
  topologyNavigationActions: Pick<ReturnType<typeof useTopologyNavigationActions>, "handleSelect" | "handleChatSuggestionAction" | "handleAcpMapIntent">;
  topologyAgentOrchestration: Pick<
    ReturnType<typeof useTopologyAgentOrchestration>,
    | "keyChatOpen"
    | "closeVaultAgent"
    | "vaultAgentScreenContext"
    | "askPrefill"
    | "runtimeChatOpen"
    | "handleWorkbenchSectionChange"
    | "agentChatUsesRuntime"
    | "openVaultAgent"
    | "businessFlowRequest"
  >;
  topologyPreferences: Pick<ReturnType<typeof useTopologyPreferences>, "t" | "activeLocale" | "tWorkbench">;
  topologyVaultReadModel: Pick<
    ReturnType<typeof useTopologyVaultReadModel>,
    | "llmBridgeAvailable"
    | "gitVaultPath"
    | "ontologyInsight"
    | "vault"
    | "selectedOntologyNode"
  >;
}

export function TopologyAgentDock({
  vaultAgentPrefill, chatSuggestions, routeState, topologyVaultReadModel, topologyPreferences,
  topologyAgentOrchestration, topologyNavigationActions, homeWorkbenchController, acpRuntimeController,
  topologyAgentActivity, topologyAnalysisReview, topologyAuthoring, topologyCanvasFocus
}: TopologyAgentDockProps) {
  const { llmBridgeAvailable, gitVaultPath, ontologyInsight, vault, selectedOntologyNode } = topologyVaultReadModel;
  const { t, activeLocale, tWorkbench } = topologyPreferences;
  const {
    keyChatOpen, closeVaultAgent, vaultAgentScreenContext, askPrefill, runtimeChatOpen,
    handleWorkbenchSectionChange, agentChatUsesRuntime, openVaultAgent, businessFlowRequest
  } = topologyAgentOrchestration;
  const { handleSelect, handleChatSuggestionAction, handleAcpMapIntent } = topologyNavigationActions;
  const {
    meaningWorkbenchPresence, acpDockFrameOpen, meaningWorkbenchOpen, reviewUsesSheet, acpChatOpen,
    workbenchSectionRequest, setMeaningWorkbenchOpen, setAnalysisFindings, setAnalysisParentRunId,
    setAnalysisParentRequestText, setAcpDockFrameOpen, setAcpChatOpen, showRelationMeaning,
    setShowRelationMeaning
  } = homeWorkbenchController;
  const {
    chatMounted, chatWidth, scheduleAcpSessionStart, setChatMounted, agentOpeningRequest,
    setAgentOpeningRequest, acpRuntime, acpRuntimes, setAcpRuntimeId, setAcpPresentationVisible
  } = acpRuntimeController;
  const { acpTurnStartedAtRef, acpMcpServers, handleAcpTurnActivityChange, handleAcpWorkReceipt } = topologyAgentActivity;
  const {
    meaningAnalysisContext, analysisCapture, relationNoteGaps, openAnalysisEvidence, showAnalysisRelation,
    meaningRelations, captureTaskBaseline
  } = topologyAnalysisReview;
  const { edgePanelModel, selectedEdge, setAcpRelationPreview } = topologyAuthoring;
  const { chatKnownSlugs, chatKnownRelations, handleChatHoverSlug } = topologyCanvasFocus;

  return (<>
    {llmBridgeAvailable ? (
      <ErrorBoundary
        fallback={({ error, reset }) => (
          <WidgetErrorFallback
            error={error}
            onReset={reset}
            title={t('widgetError.panelTitle')}
            body={t('widgetError.body')}
            retryLabel={t('widgetError.retry')}
            className="m-2 w-[320px] shrink-0"
          />
        )}
      >
        <VaultAgentPanel
          /*
           * A URL carrying "ask about this concept" is enough to open it.
           *
           * ⚠️ **It does not open while the coding-agent branch holds the panel** —
           * there is one chat panel (2026-08-16). Without this condition a request
           * arriving in the URL raises a second one.
           */
          open={keyChatOpen}
          onClose={closeVaultAgent}
          vaultPath={gitVaultPath}
          insight={ontologyInsight}
          manifest={vault.manifest}
          screenContext={vaultAgentScreenContext}
          vaultIsGit={false}
          canWrite={vault.status === "loaded" && Boolean(vault.handle)}
          // A chip focusing a node goes through the **same function** as clicking a node
          // on the map: the same action appearing with different motion is a defect.
          onFocusNode={(slug) => handleSelect(slug)}
          // A door even with no folder open, through the **same function** as the utility
          // lane's "switch to my data" — no second open path is created.
          onOpenFolder={() => void vault.open()}
          downloadHref={`/${activeLocale}/download/`}
          prefillRequest={vaultAgentPrefill ?? askPrefill}
        />
      </ErrorBoundary>
    ) : null}
    {/*
        The in-app conversation with **the user's own coding agent**. A sibling in the
        same slot as the panel above (the API-key branch) — no new surface.

        The rule that the map comes first still holds: this panel stands beside the map
        and never covers it.
      */}
    {gitVaultPath || meaningWorkbenchPresence.mounted ? (
      <div
        data-agent-dock-frame="true"
        data-right-dock={acpDockFrameOpen || chatMounted || meaningWorkbenchOpen ? "chat" : undefined}
        style={{
          width: acpDockFrameOpen || meaningWorkbenchOpen ? reviewUsesSheet ? '100%' : `${chatWidth.width}px` : "0px",
          transitionProperty: "width",
          // Same role and same clock as the key branch's `VaultAgentPanel`. If the two
          // chat panels pushed the map at different speeds, "one door" would stop being
          // true.
          transitionDuration: "var(--agent-panel-reflow-duration)",
          transitionTimingFunction: "var(--topology-motion-ease-out)",
        }}
        onTransitionEnd={(event) => {
          if (event.target !== event.currentTarget || event.propertyName !== "width") return;
          // Space claims its position first, then launches the session. Even if ACP process start
          // briefly occupies the WebKit main thread, already-finished layout motion is not interrupted.
          if (acpDockFrameOpen && !acpChatOpen) scheduleAcpSessionStart();
        }}
        className="absolute right-0 top-0 bottom-[var(--topology-mobile-bottom-tab-reserve)] z-30 min-h-0 shrink-0 overflow-hidden bg-[color:var(--color-canvas)] lg:relative lg:inset-auto lg:z-auto"
      >
        {runtimeChatOpen || chatMounted || meaningWorkbenchPresence.mounted ? (
          <Surface
            open={acpDockFrameOpen || meaningWorkbenchOpen}
            as="aside"
            motion="overlay"
            /*
             * ⚠️ **This used to be dead code** (caught in the 2026-08-16 review).
             *
             * The mount condition for this block and `open` were **the same value**, so
             * pressing close made it disappear whole in the same frame: the exit animation
             * never once played and this callback was never called — there was no "while
             * it leaves".
             *
             * Mount and open are now separate: mount on open, unmount once it has fully
             * left. That is this repo's per-surface rule that an exit is a two-frame job.
             */
            /*
             * **Closing the dock does not stop the agent** (owner, 2026-09-06). Unmounting
             * the panel ends its ACP session, and a person who closes the dock to look at
             * the map while a long turn runs expects the turn to finish. While a turn is
             * running the panel stays mounted behind the closed dock; the chip in the
             * corner keeps saying what it is doing and for how long. An idle panel still
             * unmounts on exit, as before.
             */
            onExited={() => { if (acpTurnStartedAtRef.current === null) setChatMounted(false); }}
            /*
             * ⚠️ The width used to be `var(--topology-agent-panel-width, 360px)`, and **that
             * token does not exist** — the 360px fallback was always what applied, while a
             * token name nobody used looked like a spec (`.claude/rules/design.md`: a token
             * nobody uses is not a spec, it is wrong information).
             *
             * After that it was two literals, `w-[420px] xl:w-[480px]`, and neither was
             * **anybody's answer**. Now the user drags the left edge to decide, and we only
             * enforce the share the map must keep (`panel-width.ts`). With no
             * viewport-width branch left, the `xl:` goes too.
             */
            data-agent-dock-surface="inset"
            // The toaster centres in the map left of this panel, never over it.
            data-toast-wall="right"
            style={{ width: reviewUsesSheet ? 'calc(100% - var(--chrome-inset) * 2)' : `calc(${chatWidth.width}px - var(--chrome-inset))` }}
            /*
             * The fixed-width content is pinned right and only the outer frame animates
             * from 0 to the stored width. Animating the content width every frame would
             * re-wrap the text continuously and stutter more.
             */
            className={`${AGENT_DOCK_INSET_SURFACE_CLASS} flex min-h-0 shrink-0 flex-col p-4`}
          >
            <AcpChatResizeHandle
              width={chatWidth.width}
              onWidth={chatWidth.setWidth}
              onCommit={chatWidth.commitWidth}
            />
            <ErrorBoundary
              fallback={({ error, reset }) => (
                <WidgetErrorFallback
                  error={error}
                  onReset={reset}
                  title={t('widgetError.panelTitle')}
                  body={t('widgetError.body')}
                  retryLabel={t('widgetError.retry')}
                  className="min-h-0 flex-1"
                />
              )}
            >
              <AnalysisWorkbench
                returnFocusSelector={'[data-testid="topology-meaning-workbench-toggle"]'}
                context={meaningAnalysisContext}
                capture={analysisCapture}
                contextLabel={edgePanelModel?.sentence ?? selectedOntologyNode?.display ?? selectedOntologyNode?.title ?? tWorkbench('wholeProject')}
                contextKind={edgePanelModel ? null : selectedOntologyNode?.kind ?? null}
                open={acpDockFrameOpen || meaningWorkbenchOpen}
                requestNonce={agentOpeningRequest?.nonce}
                sectionRequest={workbenchSectionRequest}
                relationNoteGaps={relationNoteGaps}
                onSectionChange={handleWorkbenchSectionChange}
                initialTab={meaningWorkbenchOpen ? 'meaning' : 'conversation'}
                onClose={() => { setMeaningWorkbenchOpen(false); closeVaultAgent(); }}
                onEvidence={openAnalysisEvidence}
                onFindingsChange={setAnalysisFindings}
                onFinding={(finding) => {
                  const target = resolveAnalysisFindingTarget(finding, ontologyInsight);
                  if (!target) return false;
                  if (target.kind === 'edge') showAnalysisRelation(target.edge);
                  else handleSelect(target.nodeId);
                  return true;
                }}
                onRequest={agentChatUsesRuntime ? (text, parentRunId) => {
                  setAnalysisParentRunId(parentRunId);
                  const focus = selectedOntologyNode ? `${selectedOntologyNode.display ?? selectedOntologyNode.title} (${resolveNodeAgentTarget(selectedOntologyNode).ref ?? selectedOntologyNode.id})` : selectedEdge ? edgePanelModel?.sentence ?? '' : tWorkbench('wholeProject');
                  const relation = selectedEdge ? `\nSelected relation: ${JSON.stringify({
                    from: resolveNodeAgentTarget(ontologyInsight?.nodes.find((node) => node.id === selectedEdge.sourceId)).ref,
                    to: resolveNodeAgentTarget(ontologyInsight?.nodes.find((node) => node.id === selectedEdge.targetId)).ref,
                    type: selectedEdge.relationType,
                  })}` : '';
                  const requestText = `${tWorkbench('meaningTitle')}: ${focus}${relation}\n${text}`;
                  setAnalysisParentRequestText(parentRunId ? requestText : null);
                  setAgentOpeningRequest({ text: requestText, nonce: Date.now(), scopeKey: JSON.stringify([gitVaultPath, 'meaning']) });
                  if (acpDockFrameOpen || meaningWorkbenchOpen) {
                    setChatMounted(true); setAcpDockFrameOpen(true); setAcpChatOpen(true);
                  } else openVaultAgent();
                } : undefined}
                facts={<MeaningContext
                  showLabels={showRelationMeaning}
                  onShowLabelsChange={setShowRelationMeaning}
                  node={selectedOntologyNode ? { ...selectedOntologyNode, title: selectedOntologyNode.display ?? selectedOntologyNode.title } : null}
                  relations={meaningRelations}
                  reasonsAction={!!agentChatUsesRuntime && relationNoteGaps > 0}
                  onEvidence={openAnalysisEvidence}
                  onSelectRelation={(id) => {
                    const edge = ontologyInsight?.edges.find((item) => item.id === id);
                    if (!edge) return;
                    showAnalysisRelation({ sourceId: edge.from, targetId: edge.to, relationType: edge.type, declaredBySlug: edge.evidenceIds[0] ?? null });
                  }}
                />}
                conversation={acpRuntime && gitVaultPath ? <AcpChatPanel
                  /*
                   * Changing the runtime **rebuilds the panel.** A session is bound to one
                   * process, so swapping only the tool inside the same panel blurs "what is
                   * alive right now". Rebuilding is cheaper and unambiguous.
                   */
                  key={`${gitVaultPath}:${acpRuntime.id}`}
                  runtimeId={acpRuntime.id}
                  runtimeLabel={acpRuntime.label}
                  runtimes={acpRuntimes}
                  onRuntimeChange={setAcpRuntimeId}
                  vaultRoot={gitVaultPath}
                  mcpServers={acpMcpServers}
                  sessionEnabled={acpChatOpen}
                  // The sentence jumped from the node sits in the **here** write box — it is not sent.
                  prefillRequest={vaultAgentPrefill ?? askPrefill}
                  openingRequest={agentOpeningRequest}
                  requestScopeKey={JSON.stringify([gitVaultPath, 'meaning'])}
                  onOpeningRequestSent={(nonce) => setAgentOpeningRequest((current) => current?.nonce === nonce ? null : current)}
                  suggestions={chatSuggestions}
                  // The composer names what the header names: a picked concept, not "this folder".
                  composerSubject={edgePanelModel ? null : selectedOntologyNode?.display ?? selectedOntologyNode?.title ?? null}
                  onSuggestionAction={handleChatSuggestionAction}
                  knownSlugs={chatKnownSlugs}
                  knownRelations={chatKnownRelations}
                  presentationIntent={routeState.askBusinessFlow ? 'business-flow' : null}
                  presentationRequest={routeState.askBusinessFlow ? businessFlowRequest : null}
                  onPresentationVisibilityChange={setAcpPresentationVisible}
                  onHoverSlug={handleChatHoverSlug}
                  onTurnActivityChange={handleAcpTurnActivityChange}
                  onMapIntent={handleAcpMapIntent}
                  onOntologyRelationPreviewChange={setAcpRelationPreview}
                  onWorkReceipt={handleAcpWorkReceipt}
                  captureTaskBaseline={captureTaskBaseline}
                  meaningTransitionContext={vault.handle ? { handle: vault.handle, fileHandles: vault.fileHandles, writable: vault.status === 'loaded' } : undefined}
                  /*
                   * ⚠️ **One close, and it belongs to the workbench** (2026-09-06). The panel drew its
                   * own X beside the workbench's, so the dock had two identical buttons a few pixels
                   * apart doing exactly the same thing — and the inner one closed a surface it does not
                   * own. The chat is a tab inside this workbench; what closes it is the workbench's
                   * close button, and `contextLabel` is likewise the workbench header's `h2`, so the
                   * panel does not repeat it as a badge either.
                   */
                  onTurnStarted={analysisCapture.onTurnStarted}
                /> : undefined}
              />
            </ErrorBoundary>
          </Surface>
        ) : null}
      </div>
    ) : null}
  </>);
}
