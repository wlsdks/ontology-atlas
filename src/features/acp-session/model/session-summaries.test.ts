import { describe, expect, it } from 'vitest';

import { readSessionSummaries } from './session-summaries';

describe('reading the conversations of one folder from session/list', () => {
  it('keeps this folder only, whatever the adapter sent, and tolerates a trailing slash', () => {
    const result = {
      sessions: [
        { sessionId: 'a', cwd: '/vault/', title: 'First', updatedAt: '2026-01-01T00:00:00Z' },
        { sessionId: 'b', cwd: '/other', title: 'Elsewhere', updatedAt: null },
      ],
    };
    expect(readSessionSummaries(result, '/vault')).toEqual([
      { sessionId: 'a', cwd: '/vault/', title: 'First', updatedAt: '2026-01-01T00:00:00Z' },
    ]);
  });

  it('drops a row with no id or no folder instead of guessing it belongs here', () => {
    const result = { sessions: [{ cwd: '/vault' }, { sessionId: 'x' }, { sessionId: 'y', cwd: '/vault' }] };
    expect(readSessionSummaries(result, '/vault').map((session) => session.sessionId)).toEqual(['y']);
  });

  it('reads a blank title and a missing time as unknown', () => {
    const [session] = readSessionSummaries({ sessions: [{ sessionId: 'a', cwd: '/vault', title: '  ' }] }, '/vault');
    expect(session).toMatchObject({ title: null, updatedAt: null });
  });

  it('lists nothing when the result has no sessions or the folder is empty', () => {
    expect(readSessionSummaries({}, '/vault')).toEqual([]);
    expect(readSessionSummaries({ sessions: [{ sessionId: 'a', cwd: '/vault' }] }, '  ')).toEqual([]);
  });
});
