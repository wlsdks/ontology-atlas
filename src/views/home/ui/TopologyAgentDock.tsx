import type { VaultAgentPrefill } from "../model/agent-chat-door";
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
import { AGENT_DOCK_INSET_SURFACE_CLASS, agentDockReflowStyle, Surface, WidgetErrorFallback } from "@/shared/ui";
import { ErrorBoundary } from "@/shared/ui/error-boundary";
import { AcpChatPanel, AcpChatResizeHandle } from "@/widgets/acp-chat-panel";
import { AnalysisWorkbench, MeaningContext } from "@/widgets/analysis-workbench";
import dynamic from "next/dynamic";
import { useCallback, useMemo, useRef, useState } from "react";
import { useTranslations } from 'next-intl';
import { subjectSuggestions } from "@/features/acp-session";
import { resolveAnalysisFindingTarget } from '../model/analysis-finding-target';
const VaultAgentPanel = dynamic(
  () => import("@/widgets/vault-agent-panel").then((m) => m.VaultAgentPanel),
  { ssr: false },
);

interface TopologyAgentDockProps {
  vaultAgentPrefill: VaultAgentPrefill | null;
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
    | "investigationBasis"
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
  vaultAgentPrefill: incomingPrefill, chatSuggestions, routeState, topologyVaultReadModel, topologyPreferences,
  topologyAgentOrchestration, topologyNavigationActions, homeWorkbenchController, acpRuntimeController,
  topologyAgentActivity, topologyAnalysisReview, topologyAuthoring, topologyCanvasFocus
}: TopologyAgentDockProps) {
  const tGray=useTranslations('grayArea');
  const [investigationRefused,setInvestigationRefused]=useState(false);
  const { llmBridgeAvailable, gitVaultPath, ontologyInsight, vault, selectedOntologyNode } = topologyVaultReadModel;
  const vaultAgentPrefill=incomingPrefill?.context&&incomingPrefill.context.vaultPath!==gitVaultPath?null:incomingPrefill;
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
    setAgentOpeningRequest, acpRuntime, acpRuntimes, setAcpRuntimeId, setAcpPresentationVisible,investigationBasis
  } = acpRuntimeController;
  const { acpTurnStartedAtRef, acpMcpServers, handleAcpTurnActivityChange, handleAcpWorkReceipt } = topologyAgentActivity;
  const {
    meaningAnalysisContext, analysisCapture, relationNoteGaps, openAnalysisEvidence, showAnalysisRelation,
    meaningRelations, captureTaskBaseline
  } = topologyAnalysisReview;
  const { edgePanelModel, selectedEdge, setAcpRelationPreview } = topologyAuthoring;
  // The draft outlives the panel, which unmounts on an idle close; one folder's draft, in memory.
  const draftRef = useRef<{ folder: string | null; text: string; prefillNonce:number|null }>({ folder: null, text: "", prefillNonce:null });
  const draftStore = useMemo(
    () => ({
      read: () => (draftRef.current.folder === gitVaultPath ? {text:draftRef.current.text,prefillNonce:draftRef.current.prefillNonce} : {text:"",prefillNonce:null}),
      write: (draft: {text:string;prefillNonce:number|null}) => {
        draftRef.current = { folder: gitVaultPath, ...draft };
      },
    }),
    [gitVaultPath],
  );
  const draftContextKey=JSON.stringify([gitVaultPath,vaultAgentPrefill?.nonce]);
  const [draftContext,setDraftContext]=useState<{key:string;seen:boolean;retired:boolean}|null>(null);
  const handleDraftPresence=useCallback((present:boolean)=>{
    const hasDraft=present||(draftRef.current.folder===gitVaultPath&&draftRef.current.text.trim().length>0);
    setDraftContext(current=>{
    if(current?.key!==draftContextKey)return {key:draftContextKey,seen:hasDraft,retired:false};
    return {...current,seen:current.seen||hasDraft,retired:current.retired||(!hasDraft&&current.seen)};
  });},[draftContextKey,gitVaultPath]);
  const preparedContext=vaultAgentPrefill?.context?.vaultPath===gitVaultPath && (draftContext?.key!==draftContextKey||!draftContext.retired) ? vaultAgentPrefill?.context?.label : null;
  // One subject for header, composer and asks: a picked concept, or the folder.
  const investigationLabel=investigationBasis?.vaultPath===gitVaultPath && (draftContext?.key!==draftContextKey||!draftContext.retired)?investigationBasis.label:null;
  const composerSubject = investigationLabel??preparedContext ?? (edgePanelModel ? null : selectedOntologyNode?.display ?? selectedOntologyNode?.title ?? null);
  const subjectRef = selectedOntologyNode ? resolveNodeAgentTarget(selectedOntologyNode).ref ?? selectedOntologyNode.id : null;
  const dockSuggestions = useMemo(
    () => composerSubject && subjectRef ? subjectSuggestions({ slug: subjectRef, label: composerSubject }) : chatSuggestions,
    [chatSuggestions, composerSubject, subjectRef],
  );
  // An empty history tab ends the surface under its card (see AnalysisWorkbench).
  const [workbenchFitsContent, setWorkbenchFitsContent] = useState(false);
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
          // Never while the coding-agent branch holds the panel, or a URL request raises a second
          // one.
          open={keyChatOpen}
          onClose={closeVaultAgent}
          vaultPath={gitVaultPath}
          insight={ontologyInsight}
          manifest={vault.manifest}
          screenContext={vaultAgentScreenContext}
          vaultIsGit={false}
          canWrite={vault.status === "loaded" && Boolean(vault.handle)}
          // The same function as a map click, so one action has one motion.
          onFocusNode={(slug) => handleSelect(slug)}
          // The same function as the utility lane's "switch to my data".
          onOpenFolder={() => void vault.open()}
          downloadHref={`/${activeLocale}/download/`}
          prefillRequest={vaultAgentPrefill ?? askPrefill}
        />
      </ErrorBoundary>
    ) : null}
    {/* The user's own coding agent, sharing the key branch's slot; it stands beside the map, never
       over it. */}
    {gitVaultPath || meaningWorkbenchPresence.mounted ? (
      <div
        data-agent-dock-frame="true"
        data-right-dock={acpDockFrameOpen || chatMounted || meaningWorkbenchOpen ? "chat" : undefined}
        style={{
          width: acpDockFrameOpen || meaningWorkbenchOpen ? reviewUsesSheet ? '100%' : `${chatWidth.width}px` : "0px",
          ...agentDockReflowStyle("width"),
        }}
        onTransitionEnd={(event) => {
          if (event.target !== event.currentTarget || event.propertyName !== "width") return;
          // Layout claims space before the session launches, so ACP boot cannot interrupt finished
          // motion.
          if (acpDockFrameOpen && !acpChatOpen) scheduleAcpSessionStart();
        }}
        className="absolute right-0 top-0 bottom-[var(--topology-mobile-bottom-tab-reserve)] z-30 min-h-0 shrink-0 overflow-hidden bg-[color:var(--color-canvas)] lg:relative lg:inset-auto lg:z-auto"
      >
        {runtimeChatOpen || chatMounted || meaningWorkbenchPresence.mounted ? (
          <Surface
            open={acpDockFrameOpen || meaningWorkbenchOpen}
            as="aside"
            motion="overlay"
            // Mount and open are separate so the exit animation runs. While a turn runs the panel
            // stays mounted behind the closed dock, since unmounting ends the ACP session; an idle
            // panel unmounts on exit.
            onExited={() => { if (acpTurnStartedAtRef.current === null) setChatMounted(false); }}
            // The user drags the width; `panel-width.ts` enforces only the map's share.
            data-agent-dock-surface="inset"
            // The toaster centres left of this panel.
            data-toast-wall="right"
            style={{
              width: reviewUsesSheet ? 'calc(100% - var(--chrome-inset) * 2)' : `calc(${chatWidth.width}px - var(--chrome-inset))`,
              // An empty archive ends under its card instead of leaving the dock bare; every other
              // view keeps the full column.
              ...(workbenchFitsContent ? { bottom: 'auto', maxHeight: 'calc(100% - var(--chrome-inset))' } : null),
            }}
            // Only the outer frame animates, or the pinned content re-wraps every frame.
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
                conversationLabel={investigationLabel??preparedContext}
                contextLabel={edgePanelModel?.sentence ?? selectedOntologyNode?.display ?? selectedOntologyNode?.title ?? tWorkbench('wholeProject')}
                contextKind={edgePanelModel ? null : selectedOntologyNode?.kind ?? null}
                open={acpDockFrameOpen || meaningWorkbenchOpen}
                requestNonce={agentOpeningRequest?.nonce}
                sectionRequest={workbenchSectionRequest}
                relationNoteGaps={relationNoteGaps}
                onSectionChange={handleWorkbenchSectionChange}
                onFitContentChange={setWorkbenchFitsContent}
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
                conversation={acpRuntime && gitVaultPath ? <>
                  {investigationRefused?<p role="status" className="mb-2 text-caption text-[color:var(--color-text-secondary)]">{tGray('continuation.refused')}</p>:null}
                  <AcpChatPanel
                  // A session is bound to one process, so changing the runtime rebuilds the panel.
                  key={`${gitVaultPath}:${acpRuntime.id}:${investigationBasis?.vaultPath===gitVaultPath?investigationBasis.sourceRoot??'':''}`}
                  runtimeId={acpRuntime.id}
                  runtimeLabel={acpRuntime.label}
                  runtimes={acpRuntimes}
                  onRuntimeChange={setAcpRuntimeId}
                  vaultRoot={gitVaultPath}
                  mcpServers={acpMcpServers}
                  sessionEnabled={acpChatOpen}
                  // Seated in the composer, not sent.
                  prefillRequest={vaultAgentPrefill ?? askPrefill}
                  openingRequest={agentOpeningRequest}
                  requestScopeKey={JSON.stringify([gitVaultPath, 'meaning'])}
                  draftStore={draftStore}
                  onOpeningRequestSent={(nonce) => {setAgentOpeningRequest((current) => current?.nonce === nonce ? null : current);setInvestigationRefused(false);}}
                  onOpeningRequestRejected={(nonce) => {setAgentOpeningRequest((current) => current?.nonce === nonce ? null : current);setInvestigationRefused(true);}}
                  suggestions={dockSuggestions}
                  // The composer names what the header names.
                  composerSubject={composerSubject}
                  onDraftPresenceChange={handleDraftPresence}
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
                  // The workbench owns the one close button and the `h2` context label, so the
                  // panel repeats neither.
                  onTurnStarted={analysisCapture.onTurnStarted}
                /></> : undefined}
              />
            </ErrorBoundary>
          </Surface>
        ) : null}
      </div>
    ) : null}
  </>);
}
