'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';

import { isAgentDoctorAvailable, useAgentDoctor } from '@/features/acp-doctor';
import { readAcpTrouble, useAcpSession, type ChatSuggestion } from '@/features/acp-session';
import { MOTION } from '@/shared/motion';
import { usePrefersReducedMotion } from '@/shared/lib/use-prefers-reduced-motion';
import { badgeClass } from '@/shared/ui/badge-class';
import { RowButton, Surface } from '@/shared/ui';

import { useTaskMeaningReview } from '../model/use-task-meaning-review';
import { useTranscriptFollow } from '../model/use-transcript-follow';
import { splitAppRequest } from './request-parts';
import { ComposerInput } from './chat-panel/ComposerInput';
import { ChoicesRow, ComposerFooter } from './chat-panel/ComposerFooter';
import { ReportedPlanNote, SeatedDetailDisclosure, TurnSilentNotice } from './chat-panel/ComposerNotices';
import { ErrorCard } from './chat-panel/ErrorCard';
import { HistoryPopover } from './chat-panel/HistoryPopover';
import { PermissionSlot } from './chat-panel/PermissionSlot';
import { PresentationSurface } from './chat-panel/PresentationSurface';
import { TranscriptOffers } from './chat-panel/TranscriptOffers';
import { TranscriptPane } from './chat-panel/TranscriptPane';
import { TranscriptRows } from './chat-panel/TranscriptRows';
import { ConnectStoppedState, EmptyState, StartingState } from './chat-panel/TranscriptStates';
import type { AcpChatPanelProps } from './chat-panel/types';
import { useHistoryEscape, useHistoryMenu, useSlashMenu } from './chat-panel/use-composer-menus';
import { useComposerSizing } from './chat-panel/use-composer-sizing';
import { useOpeningRequest } from './chat-panel/use-opening-request';
import { usePermissionReview } from './chat-panel/use-permission-review';
import { usePrefillSeating } from './chat-panel/use-prefill-seating';
import { usePresentation } from './chat-panel/use-presentation';
import { useRelationPreview } from './chat-panel/use-relation-preview';
import { useTranscriptModel } from './chat-panel/use-transcript-model';
import { useTranscriptSignals } from './chat-panel/use-transcript-signals';
import { useTurnCapture } from './chat-panel/use-turn-capture';
import { useTurnReports } from './chat-panel/use-turn-reports';
import { useTurnClock, useTurnSilence } from './chat-panel/use-turn-timing';

export type { AcpMapIntent } from '@/features/acp-session';
export type { AcpOntologyRelationPreview } from './chat-panel/types';

