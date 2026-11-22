import { describe, expect, it } from 'vitest';

import { TEXT_ARRIVING_MS } from '../../turn-activity';
import {
  displayStatusOf,
  isAwaitingAnswer,
  isTextArriving,
  isTurnStillWanted,
  lastUserEventIndexOf,
  stoppedWithoutAnswer,
  turnClockPhaseOf,
  turnWorkPhaseOf,
} from './turn-state';

const row = (id: string, kind: string) => ({ id, kind }) as never;

describe('lastUserEventIndexOf', () => {
  it('finds the last message of the person, or -1', () => {
    expect(lastUserEventIndexOf([row('a', 'user'), row('b', 'agent'), row('c', 'user'), row('d', 'tool')])).toBe(2);
    expect(lastUserEventIndexOf([row('b', 'agent')])).toBe(-1);
    expect(lastUserEventIndexOf([])).toBe(-1);
  });
});

describe('displayStatusOf', () => {
  it('lets a stopped connection override, and reads idle as starting', () => {
    expect(displayStatusOf(true, 'ready')).toBe('stopped');
    expect(displayStatusOf(false, 'idle')).toBe('starting');
    expect(displayStatusOf(false, 'thinking')).toBe('thinking');
  });
});

describe('turn clock', () => {
  it('runs only while busy and says whether a card is being waited on', () => {
    expect(isAwaitingAnswer(true, true)).toBe(true);
    expect(isAwaitingAnswer(false, true)).toBe(false);
    expect(turnClockPhaseOf(false, true)).toBeNull();
    expect(turnClockPhaseOf(true, true)).toBe('awaiting');
    expect(turnClockPhaseOf(true, false)).toBe('thinking');
  });
});

describe('stoppedWithoutAnswer', () => {
  const events = [row('u1', 'user')];
  const stopped = { busy: false, events, lastUserEventIndex: 0, cancelledWaitTurnId: 'u1', hasCompletedAgentAnswer: false };

  it('is true when the stopped turn has no answer and no tool call after it', () => {
    expect(stoppedWithoutAnswer(stopped)).toBe(true);
  });

  it('is false while busy, for another turn, with an answer, or after a tool ran', () => {
    expect(stoppedWithoutAnswer({ ...stopped, busy: true })).toBe(false);
    expect(stoppedWithoutAnswer({ ...stopped, cancelledWaitTurnId: 'u0' })).toBe(false);
    expect(stoppedWithoutAnswer({ ...stopped, cancelledWaitTurnId: null })).toBe(false);
    expect(stoppedWithoutAnswer({ ...stopped, hasCompletedAgentAnswer: true })).toBe(false);
    expect(stoppedWithoutAnswer({ ...stopped, events: [row('u1', 'user'), row('t1', 'tool')] })).toBe(false);
    expect(stoppedWithoutAnswer({ ...stopped, lastUserEventIndex: -1 })).toBe(false);
  });
});

describe('isTurnStillWanted', () => {
  it('ends when the person stopped the turn or an error came', () => {
    expect(isTurnStillWanted('u1', null, null)).toBe(true);
    expect(isTurnStillWanted('u1', 'u1', null)).toBe(false);
    expect(isTurnStillWanted('u1', null, 'boom')).toBe(false);
    expect(isTurnStillWanted(null, null, null)).toBe(false);
  });
});

describe('turnWorkPhaseOf', () => {
  const base = {
    turnStillWanted: true,
    busy: true,
    hasPendingPermission: false,
    turnSilent: false,
    status: 'thinking' as const,
    watchedTurnId: 'u1',
    lastUserEventId: 'u1',
    hasCompletedAgentAnswer: false,
  };

  it('works while the agent runs, but not behind a waiting card or a silence notice', () => {
    expect(turnWorkPhaseOf(base)).toBe('working');
    expect(turnWorkPhaseOf({ ...base, hasPendingPermission: true })).toBeNull();
    expect(turnWorkPhaseOf({ ...base, turnSilent: true })).toBeNull();
    expect(turnWorkPhaseOf({ ...base, turnStillWanted: false })).toBeNull();
  });

  it('is done only for a turn this panel watched, once its answer is in', () => {
    const finished = { ...base, busy: false, status: 'ready' as const, hasCompletedAgentAnswer: true };
    expect(turnWorkPhaseOf(finished)).toBe('done');
    expect(turnWorkPhaseOf({ ...finished, watchedTurnId: 'u0' })).toBeNull();
    expect(turnWorkPhaseOf({ ...finished, hasCompletedAgentAnswer: false })).toBeNull();
    expect(turnWorkPhaseOf({ ...finished, status: 'starting' })).toBeNull();
  });
});

describe('isTextArriving', () => {
  it('holds for a short window after the last update', () => {
    expect(isTextArriving(null, 5_000)).toBe(false);
    expect(isTextArriving(1_000, null)).toBe(true);
    expect(isTextArriving(1_000, 1_000 + TEXT_ARRIVING_MS - 1)).toBe(true);
    expect(isTextArriving(1_000, 1_000 + TEXT_ARRIVING_MS)).toBe(false);
  });
});
