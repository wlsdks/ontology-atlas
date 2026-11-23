import type { Dispatch, RefObject, SetStateAction } from 'react';

import type { AcpWorkDecision, AcpWorkReceipt } from '@/shared/lib/meaning-transition/acp-work-receipt';

import type { AcpSessionChoices } from '../session-choices/acp-session-choices';
import type { AcpPermissionRequest } from './permission-request';
import { nextEventId, type AcpEvent, type AcpSessionStatus } from '../conversation/acp-events';
import { hasVaultMcpServer, VAULT_MCP_SERVER_NAME } from '../runtime-wiring/vault-mcp-server';
import { modeCopyKey } from '../session-choices/mode-copy';
import type { TaskBaselineCaptureResult } from '../task-baseline';
import type { AcpTurnStart, ActiveTurn } from '../turns/acp-turn';
import { workReceipt } from '../work-receipts/work-receipt';
import { standingApproval } from './standing-approval';

export interface PendingPermission {
  request: AcpPermissionRequest;
  origin?: {
    sessionGeneration: number;
    turn: Pick<AcpTurnStart, 'sessionId' | 'vaultRoot' | 'userEventId' | 'text'> | null;
    task: { outcome: string; nonGoals: null; structure: 'unstructured' } | null;
    taskBaseline: TaskBaselineCaptureResult | null;
  };
  /** Passes the user's choice back to the agent. `null` is a rejection. */
  resolve: (optionId: string | null) => void;
}

/** A note allows without a card, `{ reject }` refuses, null asks the person. */
export type AcpAutoDecision = string | { reject: string } | null;

export function isPromise<Value>(value: Value | Promise<Value>): value is Promise<Value> {
  return typeof (value as Promise<Value> | null)?.then === 'function';
}

