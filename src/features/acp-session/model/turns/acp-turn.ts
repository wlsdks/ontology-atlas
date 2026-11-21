import type { AcpEvent } from '../conversation/acp-events';
import type { TaskBaselineCaptureResult } from '../task-baseline';

export interface AcpTurnStart {
  runtimeId: string;
  sessionId: string;
  vaultRoot: string | null;
  userEventId: string;
  text: string;
  startedAt: string;
}

export interface AcpTurnCompletion extends AcpTurnStart {
  endedAt: string;
  outcome: 'completed' | 'cancelled' | 'failed';
  stopReason: string | null;
  events: readonly AcpEvent[];
}

export interface ActiveTurn {
  start: AcpTurnStart;
  observer: ((turn: AcpTurnCompletion) => void | Promise<void>) | null;
  cancelRequested: boolean;
  taskBaseline: TaskBaselineCaptureResult | null;
  /** A source-bound investigation the app composed; it asks for no edits, so every write shows its card. */
  investigation: boolean;
  readOnly: boolean;
  outlivesScreen: boolean;
  /** Stop was pressed: every later request of the turn is refused and nothing answers for it. */
  stopping: boolean;
}

/**
 * Copies of the events from the turn's own user row to the end; none once that row is gone.
 * O(current-turn events), with one preallocated snapshot array.
 */
export function turnEventsSnapshot(currentEvents: readonly AcpEvent[], userEventId: string): AcpEvent[] {
  const index = currentEvents.findIndex((event) => event.kind === 'user' && event.id === userEventId);
  const turnEvents = new Array<AcpEvent>(index < 0 ? 0 : currentEvents.length - index);
  for (let offset = 0; offset < turnEvents.length; offset += 1) {
    turnEvents[offset] = { ...currentEvents[index + offset] };
  }
  return turnEvents;
}