export function AcpChatPanel({
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
  captureTaskBaseline,
  meaningTransitionContext,
}: AcpChatPanelProps) {
  const t = useTranslations('acpChat');
  const tGray = useTranslations('grayArea');
  const reducedMotion = usePrefersReducedMotion();
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
  });
  const {
    status,
    lastTurnUpdateAt,
    events,
    slashCommands,
    error,
    diagnostics,
    download,
    pending,
    approvedOntologyWrite,
    sessions,
    choices,
    reportedPlan,
    chooseModel,
    chooseMode,
    start,
    send,
    sendInvestigation,
    cancel,
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
    systemPromptAppendix,
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
  const troubleHintKey = trouble?.kind === 'limit' && !canChooseAnotherTool
    ? 'trouble.limit.hintOnlyTool'
    : `trouble.${trouble?.kind ?? 'unknown'}.hint`;
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

  const { restartedOpeningNonceRef, openingNonce } = useOpeningRequest({
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
  });

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
  } = usePermissionReview({ pending, inputRef, setDraft, t });

  const chooseSlashCommand = (name: string) => {
    setDraft(`/${name} `);
    setSlashDismissed(true);
    inputRef.current?.focus();
  };
  const chooseSuggestion = (suggestion: ChatSuggestion, allowAppAction: boolean) => {
    if (allowAppAction && onSuggestionAction?.(suggestion)) return;
    setDraft(t(`suggest.${suggestion.kind}.prompt`, suggestion.params));
    inputRef.current?.focus();
  };

  useEffect(() => {
    if (!sessionEnabled || connectStoppedRef.current) return;
    void start();
  }, [sessionEnabled, start]);

  useHistoryEscape(historyOpen, setHistoryOpen);

  const { follow: followTranscript, restore: restoreTranscript } = transcriptFollow;
  const { lastUserEventIndex, hasCompletedAgentAnswer, showPostTurnSuggestions, postTurnSuggestionsHeld } =
    useTranscriptSignals({
      events,
      status,
      pending,
      error,
      draft,
      suggestions,
      followTranscript,
      restoreTranscript,
    });

  useComposerSizing({ draft, inputRef, mirrorRef, panelRef, composerFocusRequest });

  const submit = useCallback(() => {
    const lead = draft.trim();
    if (!lead || status !== 'ready') return;
    const text = seatedDetail
      ? (lead === seatedDetail.lead ? seatedDetail.full : `${lead}\n\n${seatedDetail.detail}`)
      : lead;
    setPresentationOpen(false);
    onPresentationVisibilityChange?.(false);
    setDraft('');
    setSeatedDetail(null);
    void send(text);
  }, [draft, onPresentationVisibilityChange, seatedDetail, send, setPresentationOpen, setSeatedDetail, status]);

  const toolPicker = (runtimes.length > 0 ? runtimes : [{ id: runtimeId, label: runtimeLabel }]).flatMap((r) =>
    r.id === runtimeId && choices.models.length > 0
      ? choices.models.map((model) => ({ value: `model:${model.id}`, label: `${r.label} · ${model.name}` }))
      : [{ value: `runtime:${r.id}`, label: r.label }],
  );
  const toolIsPicker = canChooseAnotherTool || toolPicker.length > 1;
  const busy = status === 'thinking';
  const connecting = status === 'starting' && !connectStopped;
  const sessionButtonStandDown = busy || connecting ? 'hidden @min-[296px]/composer:inline-flex' : undefined;
  const toolPickerValue =
    choices.models.length > 0 ? (choices.currentModelId ? `model:${choices.currentModelId}` : '') : `runtime:${runtimeId}`;
  const choicesRow = (
    <ChoicesRow
      t={t}
      choices={choices}
      busy={busy}
      toolIsPicker={toolIsPicker}
      onChooseMode={(value) => void chooseMode(value)}
    />
  );

  const awaitingAnswer = busy && pending !== null;
  const clockPhase = !busy ? null : awaitingAnswer ? 'awaiting' : 'thinking';
  const { turnElapsedLabel } = useTurnClock({ clockPhase, t });

  const canType = status === 'ready' || status === 'thinking' || status === 'idle' || status === 'starting';
  const canSend = status === 'ready';

  const { turnSilent, silentMinutes } = useTurnSilence({ busy, lastTurnUpdateAt, pending, status });
  const [cancelledWaitTurnId, setCancelledWaitTurnId] = useState<string | null>(null);

  const stoppedWithoutAnswer =
    !busy
    && lastUserEventIndex >= 0
    && cancelledWaitTurnId !== null
    && events[lastUserEventIndex]?.id === cancelledWaitTurnId
    && !hasCompletedAgentAnswer
    && !events.some((event, index) => index > lastUserEventIndex && event.kind === 'tool');
  const showAnswerWait = busy
    && lastUserEventIndex >= 0
    && events[lastUserEventIndex]?.id !== cancelledWaitTurnId
    && !hasCompletedAgentAnswer
    && pending === null
    && error === null
    && !turnSilent;

  const displayStatus = connectStopped ? 'stopped' : status === 'idle' ? 'starting' : status;
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
        {connecting ? (
          <StartingState t={t} download={download} suggestions={suggestions} seatedRequestWaiting={seatedRequestWaiting} />
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
        {events.length === 0 && status !== 'starting' && !connectStopped ? (
          <EmptyState
            t={t}
            seatedRequestWaiting={seatedRequestWaiting}
            suggestions={suggestions}
            onChoose={(suggestion) => chooseSuggestion(suggestion, true)}
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
          showAnswerWait={showAnswerWait}
          stoppedWithoutAnswer={stoppedWithoutAnswer}
          presentation={presentation}
          presentationOfferRef={presentationOfferRef}
          showPostTurnSuggestions={showPostTurnSuggestions}
          postTurnSuggestionsHeld={postTurnSuggestionsHeld}
          onChooseSuggestion={(suggestion) => chooseSuggestion(suggestion, false)}
        />
      </TranscriptPane>

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

      {beforeComposer ? (
        <div data-testid="acp-chat-before-composer" className="flex shrink-0 flex-wrap items-center gap-1 pb-1.5">
          {beforeComposer}
        </div>
      ) : null}
      <div
        data-testid="acp-chat-composer"
        inert={presentationVisible ? true : undefined}
        className="@container/composer relative shrink-0 rounded-card border border-[color:var(--color-border-soft)] bg-[color:var(--color-overlay-1)] p-[var(--card-pad)] transition-colors focus-within:border-[color:var(--color-indigo-a46)]"
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
          <ul
            ref={slashMenuRef}
            data-testid="acp-chat-slash-menu"
            role="listbox"
            aria-label={t('composerLabel')}
            className="atlas-scroll-quiet max-h-56 shrink-0 overflow-y-auto rounded-card border border-[color:var(--color-divider)] bg-[color:var(--color-elevated)] p-1"
          >
            {slashMatches.map((command, index) => {
              const active = index === slashActiveIndex;
              return (
                <li key={command.name} role="option" aria-selected={active}>
                  <RowButton
                    active={active}
                    hoverSurface="lift"
                    hoverInk="strong"
                    onMouseEnter={() => setSlashActive(index)}
                    onClick={() => chooseSlashCommand(command.name)}
                    className="w-full gap-2"
                  >
                    <span className="shrink-0 font-mono text-label">/{command.name}</span>
                    {command.description ? (
                      <span className="min-w-0 flex-1 truncate text-left text-label text-[color:var(--color-text-quaternary)]">
                        {command.description}
                      </span>
                    ) : null}
                  </RowButton>
                </li>
              );
            })}
          </ul>
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
            setCancelledWaitTurnId(events[lastUserEventIndex]?.id ?? null);
            const request = livePendingRef.current;
            livePendingRef.current = null;
            request?.resolve(null);
            setDeferredPermission(null);
            cancel();
            requestComposerFocus();
          }}
          onStopConnecting={() => {
            restartedOpeningNonceRef.current = openingNonce;
            markConnectStopped(true);
            void stop();
            requestComposerFocus();
          }}
          sendDisabled={!canSend || busy || draft.trim().length === 0}
          onSend={submit}
        />

        <HistoryPopover
          t={t}
          open={historyOpen}
          sessions={sessions}
          listRef={historyListRef}
          edge={historyEdge}
          mask={historyMask}
          onMeasure={measureHistoryEdges}
          onPick={(sessionId) => {
            setHistoryOpen(false);
            void switchSession(sessionId);
          }}
        />
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
