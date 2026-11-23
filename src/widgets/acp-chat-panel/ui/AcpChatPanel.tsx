'use client';

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type RefObject } from 'react';
import { useTranslations } from 'next-intl';

import { isAgentDoctorAvailable, useAgentDoctor } from '@/features/acp-doctor';
import { isSendableSuggestion, readAcpTrouble, useAcpSession, VAULT_MCP_SERVER_NAME, type ChatSuggestion } from '@/features/acp-session';
import { useMappingSessions, useMappingStage, workRuns, type TurnWorkReport } from '@/features/work-run';
import { useGrantedVaultFiles } from '@/entities/vault-session';
import { getTauriVaultRootPath } from '@/shared/lib/vault-folder/native-vault/tauri-vault-runtime';
import { useLatestRef } from '@/shared/lib/use-latest-ref';
import { MOTION } from '@/shared/motion';
import { KeptPanelSeat, useFolderBusy } from './KeptPanelSeat';
import { usePrefersReducedMotion } from '@/shared/lib/render-timing/use-prefers-reduced-motion';
import { badgeClass } from '@/shared/ui/badge-class';
import { Surface } from '@/shared/ui';

import { useTaskMeaningReview } from '../model/use-task-meaning-review';
import {
  mappingShare,
  mayOpenRunRequest,
  useFolderMappingFigures,
  useMappingRun,
  type MappingFiguresReader,
  type MappingRunDriver,
} from '../model/use-mapping-run';
import { useTranscriptFollow } from '../model/use-transcript-follow';
import { turnRequestOf } from '../model/turn-request';
import { splitAppRequest } from './request-parts';
import { turnActivity, type TurnActivity } from './turn-activity';
import { ComposerInput } from './chat-panel/composer/ComposerInput';
import { ChoicesRow, ComposerFooter } from './chat-panel/composer/ComposerFooter';
import { ReportedPlanNote, SeatedDetailDisclosure, TurnSilentNotice } from './chat-panel/composer/composer-notices';
import { SlashMenu } from './chat-panel/composer/SlashMenu';
import { ErrorCard } from './chat-panel/ErrorCard';
import { HistoryPopover } from './chat-panel/HistoryPopover';
import { PermissionSlot } from './chat-panel/permission/PermissionSlot';
import { PresentationSurface } from './chat-panel/PresentationSurface';
import { TranscriptOffers } from './chat-panel/transcript-pane/TranscriptOffers';
import { TranscriptPane } from './chat-panel/transcript-pane/TranscriptPane';
import { TranscriptRows } from './chat-panel/transcript-pane/TranscriptRows';
import { TurnWorkStage, type TurnWork } from './chat-panel/turn/TurnWorkStage';
import { ConnectStoppedState, EmptyState, FolderBusyState, StartingState } from './chat-panel/transcript-pane/transcript-states';
import { MappingRunRow } from './chat-panel/mapping-run/MappingRunRow';
import { MappingRunRequests, numberedRequests, useRequestLine } from './chat-panel/mapping-run/MappingRunRequests';
import { MappingRunRequestsDialog, type RunRequestItem } from './chat-panel/mapping-run/MappingRunRequestsDialog';
import { groupRunConversations, isRunRequestText, requestWithoutCount, useRequestOpenings, type HistoryRow } from '../model/mapping-run-history';
import { formatDate } from '@/shared/lib/locale-text/format-date';
import type { AcpChatPanelProps, AcpTurnRequest } from './chat-panel/chat-panel-props';
import { useHistoryEscape, useHistoryMenu, useSlashMenu } from './chat-panel/composer/use-composer-menus';
import { useComposerSizing } from './chat-panel/composer/use-composer-sizing';
import { planSubmit } from './chat-panel/composer/outgoing-request';
import { toolPickerOptions, toolPickerValueOf } from './chat-panel/composer/tool-picker';
import { useHeldRequest } from './chat-panel/composer/use-held-request';
import { useOpeningRequest } from './chat-panel/composer/use-opening-request';
import { usePermissionReview } from './chat-panel/permission/use-permission-review';
import { usePrefillSeating } from './chat-panel/composer/use-prefill-seating';
import { usePresentation } from './chat-panel/use-presentation';
import { useRelationPreview } from './chat-panel/permission/use-relation-preview';
import { useTranscriptModel } from './chat-panel/transcript-pane/use-transcript-model';
import { useTranscriptSignals } from './chat-panel/transcript-pane/use-transcript-signals';
import { useTurnCapture } from './chat-panel/turn/use-turn-capture';
import { useTurnReports } from './chat-panel/turn/use-turn-reports';
import { useTurnHandover } from './chat-panel/turn/use-turn-handover';
import { usePersonTurns } from './chat-panel/turn/use-person-turns';
import {
  displayStatusOf,
  isAwaitingAnswer,
  isTextArriving,
  isTurnStillWanted,
  stoppedWithoutAnswer as hasStoppedWithoutAnswer,
  turnClockPhaseOf,
  turnWorkPhaseOf,
} from './chat-panel/turn/turn-state';
import { troubleHintKeyOf } from './chat-panel/trouble-hint-key';
import { useTurnClock, useTurnSilence } from './chat-panel/turn/use-turn-timing';

