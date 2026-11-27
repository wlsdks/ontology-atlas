import { describe, expect, it } from 'vitest';
import type { WorktreeRow } from '@/shared/lib/work-status/tauri-work-status';
import { dayStartEpochS, mergedCountKey } from './use-merged-today';

const row = (over: Partial<WorktreeRow>): WorktreeRow => ({
  id: 'a', path: '/r/a', branch: 'main', head: '1111', mainCheckout: true, missing: false,
  standing: 'base', ahead: 0, lastCommitAt: null, lastCommitAuthor: null, lock: null, ...over,
} as WorktreeRow);

describe('mergedCountKey', () => {
  it('moves with a head or a standing, and not with a lock or an author', () => {
    const base = mergedCountKey([row({})]);
    expect(mergedCountKey([row({ head: '2222' })])).not.toBe(base);
    expect(mergedCountKey([row({ standing: 'merged' })])).not.toBe(base);
    expect(mergedCountKey([row({ lock: { lockedAt: 1 } as unknown as WorktreeRow['lock'], lastCommitAuthor: 'x' })])).toBe(base);
  });
});

describe('dayStartEpochS', () => {
  it('is the same through one local day and moves at its midnight', () => {
    const morning = new Date(2026, 10, 27, 0, 0, 1).getTime();
    const night = new Date(2026, 10, 27, 23, 59, 59).getTime();
    const next = new Date(2026, 10, 28, 0, 0, 0).getTime();
    expect(dayStartEpochS(morning)).toBe(dayStartEpochS(night));
    expect(dayStartEpochS(next)).toBe(next / 1000);
    expect(dayStartEpochS(night)).toBe(next / 1000 - 86_400);
  });
});
