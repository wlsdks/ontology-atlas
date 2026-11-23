import { describe, expect, it } from 'vitest';
import type { ChangeBriefing } from '@/shared/lib/git/tauri-change-briefing';
import { briefingStatus, needsSourceChoice } from './briefing-status';

const read = (status: ChangeBriefing['status'], commits = 0) => ({ root: '/repo', hasRange: true, error: false, loading: false, data: { status, commits: Array.from({ length: commits }) } as unknown as ChangeBriefing });

describe('briefingStatus', () => {
  it.each([
    ['no-source', 'noSource'],
    ['ungranted', 'sourceUngranted'],
    ['unreadable', 'sourceUnavailable'],
    ['no-history', 'noHistory'],
    ['stale', 'stale'],
  ] as const)('names a %s read by its own cause', (status, expected) => {
    expect(briefingStatus(read(status))).toBe(expected);
  });

  it('shows commits, and calls a measured period without any empty', () => {
    expect(briefingStatus(read('measured', 2))).toBeNull();
    expect(briefingStatus(read('measured'))).toBe('empty');
    expect(briefingStatus(read('partial'))).toBeNull();
  });

  it('offers the folder choice only for a missing, ungranted or unreadable code folder', () => {
    expect(needsSourceChoice('noSource')).toBe(true);
    expect(needsSourceChoice('sourceUngranted')).toBe(true);
    expect(needsSourceChoice('noHistory')).toBe(false);
  });
});
