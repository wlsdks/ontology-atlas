import { describe, expect, it } from 'vitest';

import type { AcpSessionSummary } from './session-summaries';
import { latestSession, orderSessionsByRecency } from './session-recency';

function session(
  sessionId: string,
  updatedAt: string | null,
): AcpSessionSummary {
  return { sessionId, cwd: '/vault', title: sessionId, updatedAt };
}

describe('which past conversation is the latest one', () => {
  it('puts the newest stamp first, whatever order the adapter kept', () => {
    const ordered = orderSessionsByRecency([
      session('older', '2026-09-01T10:00:00.000Z'),
      session('newest', '2026-09-07T22:15:00.000Z'),
      session('middle', '2026-09-04T08:00:00.000Z'),
    ]);
    expect(ordered.map((row) => row.sessionId)).toEqual(['newest', 'middle', 'older']);
    expect(latestSession(ordered)?.sessionId).toBe('newest');
  });

  it('keeps undated rows in the adapter order and below the dated ones', () => {
    const ordered = orderSessionsByRecency([
      session('undated-first', null),
      session('dated', '2026-09-02T00:00:00.000Z'),
      session('undated-second', null),
    ]);
    expect(ordered.map((row) => row.sessionId)).toEqual([
      'dated',
      'undated-first',
      'undated-second',
    ]);
  });

  it('treats an unreadable stamp as no stamp rather than as the epoch', () => {
    const ordered = orderSessionsByRecency([
      session('broken', 'yesterday afternoon'),
      session('dated', '2026-09-02T00:00:00.000Z'),
    ]);
    expect(ordered.map((row) => row.sessionId)).toEqual(['dated', 'broken']);
  });

  it('resumes the adapter first row when no conversation carries a time at all', () => {
    expect(latestSession([session('a', null), session('b', null)])?.sessionId).toBe('a');
  });

  it('has nothing to resume in a folder with no past conversation', () => {
    expect(latestSession([])).toBeNull();
  });
});