export type { AcpMapIntent } from '@/features/acp-session';
export type { AcpOntologyRelationPreview } from './chat-panel/chat-panel-props';

/** The map dock keeps its conversation under `map:<folder>:<runtime>`; only that one maps the rest of the code. */
const MAP_CONVERSATION_KEY_PREFIX = 'map:';

/**
 * The body's own props: `mapsTheRest` rides in the kept props, so the keeper's parked copy still
 * drives a run its seat started.
 */
interface AcpChatPanelBodyProps extends AcpChatPanelProps {
  mapsTheRest?: boolean;
}

const NO_SUGGESTIONS: readonly ChatSuggestion[] = [];

/** Folders whose row the person shortened to one line; until the app quits, as nothing of a run is persisted. */
const collapsedMappingFolders = new Set<string>();

/** The reader before the map conversation's row mounts: no project line can be read yet. */
const NO_FIGURES: MappingFiguresReader = { widest: async () => null, project: async () => null };

const folderNameOf = (folder: string) => folder.split(/[\\/]/).filter(Boolean).at(-1) ?? folder;

export function AcpChatPanelBody({
  runtimeId,
  runtimeLabel,
  vaultRoot,
  beforeComposer = null,
  systemPromptAppendix = null,
  noticeActions = null,
  mcpServers,
  sessionEnabled = true,
  resumeLatest = false,
  putAway = false,
  runtimes = [],
  onRuntimeChange,
  prefillRequest,
  openingRequest,
  requestScopeKey,
  draftStore,
  onOpeningRequestSent,
  onOpeningRequestRejected,
  judgeWrite,
  autoDecide,
  suggestions = [],
  onSuggestionAction,
  knownSlugs,
  knownRelations,
  answerFold = null,
  presentationIntent = null,
  presentationRequest = null,
  contextLabel = null,
  composerSubject = null,
  onDraftPresenceChange,
  onPresentationOpenMap,
  onPresentationVisibilityChange,
  onHoverSlug,
  onTurnActivityChange,
  onTurnToolActivityChange,
  onTerminalToolObservation,
  onMapIntent,
  onOntologyRelationPreviewChange,
  onWorkReceipt,
  onTurnStarted,
  onTurnStopChange,
  turnReadOnly,
  turnOutlivesScreen,
  folderBusy = null,
  onTurnWorkChange,
  captureTaskBaseline,
  meaningTransitionContext,
  onBusyChange,
  mapsTheRest = false,
}: AcpChatPanelBodyProps) {
  const t = useTranslations('acpChat');
  const tGray = useTranslations('grayArea');
  const reducedMotion = usePrefersReducedMotion();
  const runTurnStartRef = useRef<MappingRunDriver['observeTurnStart'] | null>(null);
  const {
    meaningTransitions,
    captureWorkReceipt,
    openingScopeMismatch,
    liveOpeningRequest,
    observedTerminalToolIdsRef,
    emitTerminalTool,
    captureTurnStart,
  } = useTurnCapture({
    runtimeId,
    vaultRoot,
    sessionEnabled,
    requestScopeKey,
    openingRequest,
    meaningTransitionContext,
    onWorkReceipt,
    onTurnStarted,
    onOpeningRequestSent,
    onTerminalToolObservation,
    runTurnStartRef,
  });
  const {
    status,
    lastTurnUpdateAt,
    events,
    activeTurnReadOnly,
    activeTurnOutlivesScreen,
    turnStopping,
    slashCommands,
    error,
    diagnostics,
    download,
    pending,
    approvedOntologyWrite,
    sessions,
    choices,
    reportedPlan,
    autoApprove,
    setAutoApprove,
    chooseModel,
    chooseMode,
    start,
    send,
    sendInvestigation,
    stopTurn: stopSessionTurn,
    stop,
    switchSession,
  } = useAcpSession({
    runtimeId,
    vaultRoot,
    mcpServers,
    approvalSettleMs: reducedMotion ? 0 : MOTION.settle.duration * 1000,
    resumeLatest,
    putAway,
    onWorkReceipt: captureWorkReceipt,
    onTurnStarted: captureTurnStart,
    captureTaskBaseline,
    autoDecide,
    turnReadOnly,
    turnOutlivesScreen,
    systemPromptAppendix,
    rememberChoices: true,
  });

  const [connectStopped, setConnectStopped] = useState(false);
  // Mirrored so the start effects see it without re-running, which would race New chat's own start.
  const connectStoppedRef = useRef(false);
  const markConnectStopped = useCallback((stopped: boolean) => {
    connectStoppedRef.current = stopped;
    setConnectStopped(stopped);
  }, []);
  const taskMeaningReview = useTaskMeaningReview({
    pending,
    runtimeId,
    vaultRoot,
    captureTaskBaseline,
    events,
    onMeaningDecision: meaningTransitions.saveDecision,
  });
  const { previewRequestKey, activePreviewIndex, setPreviewSelection } = useRelationPreview({
    pending,
    approvedOntologyWrite,
    onOntologyRelationPreviewChange,
  });
  useTurnReports({
    status,
    events,
    pending,
    knownSlugs,
    observedTerminalToolIdsRef,
    emitTerminalTool,
    onTurnActivityChange,
    onTurnToolActivityChange,
    onMapIntent,
  });

  const trouble = error ? readAcpTrouble(error, diagnostics) : null;
  const canChooseAnotherTool = runtimes.length > 1 && Boolean(onRuntimeChange);
  const troubleHintKey = troubleHintKeyOf(trouble, canChooseAnotherTool);
  const doctor = useAgentDoctor(runtimeId);
  const showDoctor = Boolean(runtimeId) && isAgentDoctorAvailable();

  const [restoredDraft] = useState(() => {
    const restored = draftStore?.read() ?? { text: '', prefillNonce: null };
    return { full: restored.text, prefillNonce: restored.prefillNonce, ...splitAppRequest(restored.text) };
  });
  const [draft, setDraft] = useState(restoredDraft.lead);

  const { slashMatches, slashOpen, slashActiveIndex, slashMenuRef, setSlashDismissed, setSlashActive } =
    useSlashMenu({ draft, slashCommands });
  const { historyOpen, setHistoryOpen, historyListRef, historyEdge, measureHistoryEdges } =
    useHistoryMenu({ sessionCount: sessions.length });

  const [presentationOpen, setPresentationOpen] = useState(false);
  const [presentationSceneIndex, setPresentationSceneIndex] = useState(0);
  const presentationOfferRef = useRef<HTMLButtonElement | null>(null);

  const [composerFocused, setComposerFocused] = useState(false);
  const listRef = useRef<HTMLDivElement | null>(null);
  const transcriptContentRef = useRef<HTMLDivElement | null>(null);
  const transcriptFollow = useTranscriptFollow({
    scrollerRef: listRef,
    contentRef: transcriptContentRef,
    reducedMotion,
  });
  const [transcriptScrolled, setTranscriptScrolled] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  const mirrorRef = useRef<HTMLTextAreaElement | null>(null);
  const panelRef = useRef<HTMLElement | null>(null);

  const { seatedDetail, setSeatedDetail, seatedRequestWaiting } = usePrefillSeating({
    prefillRequest,
    restoredDraft,
    draft,
    setDraft,
    draftStore,
    onDraftPresenceChange,
  });

  const {
    pendingHeld,
    pendingHeldChangeSet,
    pendingForCard,
    setDeferredPermission,
    livePendingRef,
    permissionDeferred,
    declinedToolIds,
    composerFocusRequest,
    requestComposerFocus,
    answerHold,
    requestCorrection,
    dropPending,
  } = usePermissionReview({ pending, inputRef, setDraft, t });

  const chooseSlashCommand = (name: string) => {
    setDraft(`/${name} `);
    setSlashDismissed(true);
    inputRef.current?.focus();
  };
  const {
    nextSteps,
    postTurnNextSteps,
    setNextStepsDismissed,
    cancelledWaitTurnId,
    setCancelledWaitTurnId,
    sendAsPerson,
  } = usePersonTurns({
    events,
    suggestions,
    send,
    setPresentationOpen,
    onPresentationVisibilityChange,
  });

  const connecting = status === 'starting' && !connectStopped;
  const { heldRequest, setHeldRequest, sendHeldRequest, returnHeld } = useHeldRequest({
    runtimeId,
    vaultRoot,
    status,
    connectStopped,
    setDraft,
    setSeatedDetail,
    sendAsPerson,
    setNextStepsDismissed,
  });

  const { restartedOpeningNonceRef, openingNonce, openingWaiting } = useOpeningRequest({
    openingRequest,
    openingScopeMismatch,
    runtimeId,
    vaultRoot,
    liveOpeningRequest,
    status,
    pending,
    send,
    sendInvestigation,
    switchSession,
    connectStoppedRef,
    markConnectStopped,
    setHistoryOpen,
    onOpeningRequestSent,
    onOpeningRequestRejected,
    heldRequest,
    sendHeldRequest,
    onOpeningTakesTurn: returnHeld,
  });

  const chooseSuggestion = (suggestion: ChatSuggestion, allowAppAction: boolean) => {
    if (allowAppAction && onSuggestionAction?.(suggestion)) return;
    const request = t(`suggest.${suggestion.kind}.prompt`, suggestion.params);
    // A row whose slug fails the shape is read by the person before anything leaves.
    if (!isSendableSuggestion(suggestion)) {
      setDraft(request);
      inputRef.current?.focus();
      return;
    }
    if (status !== 'ready') return;
    sendAsPerson(request);
  };
  useEffect(() => {
    if (!sessionEnabled || connectStoppedRef.current) return;
    void start();
  }, [sessionEnabled, start]);

  useHistoryEscape(historyOpen && !putAway, setHistoryOpen);

  const { follow: followTranscript, restore: restoreTranscript } = transcriptFollow;
  const { lastUserEventIndex, hasCompletedAgentAnswer, showPostTurnSuggestions, postTurnSuggestionsHeld } =
    useTranscriptSignals({
      events,
      status,
      pending,
      error,
      draft,
      suggestions: postTurnNextSteps,
      followTranscript,
      restoreTranscript,
    });

  useComposerSizing({ draft, inputRef, mirrorRef, panelRef, composerFocusRequest });

  const submit = useCallback(() => {
    const plan = planSubmit({ draft, status, connecting, seatedDetail });
    if (!plan) return;
    setDraft('');
    setSeatedDetail(null);
    if (plan.hold) {
      setHeldRequest({ text: plan.text, lead: plan.lead, seatedDetail, runtimeId, vaultRoot });
      return;
    }
    setNextStepsDismissed(false);
    sendAsPerson(plan.text);
  }, [connecting, draft, runtimeId, seatedDetail, sendAsPerson, setHeldRequest, setNextStepsDismissed, setSeatedDetail, status, vaultRoot]);

  const toolPicker = toolPickerOptions({ runtimes, runtimeId, runtimeLabel, models: choices.models });
  const toolIsPicker = canChooseAnotherTool || toolPicker.length > 1;
  const busy = status === 'thinking';
  const sessionButtonStandDown = busy || connecting ? 'hidden @min-[296px]/composer:inline-flex' : undefined;
  const toolPickerValue = toolPickerValueOf({ runtimeId, models: choices.models, currentModelId: choices.currentModelId });
  const choicesRow = (
    <ChoicesRow
      t={t}
      choices={choices}
      busy={busy}
      toolIsPicker={toolIsPicker}
      autoApprove={autoApprove}
      onChooseMode={(value) => void chooseMode(value)}
      onChooseAutoApprove={setAutoApprove}
    />
  );

  const awaitingAnswer = isAwaitingAnswer(busy, pending !== null);
  const clockPhase = turnClockPhaseOf(busy, awaitingAnswer);
  const { turnElapsedLabel, turnNowMs } = useTurnClock({ clockPhase, t });

  const canType = status === 'ready' || status === 'thinking' || status === 'idle' || status === 'starting';
  const canSend = status === 'ready';

  const { turnSilent, silentMinutes } = useTurnSilence({ busy, lastTurnUpdateAt, pending, status });

  const stoppedWithoutAnswer = hasStoppedWithoutAnswer({
    busy,
    events,
    lastUserEventIndex,
    cancelledWaitTurnId,
    hasCompletedAgentAnswer,
  });
  const lastUserEventId = lastUserEventIndex >= 0 ? (events[lastUserEventIndex]?.id ?? null) : null;
  // A finished turn dances only when this panel watched it run, never over a reopened conversation.
  const [watchedTurnId, setWatchedTurnId] = useState<string | null>(null);
  if (busy && lastUserEventId !== null && watchedTurnId !== lastUserEventId) setWatchedTurnId(lastUserEventId);
  const turnStillWanted = isTurnStillWanted(lastUserEventId, cancelledWaitTurnId, error);
  const turnWorkPhase = turnWorkPhaseOf({
    turnStillWanted,
    busy,
    hasPendingPermission: pending !== null,
    turnSilent,
    status,
    watchedTurnId,
    lastUserEventId,
    hasCompletedAgentAnswer,
  });
  const textArriving = isTextArriving(lastTurnUpdateAt, turnNowMs);
  const turnWork: TurnWork | null = turnWorkPhase && lastUserEventId !== null
    ? {
        turnId: lastUserEventId,
        phase: turnWorkPhase,
        activity: turnActivity(events, lastUserEventIndex, VAULT_MCP_SERVER_NAME, textArriving),
        plan: reportedPlan,
      }
    : null;
  const stopRequestTurn = () => {
    setCancelledWaitTurnId(events[lastUserEventIndex]?.id ?? null);
    dropPending();
    stopSessionTurn();
  };
  const liveSession = useLatestRef({ draft, error, diagnostics, stopRequestTurn });
  const mappingRequest = pending ? turnRequestOf(pending.request, vaultRoot) : null;
  const mappingWork = useMappingWork(
    busy && lastUserEventIndex >= 0
      ? turnWork?.activity ?? turnActivity(events, lastUserEventIndex, VAULT_MCP_SERVER_NAME, textArriving)
      : null,
    awaitingAnswer,
    mappingRequest,
    vaultRoot,
  );
  const figuresRef = useRef<MappingFiguresReader>(NO_FIGURES);
  const figuresReader = useMemo<MappingFiguresReader>(() => ({
    widest: () => figuresRef.current.widest(),
    project: (project) => figuresRef.current.project(project),
  }), []);
  const grantedFiles = useGrantedVaultFiles();
  const mapping = useMappingRun({
    folder: mapsTheRest ? vaultRoot : null,
    folderName: vaultRoot ? folderNameOf(vaultRoot) : '',
    agent: runtimeLabel,
    session: {
      status,
      waitingForAnswer: pending !== null,
      lastTurnUpdateAt,
      work: mappingWork,
      otherRequestWaiting: heldRequest !== null || openingWaiting,
      send,
      newConversation: async () => {
        setHistoryOpen(false);
        setPresentationOpen(false);
        markConnectStopped(false);
        await switchSession(null);
      },
      folderFiles: grantedFiles?.fileHandles ?? null,
      folderRoot: grantedFiles ? getTauriVaultRootPath(grantedFiles.root) ?? null : null,
      stopRequest: () => liveSession.current.stopRequestTurn(),
      hasDraft: () => liveSession.current.draft.trim().length > 0,
      usageLimited: () => {
        const { error: lastError, diagnostics: lastDiagnostics } = liveSession.current;
        return lastError !== null && readAcpTrouble(lastError, lastDiagnostics).kind === 'limit';
      },
    },
    figures: figuresReader,
    request: (figures, part) => {
      const share = mappingShare(figures);
      const text = share
        ? t('suggest.mapArea.prompt', share)
        : requestWithoutCount(t('suggest.mapArea.prompt', { mapped: 0, total: 0, percent: 0 }));
      return { text, shown: t('suggest.mapArea.line', { part }) };
    },
  });
  useLayoutEffect(() => {
    runTurnStartRef.current = mapping.observeTurnStart;
  });
  // One run reads as one conversation: its finished requests stand above the one on screen, and History groups them.
  const mappingSessions = useMappingSessions();
  const requestOpenings = useRequestOpenings(historyOpen);
  const historyRows = useMemo(
    () => groupRunConversations(sessions, mappingSessions.map((entry) => entry.sessionIds), (title) => isRunRequestText(title, requestOpenings)),
    [mappingSessions, requestOpenings, sessions],
  );
  const liveRequestSession = mapping.run ? mappingSessions.find((entry) => entry.runId === mapping.run?.id)?.sessionIds.at(-1) ?? null : null;
  // A request opened from its line stays on screen until the run sends its next one.
  const [openedRequest, setOpenedRequest] = useState<{ sessionId: string; whileLive: string | null } | null>(null);
  const shownRequestSession = openedRequest && openedRequest.whileLive === liveRequestSession ? openedRequest.sessionId : liveRequestSession;
  const [requestList, setRequestList] = useState<RunRequestItem[] | null>(null);
  const requestLine = useRequestLine();
  const canOpenRequest = mayOpenRunRequest({ driving: mapping.driving, busy, folderBusy: folderBusy !== null, run: mapping.run });
  const openRequest = (sessionId: string) => {
    setRequestList(null);
    setHistoryOpen(false);
    setOpenedRequest({ sessionId, whileLive: liveRequestSession });
    void switchSession(sessionId);
  };
  const listRunRequests = (row: Extract<HistoryRow, { kind: 'run' }>) => {
    setHistoryOpen(false);
    setRequestList(row.sessions.map((session, index) => ({
      key: session.sessionId,
      label: t('mapRun.listItem', { part: index + 1 }),
      detail: session.updatedAt ? formatDate(session.updatedAt) : null,
      sessionId: session.sessionId,
    })));
  };
  const stopTurn = useTurnHandover({
    busy,
    // A run holds its panel and folder between requests too, so a parked panel is kept and another dock waits.
    held: status === 'thinking' || pending !== null || mapping.driving,
    readOnly: activeTurnReadOnly,
    outlives: activeTurnOutlivesScreen || mapping.driving,
    stopping: turnStopping,
    request: mappingRequest,
    activity: () => lastUserEventIndex < 0 ? null
      : turnWork?.activity ?? turnActivity(events, lastUserEventIndex, VAULT_MCP_SERVER_NAME, textArriving),
    asking: awaitingAnswer,
    // Any Stop ends the whole run, the composer's included.
    stop: () => (mapping.driving ? mapping.stop() : stopRequestTurn()),
    onTurnWorkChange, onTurnStopChange, onBusyChange,
  });

  const displayStatus = displayStatusOf(connectStopped, status);
  const footerStatus = awaitingAnswer ? 'awaiting' : displayStatus;

  const presentation = usePresentation({
    presentationIntent,
    presentationRequest,
    status,
    events,
    knownSlugs,
    knownRelations,
    lastUserEventIndex,
    presentationOpen,
    setPresentationOpen,
    presentationSceneIndex,
    setPresentationSceneIndex,
    presentationOfferRef,
    inputRef,
    setHistoryOpen,
    setDraft,
    onMapIntent,
    onPresentationVisibilityChange,
    t,
  });
  const { presentationVisible } = presentation;

  const historyFade = 'var(--tabbar-edge-fade)';
  const historyMask =
    historyEdge.top && historyEdge.bottom
      ? `linear-gradient(to bottom, transparent 0, black ${historyFade}, black calc(100% - ${historyFade}), transparent 100%)`
      : historyEdge.bottom
        ? `linear-gradient(to bottom, black calc(100% - ${historyFade}), transparent 100%)`
        : historyEdge.top
          ? `linear-gradient(to bottom, transparent 0, black ${historyFade})`
          : undefined;
  const jumpShown = transcriptFollow.jumpVisible && !presentationVisible;
  const transcriptMask = transcriptScrolled || jumpShown
    ? `linear-gradient(to bottom, ${transcriptScrolled ? 'transparent 0, black var(--tabbar-edge-fade)' : 'black 0'}, ${jumpShown ? 'black calc(100% - var(--chrome-tile-size) - var(--tabbar-edge-fade)), transparent calc(100% - var(--chrome-tile-size))' : 'black 100%'})`
    : undefined;

  const { transcriptItems, markdownComponents, foldedAnswerIds, lastWorkGroupId, liveToolIds } =
    useTranscriptModel({ events, error, status, lastUserEventIndex, knownSlugs, onHoverSlug, answerFold });
  const awaitingToolId = status === 'thinking' ? pending?.request.toolCallId ?? null : null;

  return (
    <section
      ref={panelRef}
      data-testid="acp-chat-panel"
      data-acp-status={displayStatus}
      className="relative flex h-full min-h-0 flex-1 flex-col gap-3"
      aria-label={t('ariaLabel', { runtime: runtimeLabel })}
    >
      <Surface open={openingScopeMismatch} role="status" className="text-caption text-[color:var(--color-text-secondary)]">
        {t('openingScopeChanged')}
      </Surface>

      <TranscriptPane
        t={t}
        listRef={listRef}
        contentRef={transcriptContentRef}
        jumpShown={jumpShown}
        inert={presentationVisible}
        mask={transcriptMask}
        onScrolledChange={(scrolled) => setTranscriptScrolled((previous) => (previous === scrolled ? previous : scrolled))}
        onJumpToLatest={() => {
          transcriptFollow.follow();
          requestComposerFocus();
        }}
      >
        {mapsTheRest && mapping.run ? (
          <MappingRunRequests
            finished={mapping.run.finished}
            shownSession={shownRequestSession}
            canOpen={canOpenRequest}
            onOpen={openRequest}
            onOpenAll={() => setRequestList(numberedRequests(mapping.run?.finished ?? []).map((request) => ({
              key: String(request.part),
              label: requestLine(request),
              detail: null,
              sessionId: request.sessionId,
            })))}
          />
        ) : null}
        {folderBusy ? <FolderBusyState t={t} onStop={folderBusy.stop} /> : null}
        {connecting && !folderBusy ? (
          <StartingState
            t={t}
            download={download}
            suggestions={mapping.driving ? NO_SUGGESTIONS : suggestions}
            seatedRequestWaiting={seatedRequestWaiting}
            openingLead={openingWaiting && openingRequest ? splitAppRequest(openingRequest.text).lead : null}
            heldLead={heldRequest?.lead ?? null}
            onTakeBack={() => {
              returnHeld();
              requestComposerFocus();
            }}
          />
        ) : null}
        {connectStopped ? (
          <ConnectStoppedState
            t={t}
            onConnectAgain={() => {
              markConnectStopped(false);
              void start();
            }}
          />
        ) : null}
        {events.length === 0 && status !== 'starting' && !connectStopped && !folderBusy ? (
          <EmptyState
            t={t}
            seatedRequestWaiting={seatedRequestWaiting}
            suggestions={mapping.driving ? NO_SUGGESTIONS : nextSteps}
            canSend={canSend}
            providerNote={t('suggest.providerNote', { runtime: runtimeLabel })}
            onChoose={(suggestion) => chooseSuggestion(suggestion, true)}
            onDone={() => setNextStepsDismissed(true)}
            onEscape={() => inputRef.current?.focus()}
          />
        ) : null}
        <TranscriptRows
          items={transcriptItems}
          busy={busy}
          knownSlugs={knownSlugs}
          onHoverSlug={onHoverSlug}
          markdownComponents={markdownComponents}
          noticeActions={noticeActions}
          liveToolIds={liveToolIds}
          awaitingToolId={awaitingToolId}
          declinedToolIds={declinedToolIds}
          lastWorkGroupId={lastWorkGroupId}
          answerFold={answerFold}
          foldedAnswerIds={foldedAnswerIds}
        />
        <TranscriptOffers
          t={t}
          stoppedWithoutAnswer={stoppedWithoutAnswer}
          presentation={presentation}
          presentationOfferRef={presentationOfferRef}
          showPostTurnSuggestions={showPostTurnSuggestions}
          postTurnSuggestionsHeld={postTurnSuggestionsHeld}
          canSend={canSend}
          onChooseSuggestion={(suggestion) => chooseSuggestion(suggestion, false)}
          onDoneWithSuggestions={() => setNextStepsDismissed(true)}
          onEscapeSuggestions={() => inputRef.current?.focus()}
        />
      </TranscriptPane>

      <TurnWorkStage t={t} work={turnWork} />

      {error ? (
        <ErrorCard
          t={t}
          error={error}
          diagnostics={diagnostics}
          trouble={trouble}
          troubleHintKey={troubleHintKey}
          retryDisabled={displayStatus === 'starting'}
          onRetry={() => {
            setHistoryOpen(false);
            markConnectStopped(false);
            void switchSession(null);
          }}
          showDoctor={showDoctor}
          doctor={doctor}
        />
      ) : null}

      <PermissionSlot
        t={t}
        vaultRoot={vaultRoot}
        pending={pending}
        review={{
          pendingHeld,
          pendingForCard,
          pendingHeldChangeSet,
          permissionDeferred,
          answerHold,
          livePendingRef,
          requestCorrection,
        }}
        setDeferredPermission={setDeferredPermission}
        taskReview={taskMeaningReview}
        judgeWrite={judgeWrite}
        previewRequestKey={previewRequestKey}
        activePreviewIndex={activePreviewIndex}
        onActiveItemChange={(requestKey, itemIndex) => setPreviewSelection({ requestKey, itemIndex })}
      />

      {meaningTransitions.terminalSaveFailed ? <p role="status" className="px-3 text-caption text-[color:var(--color-text-secondary)]">{t('permission.taskReview.terminalSaveFailed')}</p> : null}

      {mapsTheRest && vaultRoot ? (
        <MapConversationMapping
          folder={vaultRoot}
          mapping={mapping}
          figuresRef={figuresRef}
          // A run sends in new conversations, which open in the tool's opening mode: the kept choice answers there.
          autoApprove={autoApprove}
          canStart={!busy && pending === null && !folderBusy && heldRequest === null && !openingWaiting}
          seated={!putAway}
        />
      ) : null}
      {beforeComposer ? (
        <div data-testid="acp-chat-before-composer" className="flex shrink-0 flex-wrap items-center gap-1 pb-1.5">
          {beforeComposer}
        </div>
      ) : null}
      <div
        data-testid="acp-chat-composer"
        inert={presentationVisible || folderBusy ? true : undefined}
        className="@container/composer relative shrink-0 rounded-card border border-[color:var(--color-border-soft)] bg-[color:var(--color-overlay-1)] p-[var(--card-pad)] transition-colors focus-within:border-[color:var(--color-indigo-focus-ring)]"
      >
        {composerFocused && draft.length === 0 ? (
          <span
            data-testid="acp-chat-hint"
            className={badgeClass({
              shape: 'micro',
              className:
                'pointer-events-none absolute right-3 top-3 bg-[color:var(--color-overlay-2)] text-[color:var(--color-text-quaternary)]',
            })}
          >
            {t('composerHint')}
          </span>
        ) : null}

        {slashOpen ? (
          <SlashMenu
            menuRef={slashMenuRef}
            label={t('composerLabel')}
            matches={slashMatches}
            activeIndex={slashActiveIndex}
            onActivate={setSlashActive}
            onChoose={chooseSlashCommand}
          />
        ) : null}

        {seatedDetail ? <SeatedDetailDisclosure t={t} detail={seatedDetail} /> : null}
        <ComposerInput
          t={t}
          inputRef={inputRef}
          mirrorRef={mirrorRef}
          draft={draft}
          setDraft={setDraft}
          setSeatedDetail={setSeatedDetail}
          composerFocused={composerFocused}
          setComposerFocused={setComposerFocused}
          composerSubject={composerSubject}
          canType={canType}
          slash={{
            open: slashOpen,
            matches: slashMatches,
            activeIndex: slashActiveIndex,
            setActive: setSlashActive,
            setDismissed: setSlashDismissed,
            choose: chooseSlashCommand,
          }}
          submit={submit}
        />

        {turnSilent ? <TurnSilentNotice t={t} minutes={silentMinutes} /> : null}
        {reportedPlan ? <ReportedPlanNote tGray={tGray} plan={reportedPlan} /> : null}
        <ComposerFooter
          t={t}
          runtimeLabel={runtimeLabel}
          contextLabel={contextLabel}
          toolPicker={toolPicker}
          toolIsPicker={toolIsPicker}
          toolPickerValue={toolPickerValue}
          onPickTool={(value) => {
            if (value.startsWith('model:')) void chooseModel(value.slice('model:'.length));
            else onRuntimeChange?.(value.slice('runtime:'.length));
          }}
          choicesRow={choicesRow}
          busy={busy}
          connecting={connecting}
          footerStatus={footerStatus}
          downloading={download !== null}
          displayStatus={displayStatus}
          turnSilent={turnSilent}
          turnElapsedLabel={turnElapsedLabel}
          hasHistory={sessions.length > 0}
          historyOpen={historyOpen}
          onToggleHistory={() => setHistoryOpen((open) => !open)}
          sessionButtonStandDown={sessionButtonStandDown}
          onNewChat={() => {
            setHistoryOpen(false);
            setPresentationOpen(false);
            markConnectStopped(false);
            void switchSession(null);
            requestComposerFocus();
          }}
          onStop={() => {
            stopTurn();
            requestComposerFocus();
          }}
          onStopConnecting={() => {
            // A run waits on this connection for its next request: the Stop ends the run, not only the connection.
            if (mapping.driving) mapping.stop();
            restartedOpeningNonceRef.current = openingNonce;
            markConnectStopped(true);
            void stop();
            requestComposerFocus();
          }}
          sendDisabled={(!canSend && !connecting) || busy || draft.trim().length === 0}
          onSend={submit}
        />

        <HistoryPopover
          t={t}
          open={historyOpen}
          rows={historyRows}
          listRef={historyListRef}
          edge={historyEdge}
          mask={historyMask}
          onMeasure={measureHistoryEdges}
          onPick={(sessionId) => {
            setHistoryOpen(false);
            void switchSession(sessionId);
          }}
          onPickRun={listRunRequests}
        />
        <MappingRunRequestsDialog items={requestList} canOpen={canOpenRequest} onOpen={openRequest} onClose={() => setRequestList(null)} />
      </div>

      {historyOpen && sessions.length > 0 ? (
        <button
          type="button"
          aria-label={t('closeHistory')}
          data-testid="acp-chat-history-scrim"
          onClick={() => setHistoryOpen(false)}
          className="absolute inset-0 cursor-default bg-[color:var(--color-overlay-1)]"
        />
      ) : null}
      <PresentationSurface
        t={t}
        visible={presentationVisible}
        trace={presentation.heldPresentationTrace}
        activeIndex={presentation.activePresentationIndex}
        onChangeScene={presentation.focusPresentationScene}
        onFocusCitation={onMapIntent
          ? (slug, toolCallId) => onMapIntent({ kind: 'focus', slug, toolCallId })
          : undefined}
        onOpenMap={onPresentationOpenMap
          ? (scene) => onPresentationOpenMap(scene.focus.slug, scene.focus.toolCallId)
          : undefined}
        onAsk={presentation.askAboutPresentationScene}
        onClose={presentation.closePresentation}
      />
    </section>
  );
}

