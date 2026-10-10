import { useCallback, useRef } from 'react';

import type { AcpEvent, AcpTurnCompletion, AcpTurnStart } from '@/features/acp-session';
import type { AcpWorkReceipt } from '@/shared/lib/acp-work-receipt';
import { useLatestRef } from '@/shared/lib/use-latest-ref';

import { useMeaningTransitionCapture } from '../../model/use-meaning-transition-capture';
import type { MeaningTransitionContext, OpeningRequest } from './types';

interface TurnCaptureOptions {
  runtimeId: string;
  vaultRoot: string | null;
  sessionEnabled: boolean;
  requestScopeKey?: string;
  openingRequest?: OpeningRequest | null;
  meaningTransitionContext?: MeaningTransitionContext;
  onWorkReceipt?: (receipt: AcpWorkReceipt) => void;
  onTurnStarted?: (start: AcpTurnStart) => ((completion: AcpTurnCompletion) => void | Promise<void>) | null;
  onOpeningRequestSent?: (nonce: number) => void;
  onTerminalToolObservation?: (event: Extract<AcpEvent, { kind: 'tool' }>) => void;
}

export function useTurnCapture({
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
}: TurnCaptureOptions) {
  const meaningTransitions = useMeaningTransitionCapture({ context: meaningTransitionContext, vaultRoot, runtimeId });
  const recordMeaningReceipt = meaningTransitions.recordReceipt;
  const captureWorkReceipt = useCallback((receipt: AcpWorkReceipt) => {
    recordMeaningReceipt(receipt);
    onWorkReceipt?.(receipt);
  }, [recordMeaningReceipt, onWorkReceipt]);
  const openingScopeMismatch = openingRequest?.scopeKey !== undefined && openingRequest.scopeKey !== requestScopeKey;
  const liveOpeningRequest = useLatestRef({ openingRequest, sessionEnabled, openingScopeMismatch, runtimeId, vaultRoot });
  const observedTerminalToolIdsRef = useRef(new Set<string>());
  const emitTerminalTool = useCallback((event: AcpEvent) => {
    if (event.kind !== 'tool' || !['completed', 'failed', 'cancelled'].includes(event.status)
      || observedTerminalToolIdsRef.current.has(event.id)) return;
    observedTerminalToolIdsRef.current.add(event.id);
    onTerminalToolObservation?.(event);
  }, [onTerminalToolObservation]);
  const captureTurnStart = useCallback((turn: AcpTurnStart) => {
    const completion = onTurnStarted?.(turn) ?? null;
    if (!openingScopeMismatch && openingRequest && !openingRequest.investigation && turn.text === openingRequest.text) onOpeningRequestSent?.(openingRequest.nonce);
    return async (result: AcpTurnCompletion) => {
      // The last tool and turn end can land in one React batch; drain before history is baselined.
      result.events.forEach(emitTerminalTool);
      await completion?.(result);
    };
  }, [onTurnStarted, openingRequest, openingScopeMismatch, onOpeningRequestSent, emitTerminalTool]);
  return {
    meaningTransitions,
    captureWorkReceipt,
    openingScopeMismatch,
    liveOpeningRequest,
    observedTerminalToolIdsRef,
    emitTerminalTool,
    captureTurnStart,
  };
}
