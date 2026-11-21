import { describe, expect, it } from 'vitest';

import type { HeldRequest, SeatedDetail } from '../types';
import { heldRequestStillMeant, planSubmit, seatedRequestText } from './outgoing-request';

const seated: SeatedDetail = { lead: 'Check refunds', detail: 'Look at the billing module.', full: 'Check refunds\n\nLook at the billing module.' };

describe('seatedRequestText', () => {
  it('sends the lead alone when nothing is seated', () => {
    expect(seatedRequestText('hello', null)).toBe('hello');
  });

  it('sends the whole request while the seated lead is untouched', () => {
    expect(seatedRequestText('Check refunds', seated)).toBe(seated.full);
  });

  it('keeps the seated detail behind an edited lead', () => {
    expect(seatedRequestText('Check refunds today', seated)).toBe('Check refunds today\n\nLook at the billing module.');
  });
});

describe('planSubmit', () => {
  const ready = { draft: '  hello  ', status: 'ready' as const, connecting: false, seatedDetail: null };

  it('sends a trimmed draft to a ready agent', () => {
    expect(planSubmit(ready)).toEqual({ lead: 'hello', text: 'hello', hold: false });
  });

  it('holds the request while the agent is starting', () => {
    expect(planSubmit({ ...ready, status: 'starting', connecting: true })).toEqual({ lead: 'hello', text: 'hello', hold: true });
  });

  it('does nothing for a blank draft or an agent that cannot take it', () => {
    expect(planSubmit({ ...ready, draft: '   ' })).toBeNull();
    expect(planSubmit({ ...ready, status: 'thinking' })).toBeNull();
    expect(planSubmit({ ...ready, status: 'starting', connecting: false })).toBeNull();
  });

  it('sends the seated request as a whole', () => {
    expect(planSubmit({ ...ready, draft: 'Check refunds', seatedDetail: seated })?.text).toBe(seated.full);
  });
});

describe('heldRequestStillMeant', () => {
  const held: HeldRequest = { text: 't', lead: 'l', seatedDetail: null, runtimeId: 'claude', vaultRoot: '/vault' };
  const now = { runtimeId: 'claude', vaultRoot: '/vault', connectStopped: false, status: 'starting' as const };

  it('stays meant for the same agent and folder while it is on its way', () => {
    expect(heldRequestStillMeant(held, now)).toBe(true);
    expect(heldRequestStillMeant(held, { ...now, status: 'ready' })).toBe(true);
    expect(heldRequestStillMeant(held, { ...now, status: 'idle' })).toBe(true);
  });

  it('is dropped for another agent or folder, a stopped connection, or a settled state', () => {
    expect(heldRequestStillMeant(null, now)).toBe(false);
    expect(heldRequestStillMeant(held, { ...now, runtimeId: 'codex' })).toBe(false);
    expect(heldRequestStillMeant(held, { ...now, vaultRoot: '/other' })).toBe(false);
    expect(heldRequestStillMeant(held, { ...now, connectStopped: true })).toBe(false);
    expect(heldRequestStillMeant(held, { ...now, status: 'thinking' })).toBe(false);
    expect(heldRequestStillMeant(held, { ...now, status: 'error' as never })).toBe(false);
  });
});
