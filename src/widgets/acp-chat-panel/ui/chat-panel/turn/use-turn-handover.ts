import { useCallback, useEffect, useRef } from 'react';

import type { TurnActivity } from '../../turn-activity';
import type { AcpChatPanelProps, AcpTurnRequest } from '../types';

interface TurnHandoverOptions {
  busy: boolean;
  /** Thinking or waiting on a person: the turn a parked panel must keep alive. */
  held: boolean;
  readOnly: boolean;
  outlives: boolean;
  stopping: boolean;
  /** The waiting request, in the card's words. */
  request: AcpTurnRequest | null;
  /** What the turn is doing now, read only while it runs and someone listens. */
  activity: () => TurnActivity | null;
  asking: boolean;
  /** The composer's own Stop, read at press time so it always sees the latest turn. */
  stop: () => void;
  onTurnWorkChange?: AcpChatPanelProps['onTurnWorkChange'];
  onTurnStopChange?: AcpChatPanelProps['onTurnStopChange'];
  onBusyChange?: AcpChatPanelProps['onBusyChange'];
}

/**
 * Hands the running turn to whoever keeps it while the panel may be parked: whether it is held and
 * read-only (the keeper), its facts and its Stop (the run's card). The composer presses that Stop too.
 */
export function useTurnHandover({
  busy, held, readOnly, outlives, stopping, request, activity, asking, stop, onTurnWorkChange, onTurnStopChange, onBusyChange,
}: TurnHandoverOptions) {
  const stopRef = useRef(stop);
  useEffect(() => {
    stopRef.current = stop;
  });
  const stopTurn = useCallback(() => stopRef.current(), []);
  useEffect(() => {
    onBusyChange?.(held, held && readOnly, held && outlives, held ? stopTurn : null);
  }, [held, readOnly, outlives, onBusyChange, stopTurn]);

  const now = onTurnWorkChange && busy ? activity() : null;
  const kind = now?.kind ?? null;
  const labelKind = now?.label?.kind ?? null;
  const labelText = now?.label?.text ?? null;
  const target = now?.target ?? null;
  const requestAction = asking ? request?.action ?? null : null;
  const requestTarget = asking ? request?.target ?? null : null;
  useEffect(() => {
    if (!onTurnWorkChange) return;
    onTurnWorkChange(kind === null ? null : {
      kind,
      label: labelKind === null ? null : { kind: labelKind, text: labelText ?? '' },
      target,
      asking,
      request: requestAction === null ? null : { action: requestAction, target: requestTarget },
      stopping,
    });
  }, [onTurnWorkChange, asking, kind, labelKind, labelText, target, requestAction, requestTarget, stopping]);
  useEffect(() => () => onTurnWorkChange?.(null), [onTurnWorkChange]);

  useEffect(() => {
    if (!onTurnStopChange) return;
    onTurnStopChange(busy ? stopTurn : null);
    return () => onTurnStopChange(null);
  }, [busy, onTurnStopChange, stopTurn]);
  return stopTurn;
}
