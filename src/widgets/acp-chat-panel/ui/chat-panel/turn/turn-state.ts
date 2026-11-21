import { TEXT_ARRIVING_MS } from '../../turn-activity';
import type { FooterStatus, SessionState } from '../chat-panel-props';

type Status = SessionState['status'];
type EventRow = Pick<SessionState['events'][number], 'id' | 'kind'>;

/** The index of the person's last message, or -1. */
export function lastUserEventIndexOf(events: readonly EventRow[]): number {
  for (let index = events.length - 1; index >= 0; index -= 1) {
    if (events[index].kind === 'user') return index;
  }
  return -1;
}

/** `idle` reads as still starting; a stopped connection overrides everything. */
export function displayStatusOf(connectStopped: boolean, status: Status): Exclude<FooterStatus, 'awaiting'> {
  return connectStopped ? 'stopped' : status === 'idle' ? 'starting' : status;
}

/** The turn is running and waiting on a permission answer. */
export function isAwaitingAnswer(busy: boolean, hasPendingPermission: boolean): boolean {
  return busy && hasPendingPermission;
}

export function turnClockPhaseOf(busy: boolean, awaitingAnswer: boolean): 'awaiting' | 'thinking' | null {
  return !busy ? null : awaitingAnswer ? 'awaiting' : 'thinking';
}

/**
 * The person pressed Stop on the turn and nothing came back: no finished answer and no tool call
 * after their message.
 */
export function stoppedWithoutAnswer({
  busy,
  events,
  lastUserEventIndex,
  cancelledWaitTurnId,
  hasCompletedAgentAnswer,
}: {
  busy: boolean;
  events: readonly EventRow[];
  lastUserEventIndex: number;
  cancelledWaitTurnId: string | null;
  hasCompletedAgentAnswer: boolean;
}): boolean {
  return (
    !busy
    && lastUserEventIndex >= 0
    && cancelledWaitTurnId !== null
    && events[lastUserEventIndex]?.id === cancelledWaitTurnId
    && !hasCompletedAgentAnswer
    && !events.some((event, index) => index > lastUserEventIndex && event.kind === 'tool')
  );
}

/** A turn is still wanted until the person stopped it or an error ended the session. */
export function isTurnStillWanted(
  lastUserEventId: string | null,
  cancelledWaitTurnId: string | null,
  error: string | null,
): boolean {
  return lastUserEventId !== null && lastUserEventId !== cancelledWaitTurnId && error === null;
}

/**
 * Whether the work stage shows: `working` while the agent runs with no card waiting and no silence
 * notice, `done` once a finished turn this panel watched has its answer.
 */
export function turnWorkPhaseOf({
  turnStillWanted,
  busy,
  hasPendingPermission,
  turnSilent,
  status,
  watchedTurnId,
  lastUserEventId,
  hasCompletedAgentAnswer,
}: {
  turnStillWanted: boolean;
  busy: boolean;
  hasPendingPermission: boolean;
  turnSilent: boolean;
  status: Status;
  watchedTurnId: string | null;
  lastUserEventId: string | null;
  hasCompletedAgentAnswer: boolean;
}): 'working' | 'done' | null {
  return !turnStillWanted
    ? null
    : busy
      ? !hasPendingPermission && !turnSilent ? 'working' : null
      : status === 'ready' && watchedTurnId === lastUserEventId && hasCompletedAgentAnswer ? 'done' : null;
}

/** Text arrived within the last moments, or no clock is running to say otherwise. */
export function isTextArriving(lastTurnUpdateAt: number | null, turnNowMs: number | null): boolean {
  return lastTurnUpdateAt !== null && (turnNowMs === null || turnNowMs - lastTurnUpdateAt < TEXT_ARRIVING_MS);
}
