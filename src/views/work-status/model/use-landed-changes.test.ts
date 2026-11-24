import { describe, expect, it } from 'vitest';
import type { WorktreeRow } from '@/shared/lib/work-status/tauri-work-status';
import { landedReadKey } from './use-landed-changes';

const row = (over: Partial<WorktreeRow>): WorktreeRow => ({
  id: 'a', path: '/r/a', branch: 'main', head: '1111', mainCheckout: true, missing: false,
  standing: 'base', ahead: 0, lastCommitAt: null, lastCommitAuthor: null, lock: null, ...over,
} as WorktreeRow);

describe('landedReadKey', () => {
  it('moves with a head or a standing, and not with a lock or an author', () => {
    const base = landedReadKey([row({})]);
    expect(landedReadKey([row({ head: '2222' })])).not.toBe(base);
    expect(landedReadKey([row({ standing: 'merged' })])).not.toBe(base);
    expect(landedReadKey([row({ lock: { lockedAt: 1 } as unknown as WorktreeRow['lock'], lastCommitAuthor: 'x' })])).toBe(base);
  });
});
