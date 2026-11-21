'use client';

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useLocale } from 'next-intl';

import {
  acpPermissionVerdict,
  isAcpBridgeAvailable,
  listenToAcpSession,
  sendAcpLine,
  startAcpSession,
  stopAcpSession,
} from '@/shared/lib/agent-chat/tauri-acp';

import { isPermissionProfileMode, modeKeepsGate } from './session-choices/mode-safety';
import type { InvestigationSendGuard } from './investigation/guard';
import { keepStandingChoice, standingChoiceKept, useStandingChoice } from './permissions/standing-choice';
import { rememberModel } from './session-choices/remembered-choices';
import type { ReportedPlan } from './investigation/reported-plan';
import { readAdapterNotice } from './connection/adapter-notice';
import { openSession } from './connection/open-session';
import { isDiagnosticStderr } from './trouble/acp-trouble';
import { useAdapterDiagnostics } from './trouble/use-adapter-diagnostics';
import type { AcpSlashCommand } from './session-choices/slash-commands';
import { hasVaultMcpServer, VAULT_MCP_SERVER_NAME, vaultWriteConsentOn } from './runtime-wiring/vault-mcp-server';
import { orderSessionsByRecency } from './session-recency';
import {
  createAcpClient,
  type AcpClient,
  type AcpPermissionRequest,
  type AcpSessionChoices,
  type AcpSessionSummary,
  type AcpTransport,
} from './acp-client';
import type { AcpWorkReceipt } from '@/shared/lib/meaning-transition/acp-work-receipt';
import type { TaskBaselineCaptureResult } from './task-baseline';
import { appendEvent, nextEventId, type AcpEvent, type AcpSessionStatus } from './conversation/acp-events';
import {
  askPermission,
  isPromise,
  type AcpAutoDecision,
  type PendingPermission,
} from './permissions/ask-permission';
import { refuseOpenAsk } from './permissions/refuse-open-ask';
import { applySessionUpdate } from './session-updates/apply-session-update';
import { turnEventsSnapshot, type AcpTurnCompletion, type AcpTurnStart, type ActiveTurn } from './turns/acp-turn';
import { sendTurn } from './turns/send-turn';

export type { AcpEvent, AcpSessionStatus } from './conversation/acp-events';
export type { AcpAutoDecision, PendingPermission } from './permissions/ask-permission';
export type { AcpTurnCompletion, AcpTurnStart } from './turns/acp-turn';

export interface UseAcpSessionOptions {
  runtimeId: string;
  vaultRoot: string | null;
  mcpServers?: unknown[];
  approvalSettleMs?: number;
  onWorkReceipt?: (receipt: AcpWorkReceipt) => void;
  onTurnStarted?: (turn: AcpTurnStart) => ((turn: AcpTurnCompletion) => void | Promise<void>) | null;
  captureTaskBaseline?: (turn: AcpTurnStart) => Promise<TaskBaselineCaptureResult>;
  /** A note allows without a card, `{ reject }` refuses, null asks. Ontology writes never come here. */
  autoDecide?: (request: AcpPermissionRequest) => AcpAutoDecision | Promise<AcpAutoDecision>;
  /** Asked once as a turn starts; a read-only turn stays so for its whole life and none of its writes is answered without a person. */
  turnReadOnly?: (turn: AcpTurnStart) => boolean;
  turnOutlivesScreen?: (turn: AcpTurnStart) => boolean;
  onToolSettled?: (toolCallId: string, status: string) => void;
  systemPromptAppendix?: string | null;
  resumeLatest?: boolean;
  putAway?: boolean;
  /** An unattended caller leaves it off: it never auto-approves and keeps the adapter's own model. */
  rememberChoices?: boolean;
}

const PUT_AWAY_IDLE_STOP_MS = 10 * 60 * 1000;

export const TURN_STOP_GRACE_MS = 5_000;

const EMPTY_CHOICES: AcpSessionChoices = {
  models: [],
  currentModelId: null,
  modes: [],
  currentModeId: null,
  unverifiedModeIds: [],
  droppedModeCount: 0,
};

/**
 * One ACP session's lifetime. The screen shows only what has happened: a tool row appears after the
 * agent called it. A permission request waits for the screen; if the panel or session ends it
 * answers with a rejection, since counting an unasked question as allowed is having no gate.
 */
