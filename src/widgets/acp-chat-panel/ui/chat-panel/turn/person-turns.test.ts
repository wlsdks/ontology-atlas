import { describe, expect, it } from 'vitest';

import { offersNextSteps, startedPersonTurnId } from './person-turns';

describe('startedPersonTurnId', () => {
  it('marks the first new user message after a send as the person\'s turn', () => {
    expect(startedPersonTurnId({ after: 'u1' }, 'u2')).toBe('u2');
    expect(startedPersonTurnId({ after: null }, 'u1')).toBe('u1');
  });

  it('waits while no new message has appeared, and ignores messages nobody sent', () => {
    expect(startedPersonTurnId({ after: 'u1' }, 'u1')).toBeNull();
    expect(startedPersonTurnId({ after: 'u1' }, null)).toBeNull();
    expect(startedPersonTurnId(null, 'u2')).toBeNull();
  });
});

describe('offersNextSteps', () => {
  const turns = new Set(['u2']);

  it('offers them only for a person-started turn that was not stopped', () => {
    expect(offersNextSteps({ latestUserEventId: 'u2', personTurnIds: turns, cancelledWaitTurnId: null })).toBe(true);
    expect(offersNextSteps({ latestUserEventId: 'u1', personTurnIds: turns, cancelledWaitTurnId: null })).toBe(false);
    expect(offersNextSteps({ latestUserEventId: 'u2', personTurnIds: turns, cancelledWaitTurnId: 'u2' })).toBe(false);
    expect(offersNextSteps({ latestUserEventId: null, personTurnIds: turns, cancelledWaitTurnId: null })).toBe(false);
  });
});
