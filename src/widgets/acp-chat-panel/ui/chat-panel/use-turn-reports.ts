import { useEffect, useMemo, useRef, type RefObject } from 'react';

import {
  deriveAcpMapIntent,
  deriveAcpTurnActivity,
  deriveAcpTurnToolActivity,
  type AcpEvent,
  type AcpMapIntent,
  type AcpTurnActivity,
  type AcpTurnToolActivity,
} from '@/features/acp-session';

import { EMPTY_KNOWN_SLUGS } from './constants';
import type { SessionState } from './types';

interface TurnReportsOptions {
  status: SessionState['status'];
  events: SessionState['events'];
  pending: SessionState['pending'];
  knownSlugs?: ReadonlySet<string>;
  observedTerminalToolIdsRef: RefObject<Set<string>>;
  emitTerminalTool: (event: AcpEvent) => void;
  onTurnActivityChange?: (activity: AcpTurnActivity | null) => void;
  onTurnToolActivityChange?: (activity: AcpTurnToolActivity | null) => void;
  onMapIntent?: (intent: AcpMapIntent) => void;
}

/** Reports the live turn to the host; nothing here is drawn by the panel. */
export function useTurnReports({
  status,
  events,
  pending,
  knownSlugs,
  observedTerminalToolIdsRef,
  emitTerminalTool,
  onTurnActivityChange,
  onTurnToolActivityChange,
  onMapIntent,
}: TurnReportsOptions) {
  const turnActivity = useMemo(
    () => deriveAcpTurnActivity(status, events, pending, knownSlugs ?? EMPTY_KNOWN_SLUGS),
    [status, events, pending, knownSlugs],
  );
  const turnState = turnActivity?.state ?? null;
  const turnSummary = turnActivity?.summary ?? null;
  const turnOntologySlug = turnActivity?.ontologySlug ?? null;
  const turnToolName = turnActivity?.toolName ?? null;
  useEffect(() => {
    onTurnActivityChange?.(
      turnState
        ? {
            state: turnState,
            summary: turnSummary,
            ontologySlug: turnOntologySlug,
            toolName: turnToolName,
          }
        : null,
    );
  }, [turnState, turnSummary, turnOntologySlug, turnToolName, onTurnActivityChange]);
  useEffect(
    () => () => {
      onTurnActivityChange?.(null);
    },
    [onTurnActivityChange],
  );
  const turnToolActivity = useMemo(
    () => deriveAcpTurnToolActivity(status, events, pending),
    [status, events, pending],
  );
  const turnToolId = turnToolActivity?.id ?? null;
  const turnToolKind = turnToolActivity?.toolKind ?? null;
  const turnToolStatus = turnToolActivity?.status ?? null;
  const turnToolInput = turnToolActivity?.rawInput ?? null;
  const turnToolPendingPermission = turnToolActivity?.pendingPermission ?? false;
  useEffect(() => {
    onTurnToolActivityChange?.(
      turnToolId
        ? {
            id: turnToolId,
            toolKind: turnToolKind,
            status: turnToolStatus ?? "unknown",
            rawInput: turnToolInput,
            pendingPermission: turnToolPendingPermission,
          }
        : null,
    );
  }, [
    onTurnToolActivityChange,
    turnToolId,
    turnToolInput,
    turnToolKind,
    turnToolPendingPermission,
    turnToolStatus,
  ]);
  useEffect(
    () => () => {
      onTurnToolActivityChange?.(null);
    },
    [onTurnToolActivityChange],
  );

  useEffect(() => {
    if (events.length === 0) {
      observedTerminalToolIdsRef.current.clear();
      return;
    }
    const terminalTools = events.filter(
      (event): event is Extract<AcpEvent, { kind: 'tool' }> =>
        event.kind === 'tool' && ['completed', 'failed', 'cancelled'].includes(event.status),
    );
    if (status !== 'thinking') {
      terminalTools.forEach((event) => observedTerminalToolIdsRef.current.add(event.id));
      return;
    }
    terminalTools.forEach(emitTerminalTool);
  }, [events, emitTerminalTool, status, observedTerminalToolIdsRef]);
  const mapIntent = useMemo(
    () => deriveAcpMapIntent(events, knownSlugs ?? EMPTY_KNOWN_SLUGS),
    [events, knownSlugs],
  );
  const emittedMapIntentRef = useRef<string | null>(null);
  useEffect(() => {
    if (!mapIntent || !onMapIntent) return;
    const key = `${mapIntent.kind}:${mapIntent.toolCallId}`;
    if (emittedMapIntentRef.current === key) return;
    emittedMapIntentRef.current = key;
    onMapIntent(mapIntent);
  }, [mapIntent, onMapIntent]);
}