/** The agent's report in the words the run's card reads, one object while nothing in it changes. */
function useMappingWork(
  activity: Pick<TurnActivity, 'kind' | 'label' | 'target'> | null,
  asking: boolean,
  request: AcpTurnRequest | null,
  vaultRoot: string | null,
): TurnWorkReport | null {
  const kind = activity?.kind ?? null;
  const labelKind = activity?.label?.kind ?? null;
  const labelText = activity?.label?.text ?? null;
  const rawTarget = activity?.target ?? null;
  const target = rawTarget && vaultRoot && rawTarget.startsWith(`${vaultRoot}/`) ? rawTarget.slice(vaultRoot.length + 1) : rawTarget;
  const requestAction = asking ? request?.action ?? null : null;
  const requestTarget = asking ? request?.target ?? null : null;
  return useMemo(() => (kind === null ? null : {
    kind,
    label: labelKind === null ? null : { kind: labelKind, text: labelText ?? '' },
    target,
    asking,
    request: requestAction === null ? null : { action: requestAction, target: requestTarget },
  }), [asking, kind, labelKind, labelText, requestAction, requestTarget, target]);
}

/** The row and the folder's figures; only the map conversation renders it, inside the folder's provider. */
function MapConversationMapping({ folder, mapping, figuresRef, autoApprove, canStart, seated }: {
  folder: string;
  mapping: MappingRunDriver;
  figuresRef: RefObject<MappingFiguresReader>;
  autoApprove: boolean;
  canStart: boolean;
  seated: boolean;
}) {
  const figures = useFolderMappingFigures();
  useLayoutEffect(() => {
    figuresRef.current = figures.reader;
  });
  const [collapsed, setCollapsed] = useState(() => collapsedMappingFolders.has(folder));
  const { run } = mapping;
  const shown = run !== null || (figures.resting?.figures.abilitiesUncovered ?? 0) > 0;
  useMappingStage(folder, shown && seated);
  if (!shown) return null;
  return (
    <MappingRunRow
      run={run}
      resting={figures.resting?.figures ?? null}
      autoApprove={autoApprove}
      canStart={canStart}
      collapsed={collapsed}
      onStart={mapping.start}
      onStop={mapping.stop}
      onClose={() => workRuns.closeRun(`mapping:${folder}`)}
      onCollapse={() => {
        collapsedMappingFolders.add(folder);
        setCollapsed(true);
      }}
      onExpand={() => {
        collapsedMappingFolders.delete(folder);
        setCollapsed(false);
      }}
    />
  );
}

function UnkeptPanel(props: AcpChatPanelProps) {
  const folderBusy = useFolderBusy('', props.vaultRoot);
  return <AcpChatPanelBody {...(folderBusy ? { ...props, sessionEnabled: false, folderBusy } : props)} />;
}

export function AcpChatPanel({ keepKey, ...props }: AcpChatPanelProps & { keepKey?: string }) {
  if (!keepKey) return <UnkeptPanel {...props} />;
  const kept: AcpChatPanelBodyProps = keepKey.startsWith(MAP_CONVERSATION_KEY_PREFIX) ? { ...props, mapsTheRest: true } : props;
  return <KeptPanelSeat keepKey={keepKey} props={kept} />;
}
