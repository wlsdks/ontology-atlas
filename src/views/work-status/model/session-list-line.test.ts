import { describe, expect, it } from 'vitest';
import { sessionListLine } from './session-list-line';

describe('sessionListLine', () => {
  it('says the read is on, with what is true now once an answer came', () => {
    expect(sessionListLine('pending')).toEqual({ kind: 'on', now: null });
    expect(sessionListLine('read')).toEqual({ kind: 'on', now: 'read' });
    expect(sessionListLine('noSession')).toEqual({ kind: 'on', now: 'noSession' });
  });

  it('keeps each reason a list could not be read apart', () => {
    for (const reason of ['notFound', 'timedOut', 'failed', 'unknownForm'] as const) {
      expect(sessionListLine(reason)).toEqual({ kind: 'unreadable', reason });
    }
  });

  it('says off only when the person switched it off, and nothing where the read never runs', () => {
    expect(sessionListLine('off')).toEqual({ kind: 'off' });
    expect(sessionListLine('unsupported')).toEqual({ kind: 'hidden' });
  });
});