function deepFreeze<Value>(value: Value): Value {
  if (value && typeof value === 'object') {
    for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}

/** Capture a queued permission before another request can delay its presentation. */
export function snapshotPermissionRequest(request: AcpPermissionRequest): AcpPermissionRequest {
  return deepFreeze(structuredClone(request));
}

export interface PermissionAskSession {
  runtimeId: string;
  vaultRoot: string | null;
  mcpServers: unknown[] | undefined;
  approvalSettleMs: number;
  generationRef: RefObject<number>;
  statusRef: RefObject<AcpSessionStatus>;
  activeTurnRef: RefObject<ActiveTurn | null>;
  sessionIdRef: RefObject<string | null>;
  latestUserRequestRef: RefObject<string | null>;
  choicesRef: RefObject<AcpSessionChoices>;
  autoDecideRef: RefObject<((request: AcpPermissionRequest) => AcpAutoDecision | Promise<AcpAutoDecision>) | undefined>;
  approvedReceiptsRef: RefObject<Map<string, { toolCallId: string | null; receipt: AcpWorkReceipt }>>;
  pendingResolverRef: RefObject<((optionId: string | null) => void) | null>;
  permissionDecisionTimerRef: RefObject<number | null>;
  openAsksRef: RefObject<number>;
  askChainRef: RefObject<Promise<unknown>>;
  setPending: Dispatch<SetStateAction<PendingPermission | null>>;
  autoApproveNow: () => boolean;
  emitWorkReceipt: (receipt: AcpWorkReceipt) => void;
  push: (event: AcpEvent) => void;
  setApprovedOntologyWriteTracked: (request: AcpPermissionRequest | null) => void;
}

/** Creates the promise that waits until the screen answers. Concurrent asks queue up. */
export function askPermission(request: AcpPermissionRequest, session: PermissionAskSession): Promise<string | null> {
  const {
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
  } = session;
  request = snapshotPermissionRequest(request);
  const generation = generationRef.current;
  // A request that arrived before the person turned auto-approve on still shows its card.
  const autoApproveAtArrival = autoApproveNow() && activeTurnRef.current?.investigation !== true;
  const readOnlyTurn = activeTurnRef.current?.readOnly === true;
  const arrivalTurn = activeTurnRef.current;
  const activeStart = arrivalTurn?.start ?? null;
  const origin = {
    sessionGeneration: generation,
    turn: activeStart
      ? { sessionId: activeStart.sessionId, vaultRoot: activeStart.vaultRoot, userEventId: activeStart.userEventId, text: activeStart.text }
      : null,
    task: activeStart
      ? { outcome: activeStart.text, nonGoals: null, structure: 'unstructured' as const }
      : null,
    taskBaseline: activeTurnRef.current?.taskBaseline ?? null,
  };
  const recordOntologyWrite = (decision: AcpWorkDecision, approvedByStandingChoice: boolean) => {
    const receipt = workReceipt({
      request,
      sessionId: sessionIdRef.current,
      runtimeId,
      userRequest: latestUserRequestRef.current,
      origin,
      decision,
      result: decision === 'allowed' ? 'pending' : 'not-run',
      at: new Date().toISOString(),
      approvedByStandingChoice,
    });
    emitWorkReceipt(receipt);
    if (decision === 'allowed') {
      approvedReceiptsRef.current.set(receipt.id, { toolCallId: request.toolCallId, receipt });
    }
  };
  // A question that waited in the queue may outlive its session or its turn, and one after Stop is
  // refused: answered-by-nobody beats presenting a card, or applying a standing choice, for a
  // conversation that is stopping or dead or a turn that has ended.
  const closed = () => generationRef.current !== generation || statusRef.current === 'exited'
    || activeTurnRef.current?.stopping === true || activeTurnRef.current?.cancelRequested === true
    || (arrivalTurn !== null && activeTurnRef.current !== arrivalTurn);
  const present = async (): Promise<string | null> => {
    if (closed()) return null;
    if (request.reviewKind === 'ontology-write' && (
      !origin.turn
      || request.requestId == null
      || request.sessionId !== origin.turn.sessionId
      || origin.turn.vaultRoot !== vaultRoot
    )) {
      return null;
    }
    // Only the turn the request arrived in may carry a standing choice, and only while it lasts.
    let decided: AcpAutoDecision = null;
    if (origin.turn) {
      try {
        const decision = autoDecideRef.current?.(request) ?? null;
        decided = isPromise(decision) ? await decision : decision;
      } catch {
        decided = null;
      }
    }
    if (closed()) return null;
    return presentDecided(decided);
  };
  const presentDecided = (decided: AcpAutoDecision) => new Promise<string | null>((resolve) => {
    if (decided !== null && typeof decided === 'object') {
      push({ kind: 'notice', id: nextEventId(), text: 'auto-refused', detail: decided.reject });
      resolve(null);
      return;
    }
    const note = request.reviewKind === 'permission' && origin.turn && !readOnlyTurn ? decided : null;
    const allow = note !== null ? request.options.find((option) => option.kind === 'allow_once') : undefined;
    if (note !== null && allow) {
      push({ kind: 'notice', id: nextEventId(), text: 'auto-allowed', detail: note });
      resolve(allow.optionId);
      return;
    }
    // A turn the person sent, or a request of a run they started in this launch, carries their standing choice; any other asks.
    const standing = decided === null && origin.turn && !readOnlyTurn
      ? standingApproval(request, {
          // The picker reads the plan mode there, so the app does not answer behind it.
          enabled: autoApproveAtArrival && autoApproveNow() && modeCopyKey(choicesRef.current.currentModeId) !== 'plan',
          vaultRoot,
          vaultMcpServerName: hasVaultMcpServer(mcpServers) ? VAULT_MCP_SERVER_NAME : null,
        })
      : null;
    if (standing) {
      push({ kind: 'notice', id: nextEventId(), text: 'auto-approved', detail: standing.target });
      if (request.reviewKind === 'ontology-write') {
        recordOntologyWrite('allowed', true);
        setApprovedOntologyWriteTracked(request);
      }
      resolve(standing.optionId);
      return;
    }
    pendingResolverRef.current = resolve;
    setPending({
      request,
      origin,
      resolve: (optionId) => {
        const selectedKind = request.options.find((option) => option.optionId === optionId)?.kind;
        const ontologyWrite = request.reviewKind === 'ontology-write' && Boolean(request.toolName);
        if (ontologyWrite) recordOntologyWrite(selectedKind === 'allow_once' ? 'allowed' : 'rejected', false);
        const settlesBeforeWrite =
          request.reviewKind === 'ontology-write' &&
          selectedKind === 'allow_once' &&
          approvalSettleMs > 0;
        setApprovedOntologyWriteTracked(
          request.reviewKind === 'ontology-write' && selectedKind === 'allow_once'
            ? request
            : null,
        );
        setPending(null);
        if (settlesBeforeWrite) {
          permissionDecisionTimerRef.current = window.setTimeout(() => {
            permissionDecisionTimerRef.current = null;
            pendingResolverRef.current = null;
            resolve(optionId);
          }, approvalSettleMs);
          return;
        }
        pendingResolverRef.current = null;
        resolve(optionId);
      },
    });
  });
  openAsksRef.current += 1;
  const result = askChainRef.current.then(present, present).finally(() => {
    openAsksRef.current -= 1;
  });
  askChainRef.current = result.catch(() => null);
  return result;
}