export function useAcpSession({
  runtimeId,
  vaultRoot,
  mcpServers,
  approvalSettleMs = 0,
  onWorkReceipt,
  onTurnStarted,
  captureTaskBaseline,
  autoDecide,
  turnReadOnly,
  turnOutlivesScreen,
  onToolSettled,
  systemPromptAppendix = null,
  resumeLatest = false,
  putAway = false,
  rememberChoices = false,
}: UseAcpSessionOptions) {
  const locale = useLocale();
  const currentTurnScopeRef = useRef({ runtimeId, vaultRoot });
  useLayoutEffect(() => {
    currentTurnScopeRef.current = { runtimeId, vaultRoot };
  }, [runtimeId, vaultRoot]);
  const [status, setStatus] = useState<AcpSessionStatus>('idle');
  // `prompt` has no timeout, so a turn that ends without a result would hold the composer shut;
  // this tells "still working" from "stopped answering" (`turn-liveness.ts`).
  const [lastTurnUpdateAt, setLastTurnUpdateAt] = useState<number | null>(null);
  // A ref too: `onExit` runs outside render and needs the status at that moment (died mid-answer or finished).
  const statusRef = useRef<AcpSessionStatus>('idle');
  // null means none. An interrupted first npx fetch leaves a half-built cache (healed in
  // `src-tauri/src/acp/npx_cache.rs`); `mb` is null until the first notice, as the total is unknown.
  const [download, setDownload] = useState<{ mb: number | null } | null>(null);
  const setStatusTracked = useCallback((next: AcpSessionStatus) => {
    statusRef.current = next;
    setStatus(next);
    if (next !== 'starting') setDownload(null);
  }, []);
  const [events, setEvents] = useState<AcpEvent[]>([]);
  const eventsRef = useRef<AcpEvent[]>([]);
  const updateEvents = useCallback((update: (previous: AcpEvent[]) => AcpEvent[]) => {
    const next = update(eventsRef.current);
    eventsRef.current = next;
    setEvents(next);
  }, []);
  const activeTurnRef = useRef<ActiveTurn | null>(null);
  const [activeTurnReadOnly, setActiveTurnReadOnly] = useState(false);
  const [activeTurnOutlivesScreen, setActiveTurnOutlivesScreen] = useState(false);
  const [turnStopping, setTurnStopping] = useState(false);
  const turnStopTimerRef = useRef<number | null>(null);
  const turnReadOnlyRef = useRef<UseAcpSessionOptions['turnReadOnly']>(undefined);
  const turnOutlivesScreenRef = useRef<UseAcpSessionOptions['turnOutlivesScreen']>(undefined);
  const [error, setError] = useState<string | null>(null);
  const [slashCommands, setSlashCommands] = useState<AcpSlashCommand[]>([]);
  const { diagnostics, gateOffRef, keepDiagnostic, resetDiagnostics } = useAdapterDiagnostics();
  const [pending, setPending] = useState<PendingPermission | null>(null);
  const [approvedOntologyWrite, setApprovedOntologyWrite] =
    useState<AcpPermissionRequest | null>(null);
  const [sessions, setSessions] = useState<AcpSessionSummary[]>([]);
  // Per adapter: codex offers 33 models, claude none (`session/set_model` is "no such method"),
  // so the screen draws only what arrived.
  const [choices, setChoicesState] = useState<AcpSessionChoices>(EMPTY_CHOICES);
  const [reportedPlan,setReportedPlan] = useState<ReportedPlan|null>(null);
  const choicesRef = useRef(EMPTY_CHOICES);
  const sessionConsentRef = useRef(false);
  const changingModeRef = useRef(0);
  const setChoices = useCallback((value: AcpSessionChoices | ((current: AcpSessionChoices) => AcpSessionChoices)) => {
    const next = typeof value === 'function' ? value(choicesRef.current) : value;
    choicesRef.current = next;
    setChoicesState(next);
  }, []);

  const clientRef = useRef<AcpClient | null>(null);
  const sessionIdRef = useRef<string | null>(null);
  const resumeIdRef = useRef<string | null>(null);
  const idleStoppedSessionIdRef = useRef<string | null>(null);
  const openAsksRef = useRef(0);
  // Without this, `switchSession(null)` clearing `resumeIdRef` and a `start()` resuming the latest
  // conversation cancel each other: a new conversation has to mean new.
  const freshRequestedRef = useRef(false);
  const resumeLatestRef = useRef(resumeLatest);
  useEffect(() => {
    resumeLatestRef.current = resumeLatest;
  }, [resumeLatest]);
  // `clientRef` fills only after everything finishes, so it is late as a guard.
  const startingRef = useRef(false);
  // Incremented on every `stop()`. `start()` checks it after each await and, when stale, cleans up
  // what it created itself: otherwise closing mid-start leaves the adapter running behind a closed screen.
  const generationRef = useRef(0);
  // `start` and `stop` cannot depend on each other (a cycle); the ref calls the latest.
  const startRef = useRef<(() => Promise<void>) | null>(null);
  const autoDecideRef = useRef<UseAcpSessionOptions['autoDecide']>(undefined);
  const onToolSettledRef = useRef<UseAcpSessionOptions['onToolSettled']>(undefined);
  const systemPromptAppendixRef = useRef<string | null>(systemPromptAppendix);
  const stopRef = useRef<(() => Promise<void>) | null>(null);
  const acpSessionRef = useRef<string | null>(null);
  const unlistenRef = useRef<(() => void) | null>(null);
  const disposedRef = useRef(false);
  const pendingResolverRef = useRef<((optionId: string | null) => void) | null>(null);
  // One resolver slot let a second card overwrite the first, leaving its JSON-RPC id unanswered.
  const askChainRef = useRef<Promise<unknown>>(Promise.resolve());
  const permissionDecisionTimerRef = useRef<number | null>(null);
  // Alongside state so the `tool_call_update` callback reads the latest approval target.
  const approvedOntologyWriteRef = useRef<AcpPermissionRequest | null>(null);
  const approvedReceiptsRef = useRef(new Map<string, {
    toolCallId: string | null;
    receipt: AcpWorkReceipt;
  }>());
  const latestUserRequestRef = useRef<string | null>(null);
  const onWorkReceiptRef = useRef(onWorkReceipt);
  const standingChoice = useStandingChoice(vaultRoot);
  const autoApprove = rememberChoices && standingChoice;
  const autoApproveNow = useCallback(
    () => rememberChoices && standingChoiceKept(vaultRoot),
    [rememberChoices, vaultRoot],
  );
  const setAutoApprove = useCallback((on: boolean) => {
    if (rememberChoices) keepStandingChoice(vaultRoot, on);
  }, [rememberChoices, vaultRoot]);

  useEffect(() => {
    onWorkReceiptRef.current = onWorkReceipt;
  }, [onWorkReceipt]);

  const emitWorkReceipt = useCallback((receipt: AcpWorkReceipt) => {
    try {
      onWorkReceiptRef.current?.(receipt);
    } catch {
      // A local audit write must never strand the ACP permission response.
    }
  }, []);

  const setApprovedOntologyWriteTracked = useCallback(
    (request: AcpPermissionRequest | null) => {
      approvedOntologyWriteRef.current = request;
      setApprovedOntologyWrite(request);
    },
    [],
  );

  const push = useCallback((event: AcpEvent) => {
    updateEvents((prev) => appendEvent(prev, event));
  }, [updateEvents]);

  const finishTurn = useCallback((outcome: AcpTurnCompletion['outcome'], stopReason: string | null) => {
    const active = activeTurnRef.current;
    if (!active) return;
    activeTurnRef.current = null;
    setActiveTurnReadOnly(false);
    setActiveTurnOutlivesScreen(false);
    setTurnStopping(false);
    if (turnStopTimerRef.current !== null) {
      window.clearTimeout(turnStopTimerRef.current);
      turnStopTimerRef.current = null;
    }
    if (!active.observer) return;
    const turnEvents = turnEventsSnapshot(eventsRef.current, active.start.userEventId);
    const completion: AcpTurnCompletion = {
      ...active.start,
      endedAt: new Date().toISOString(),
      outcome: active.cancelRequested ? 'cancelled' : outcome,
      stopReason,
      events: turnEvents,
    };
    if (completion.events.some((event) => event.kind === 'tool' && event.outputEvidence)) {
      updateEvents((previous) => previous.map((event) => {
        if (event.kind !== 'tool' || !event.outputEvidence) return event;
        const { outputEvidence: _handedOver, ...kept } = event;
        return kept;
      }));
    }
    // Archival failure must not retry the prompt or turn a successful model
    // response into an ACP transport error. The caller owns save/retry UI.
    try {
      void Promise.resolve(active.observer(completion)).catch((error) => {
        keepDiagnostic(`analysis-archive: ${error instanceof Error ? error.message : String(error)}`);
      });
    } catch (error) {
      keepDiagnostic(`analysis-archive: ${error instanceof Error ? error.message : String(error)}`);
    }
  }, [keepDiagnostic, updateEvents]);

  // Stops the screen claiming a gate it no longer has; the checkpoint reassurance is attached only when `vaultWriteConsentOn`.
  const noteModeMoved = useCallback(
    (modeId: string, reason: string) => {
      push({
        kind: 'notice',
        id: nextEventId(),
        text: isPermissionProfileMode(modeId) ? 'profile-mode-moved' : 'mode-moved',
        mode: modeId,
        serverGate: vaultWriteConsentOn(mcpServers),
      });
      keepDiagnostic(`gate-off:${reason}`);
    },
    [keepDiagnostic, mcpServers, push],
  );

  const applyUpdate = useCallback(
    (update: Record<string, unknown>, updateContext: { sessionId: string | null }) => applySessionUpdate(update, updateContext, {
      sessionIdRef,
      activeTurnRef,
      onToolSettledRef,
      approvedOntologyWriteRef,
      approvedReceiptsRef,
      setLastTurnUpdateAt,
      setReportedPlan,
      setSlashCommands,
      setChoices,
      noteModeMoved,
      push,
      updateEvents,
      emitWorkReceipt,
      setApprovedOntologyWriteTracked,
    }),
    [emitWorkReceipt, noteModeMoved, push, setApprovedOntologyWriteTracked, setChoices, updateEvents],
  );

  const askUser = useCallback((request: AcpPermissionRequest) => askPermission(request, {
    runtimeId,
    vaultRoot,
    mcpServers,
    approvalSettleMs,
    generationRef,
    statusRef,
    activeTurnRef,
    sessionIdRef,
    latestUserRequestRef,
    choicesRef,
    autoDecideRef,
    approvedReceiptsRef,
    pendingResolverRef,
    permissionDecisionTimerRef,
    openAsksRef,
    askChainRef,
    setPending,
    autoApproveNow,
    emitWorkReceipt,
    push,
    setApprovedOntologyWriteTracked,
  }), [approvalSettleMs, autoApproveNow, emitWorkReceipt, mcpServers, push, runtimeId, setApprovedOntologyWriteTracked, vaultRoot]);

  const start = useCallback(async () => {
    if (!isAcpBridgeAvailable() || !vaultRoot) return;
    // Take the lock before the first await: `clientRef` fills only after spawn, so a second `start()`
    // (dev double invocation, a new `mcpServers` array each render) would start two adapters.
    if (clientRef.current || startingRef.current) return;
    startingRef.current = true;
    const generation = generationRef.current;
    const stale = () => generationRef.current !== generation;
    setStatusTracked('starting');
    setError(null);
    try {
      const acpSessionId = await startAcpSession(runtimeId, vaultRoot);
      if (!acpSessionId) throw new Error('bridge-unavailable');
      if (stale()) {
        await stopAcpSession(acpSessionId);
        return;
      }
      acpSessionRef.current = acpSessionId;

      let onLine: ((line: string) => void) | null = null;
      const transport: AcpTransport = {
        send: (line) => sendAcpLine(acpSessionId, line),
        subscribe: (cb) => {
          onLine = cb;
          return () => {
            onLine = null;
          };
        },
      };

      resetDiagnostics();
      unlistenRef.current = await listenToAcpSession(acpSessionId, {
        onMessage: (line) => onLine?.(line),
        // stderr is diagnosis, not a bubble: the adapter's install log in the conversation is unreadable.
        onNotice: (message) => {
          const notice = readAdapterNotice(message);
          if (notice.kind === 'download-progress') {
            setDownload({ mb: notice.megabytes });
            // A download in flight is not a hang: restart the handshake deadline; a real stall still times out.
            if (!stale() && acpSessionRef.current === acpSessionId) {
              clientRef.current?.extendPendingDeadlines();
            }
            return;
          }
          if (notice.kind === 'download-done') {
            setDownload(null);
            return;
          }
          if (notice.kind === 'first-run-download') {
            setDownload({ mb: null });
            keepDiagnostic(message);
            return;
          }
          // `gate-off` means "we ask first outside the folder" is not kept: it must show, not fold away.
          if (notice.kind === 'gate-off') {
            push({ kind: 'notice', id: nextEventId(), text: 'gate-off' });
          }
          keepDiagnostic(message);
        },
        // Noise is never collected (`isDiagnosticStderr`); collected lines show only on error.
        onStderr: (line) => {
          if (!isDiagnosticStderr(line)) return;
          keepDiagnostic(line);
        },
        onExit: () => {
          // A late callback from an old session must not clear the current ref. Dying mid-answer is
          // `died-mid-turn`, so a truncated answer is not read as complete.
          if (stale() || acpSessionRef.current !== acpSessionId) return;
          if (statusRef.current === 'thinking') {
            push({ kind: 'notice', id: nextEventId(), text: 'died-mid-turn' });
          }
          finishTurn('failed', 'process_exited');
          setStatusTracked('exited');
          refuseOpenAsk({ permissionDecisionTimerRef, pendingResolverRef, setPending });
          setApprovedOntologyWriteTracked(null);
          approvedReceiptsRef.current.clear();
          // Pending calls never finish otherwise, and `clientRef` would block `start()` from restarting.
          clientRef.current?.dispose();
          clientRef.current = null;
        },
      });

      if (stale()) {
        unlistenRef.current?.();
        unlistenRef.current = null;
        acpSessionRef.current = null;
        await stopAcpSession(acpSessionId);
        return;
      }

      // By name: external connectors share the array, so non-empty does not mean the vault server is wired.
      const hasVaultMcp = hasVaultMcpServer(mcpServers);
      const client = createAcpClient(transport, {
        onUpdate: applyUpdate,
        onAutoAllowed: (request) => {
          // Atlas reads are answered inside the protocol client and skip `askUser`'s standing-round
          // receipt, so the active surface classifies them here.
          const noteAllowed = (note: AcpAutoDecision | undefined) => {
            if (typeof note === 'string') push({ kind: 'notice', id: nextEventId(), text: 'auto-allowed', detail: note });
          };
          const decision = autoDecideRef.current?.(request);
          if (decision !== undefined && isPromise(decision)) void decision.then(noteAllowed, () => undefined);
          else noteAllowed(decision);
        },
        refuseAll: () => activeTurnRef.current?.stopping === true,
        // Pass the name only when wired, or someone else's `atlas-vault` server would inherit the auto-allow.
        vaultMcpServerName: hasVaultMcp ? VAULT_MCP_SERVER_NAME : undefined,
        verdict: (filePath) => acpPermissionVerdict(acpSessionId, filePath),
        askUser,
        onProtocolNotice: (message) => keepDiagnostic(message),
      });
      clientRef.current = client;

      await client.initialize();
      const opened = await openSession({
        client,
        runtimeId,
        vaultRoot,
        mcpServers,
        hasVaultMcp,
        locale,
        rememberChoices,
        isStale: stale,
        resumeIdRef,
        resumeLatestRef,
        freshRequestedRef,
        disposedRef,
        idleStoppedSessionIdRef,
        systemPromptAppendixRef,
        sessionIdRef,
        sessionConsentRef,
        latestUserRequestRef,
        setSessions,
        updateEvents,
        keepDiagnostic,
      });
      if (!opened) return;

      if (!disposedRef.current) {
        setChoices(opened.choices);
        if (opened.gateRemovedMode !== null) {
          noteModeMoved(opened.gateRemovedMode, `mode-initial:${opened.gateRemovedMode}`);
        }
        setStatusTracked('ready');
      }
      // The list is filled after the session stands, so it does not hold up the frame the screen appears in.
      void client
        .listSessions(vaultRoot)
        .then((list) => {
          // Newest first, the order the resume chose from: the top history row and the reopened conversation must match.
          if (!disposedRef.current) setSessions(orderSessionsByRecency(list));
        })
        .catch(() => {
          /* Being unable to read past conversations is not this conversation's problem. */
        });
    } catch (err) {
      // Generation-guarded like every success-path await: a superseded start can reject after `stop()`
      // and must not clean up the replacement's listener, client or process.
      if (!stale()) {
        setError(err instanceof Error ? err.message : String(err));
        setStatusTracked('error');
        // The child may already be up; the next `start()` would spawn another and orphan it.
        const orphan = acpSessionRef.current;
        if (orphan) {
          acpSessionRef.current = null;
          unlistenRef.current?.();
          unlistenRef.current = null;
          clientRef.current?.dispose();
          clientRef.current = null;
          await stopAcpSession(orphan).catch(() => {
            /* It may already be dead — do not throw again on the cleanup path. */
          });
        }
      }
    } finally {
      // A stale start's lock was already released by stop() — and possibly re-taken by the
      // replacement start, whose lock this line must not open mid-start.
      if (!stale()) startingRef.current = false;
    }
  }, [
    applyUpdate,
    askUser,
    finishTurn,
    keepDiagnostic,
    // A locale switch must reach a session started after it, not only the next remount.
    locale,
    mcpServers,
    noteModeMoved,
    push,
    resetDiagnostics,
    runtimeId,
    rememberChoices,
    setApprovedOntologyWriteTracked,
    setChoices,
    setStatusTracked,
    updateEvents,
    vaultRoot,
  ]);

  /** Ends the process and starts it again: swapping only the session splits "what is alive" across two places. */
  const switchSession = useCallback(
    async (sessionId: string | null) => {
      await stopRef.current?.();
      updateEvents(() => []);
      latestUserRequestRef.current = null;
      setApprovedOntologyWriteTracked(null);
      setError(null);
      resumeIdRef.current = sessionId;
      // A person asked for a blank conversation, so the automatic resume stops; picking a past one restores it.
      freshRequestedRef.current = sessionId === null;
      setChoices(EMPTY_CHOICES);
      await startRef.current?.();
    },
    [setApprovedOntologyWriteTracked, setChoices, updateEvents],
  );

  /** Does not change screen state first: if the adapter refuses (as claude does for models) the screen would pretend it changed. */
  const chooseModel = useCallback(async (modelId: string) => {
    const client = clientRef.current;
    const sessionId = sessionIdRef.current;
    if (!client || !sessionId) return;
    if (await client.setModel(sessionId, modelId)) {
      setChoices((prev) => ({ ...prev, currentModelId: modelId }));
      if (rememberChoices) rememberModel(vaultRoot, runtimeId, modelId);
    }
  }, [rememberChoices, runtimeId, setChoices, vaultRoot]);

  const chooseMode = useCallback(async (modeId: string) => {
    if (!modeKeepsGate(modeId)) return;
    const client = clientRef.current;
    const sessionId = sessionIdRef.current;
    if (!client || !sessionId) return;
    changingModeRef.current += 1;
    try {
      if (await client.setMode(sessionId, modeId) && clientRef.current === client && sessionIdRef.current === sessionId) {
        setChoices((prev) => ({ ...prev, currentModeId: modeId }));
      }
    } finally { changingModeRef.current -= 1; }
  }, [setChoices]);

  const sendInternal = useCallback(
    (text: string, guard?: InvestigationSendGuard): Promise<boolean> => sendTurn(text, guard, {
      runtimeId,
      vaultRoot,
      onTurnStarted,
      captureTaskBaseline,
      clientRef,
      sessionIdRef,
      activeTurnRef,
      statusRef,
      generationRef,
      disposedRef,
      changingModeRef,
      openAsksRef,
      choicesRef,
      sessionConsentRef,
      gateOffRef,
      turnReadOnlyRef,
      turnOutlivesScreenRef,
      currentTurnScopeRef,
      latestUserRequestRef,
      setActiveTurnReadOnly,
      setActiveTurnOutlivesScreen,
      setReportedPlan,
      setLastTurnUpdateAt,
      setError,
      keepDiagnostic,
      push,
      finishTurn,
      setStatusTracked,
      setApprovedOntologyWriteTracked,
    }),
    [captureTaskBaseline, finishTurn, gateOffRef, keepDiagnostic, onTurnStarted, push, runtimeId, setApprovedOntologyWriteTracked, setStatusTracked, vaultRoot],
  );
  const send = useCallback(async (text: string) => { await sendInternal(text); }, [sendInternal]);
  const sendInvestigation = useCallback((text: string, guard: InvestigationSendGuard) => sendInternal(text, guard), [sendInternal]);

  const cancel = useCallback(() => {
    if (activeTurnRef.current) activeTurnRef.current.cancelRequested = true;
    const client = clientRef.current;
    const sessionId = sessionIdRef.current;
    if (client && sessionId) void client.cancel(sessionId);
  }, []);

  /**
   * Stop that holds whether the agent cooperates: the waiting request closes, every later request
   * is refused before any standing choice, and a turn still open after the grace ends the process.
   */
  const stopTurn = useCallback(() => {
    const active = activeTurnRef.current;
    if (!active || active.stopping) return;
    active.stopping = true;
    setTurnStopping(true);
    refuseOpenAsk({ permissionDecisionTimerRef, pendingResolverRef, setPending });
    cancel();
    turnStopTimerRef.current = window.setTimeout(() => {
      turnStopTimerRef.current = null;
      if (activeTurnRef.current !== active) return;
      resumeIdRef.current = sessionIdRef.current;
      void stopRef.current?.().then(() => {
        if (!disposedRef.current) void startRef.current?.();
      });
    }, TURN_STOP_GRACE_MS);
  }, [cancel]);

  const stop = useCallback(async () => {
    finishTurn('cancelled', 'session_closed');
    // Bump first: closing mid-start would make `stop()` clean up nothing and `start()` create the process anyway.
    generationRef.current += 1;

    // Order matters: close the pending permission first, then end the process. Reversed, it tries to
    // send an answer to something already dead.
    refuseOpenAsk({ permissionDecisionTimerRef, pendingResolverRef, setPending });
    for (const approvedReceipt of approvedReceiptsRef.current.values()) {
      emitWorkReceipt({
        ...approvedReceipt.receipt,
        updatedAt: new Date().toISOString(),
        result: 'cancelled',
      });
    }
    approvedReceiptsRef.current.clear();
    setApprovedOntologyWriteTracked(null);
    // Release the lock even if it was starting — otherwise it can never start again.
    startingRef.current = false;
    clientRef.current?.dispose();
    clientRef.current = null;
    unlistenRef.current?.();
    unlistenRef.current = null;
    const acpSessionId = acpSessionRef.current;
    acpSessionRef.current = null;
    sessionIdRef.current = null;
    setReportedPlan(null);
    if (acpSessionId) await stopAcpSession(acpSessionId);
    setStatusTracked('idle');
  }, [emitWorkReceipt, finishTurn, setApprovedOntologyWriteTracked, setStatusTracked]);

  const stopIdleChain = useCallback(async () => {
    const settled = statusRef.current === 'ready' || statusRef.current === 'error';
    if (!settled || !acpSessionRef.current || activeTurnRef.current || openAsksRef.current > 0) return;
    idleStoppedSessionIdRef.current = sessionIdRef.current;
    resumeIdRef.current = sessionIdRef.current;
    await stop();
  }, [stop]);

  const idleWhilePutAway = putAway && (status === 'ready' || status === 'error') && pending === null;
  useEffect(() => {
    if (!idleWhilePutAway) return;
    const timer = window.setTimeout(() => void stopIdleChain(), PUT_AWAY_IDLE_STOP_MS);
    return () => window.clearTimeout(timer);
  }, [idleWhilePutAway, stopIdleChain]);

  // Updated in an effect: a ref write during render warns and can leave a mismatch where a render is discarded.
  useEffect(() => {
    startRef.current = start;
    autoDecideRef.current = autoDecide;
    turnReadOnlyRef.current = turnReadOnly;
    turnOutlivesScreenRef.current = turnOutlivesScreen;
    onToolSettledRef.current = onToolSettled;
    systemPromptAppendixRef.current = systemPromptAppendix;
    stopRef.current = stop;
  }, [start, stop, setStatusTracked, autoDecide, turnReadOnly, turnOutlivesScreen, onToolSettled, systemPromptAppendix]);

  useEffect(() => {
    disposedRef.current = false;
    return () => {
      disposedRef.current = true;
      void stop();
    };
  }, [stop, setStatusTracked]);

  return {
    status,
    lastTurnUpdateAt,
    events,
    activeTurnReadOnly,
    activeTurnOutlivesScreen,
    turnStopping,
    error,
    slashCommands,
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
    cancel,
    stopTurn,
    stop,
    switchSession,
  };
}
