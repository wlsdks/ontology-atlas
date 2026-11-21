import type { Dispatch, RefObject, SetStateAction } from 'react';

import type { AcpClient, AcpPermissionRequest, AcpSessionChoices } from '../acp-client';
import { nextEventId, type AcpEvent, type AcpSessionStatus } from '../conversation/acp-events';
import { investigationPermissionVerified, type InvestigationSendGuard } from '../investigation/guard';
import type { ReportedPlan } from '../investigation/reported-plan';
import { unavailableTaskBaseline, type TaskBaselineCaptureResult } from '../task-baseline';
import type { AcpTurnCompletion, AcpTurnStart, ActiveTurn } from './acp-turn';

export interface TurnSendSession {
  runtimeId: string;
  vaultRoot: string | null;
  onTurnStarted: ((turn: AcpTurnStart) => ((turn: AcpTurnCompletion) => void | Promise<void>) | null) | undefined;
  captureTaskBaseline: ((turn: AcpTurnStart) => Promise<TaskBaselineCaptureResult>) | undefined;
  clientRef: RefObject<AcpClient | null>;
  sessionIdRef: RefObject<string | null>;
  activeTurnRef: RefObject<ActiveTurn | null>;
  statusRef: RefObject<AcpSessionStatus>;
  generationRef: RefObject<number>;
  disposedRef: RefObject<boolean>;
  changingModeRef: RefObject<number>;
  openAsksRef: RefObject<number>;
  choicesRef: RefObject<AcpSessionChoices>;
  sessionConsentRef: RefObject<boolean>;
  gateOffRef: RefObject<boolean>;
  turnReadOnlyRef: RefObject<((turn: AcpTurnStart) => boolean) | undefined>;
  turnOutlivesScreenRef: RefObject<((turn: AcpTurnStart) => boolean) | undefined>;
  currentTurnScopeRef: RefObject<{ runtimeId: string; vaultRoot: string | null }>;
  latestUserRequestRef: RefObject<string | null>;
  setActiveTurnReadOnly: Dispatch<SetStateAction<boolean>>;
  setActiveTurnOutlivesScreen: Dispatch<SetStateAction<boolean>>;
  setReportedPlan: Dispatch<SetStateAction<ReportedPlan | null>>;
  setLastTurnUpdateAt: Dispatch<SetStateAction<number | null>>;
  setError: Dispatch<SetStateAction<string | null>>;
  keepDiagnostic: (line: string) => void;
  push: (event: AcpEvent) => void;
  finishTurn: (outcome: AcpTurnCompletion['outcome'], stopReason: string | null) => void;
  setStatusTracked: (next: AcpSessionStatus) => void;
  setApprovedOntologyWriteTracked: (request: AcpPermissionRequest | null) => void;
}

/**
 * Opens a turn, captures its baseline, and prompts the agent only if nothing changed meanwhile:
 * the session, the screen's runtime and folder, and, for an investigation, its permission state.
 * False when the turn never reached the agent.
 */
export async function sendTurn(
  text: string,
  guard: InvestigationSendGuard | undefined,
  session: TurnSendSession,
): Promise<boolean> {
  const {
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
  } = session;
  const client = clientRef.current;
  const sessionId = sessionIdRef.current;
  if (!client || !sessionId || !text.trim() || activeTurnRef.current) return false;
  const permissionCurrent = () => !guard || (
    guard.runtimeId === runtimeId && changingModeRef.current === 0 && openAsksRef.current === 0
    && investigationPermissionVerified(runtimeId, choicesRef.current, sessionConsentRef.current, gateOffRef.current)
  );
  if (guard && (statusRef.current !== 'ready' || !permissionCurrent())) return false;
  const generation = generationRef.current;
  const userEventId = nextEventId();
  const start: AcpTurnStart = { runtimeId, sessionId, vaultRoot, userEventId, text, startedAt: new Date().toISOString() };
  let observer: ((turn: AcpTurnCompletion) => void | Promise<void>) | null = null;
  try { observer = onTurnStarted?.(start) ?? null; } catch (error) {
    keepDiagnostic(`analysis-capture: ${error instanceof Error ? error.message : String(error)}`);
  }
  const readOnly = turnReadOnlyRef.current?.(start) === true;
  const outlivesScreen = turnOutlivesScreenRef.current?.(start) === true;
  activeTurnRef.current = {
    start, observer, cancelRequested: false, taskBaseline: null, investigation: Boolean(guard), readOnly, outlivesScreen, stopping: false,
  };
  setActiveTurnReadOnly(readOnly);
  setActiveTurnOutlivesScreen(outlivesScreen);
  setReportedPlan(null);
  latestUserRequestRef.current = text.trim();
  push({ kind: 'user', id: userEventId, text });
  setLastTurnUpdateAt(Date.now());
  setStatusTracked('thinking');
  if (captureTaskBaseline) {
    try {
      const baseline = await captureTaskBaseline(start);
      if (activeTurnRef.current?.start === start) activeTurnRef.current.taskBaseline = baseline;
    } catch (error) {
      keepDiagnostic(`task-baseline: ${error instanceof Error ? error.message : String(error)}`);
      if (activeTurnRef.current?.start === start) {
        activeTurnRef.current.taskBaseline = unavailableTaskBaseline(
          start.startedAt, start.vaultRoot ?? '', [], ['capture_failed'],
        );
      }
    }
  }
  const active = activeTurnRef.current;
  const capturedBaseline = active?.start === start ? active.taskBaseline : null;
  const baselineInvalidated = capturedBaseline?.status === 'unavailable'
    && capturedBaseline.reasons.some((reason) => reason === 'context_changed' || reason === 'membership_changed');
  let investigationCurrent = permissionCurrent();
  if (guard && investigationCurrent) {
    try { investigationCurrent = await guard.revalidate(); } catch { investigationCurrent = false; }
    investigationCurrent = investigationCurrent && permissionCurrent();
  }
  const currentTurnScope = currentTurnScopeRef.current;
  if (generationRef.current !== generation || disposedRef.current || sessionIdRef.current !== sessionId
    || clientRef.current !== client || activeTurnRef.current?.start !== start || active?.start !== start || active.cancelRequested || baselineInvalidated || !investigationCurrent
    || currentTurnScope.runtimeId !== start.runtimeId || currentTurnScope.vaultRoot !== start.vaultRoot) {
    if (activeTurnRef.current?.start === start) {
      finishTurn('cancelled', !investigationCurrent ? 'investigation_context_changed' : baselineInvalidated
        || currentTurnScope.runtimeId !== start.runtimeId || currentTurnScope.vaultRoot !== start.vaultRoot
        ? 'capture_context_changed' : 'capture_cancelled');
      setLastTurnUpdateAt(null);
      setStatusTracked('ready');
    }
    return false;
  }
  try {
    const result = await client.prompt(sessionId, [{ type: 'text', text }]);
    if (generationRef.current !== generation) return true;
    const outcome = result.stopReason === 'cancelled' ? 'cancelled'
      : result.stopReason && result.stopReason !== 'end_turn' ? 'failed' : 'completed';
    finishTurn(outcome, result.stopReason ?? null);
    if (!disposedRef.current) {
      setApprovedOntologyWriteTracked(null);
      setLastTurnUpdateAt(null);
      setStatusTracked('ready');
    }
  } catch (err) {
    if (generationRef.current !== generation || statusRef.current === 'exited') return true;
    finishTurn('failed', null);
    setApprovedOntologyWriteTracked(null);
    setLastTurnUpdateAt(null);
    setError(err instanceof Error ? err.message : String(err));
    setStatusTracked('error');
  }
  return true;
}
