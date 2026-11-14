import { describe, expect, it, vi } from 'vitest';
import type { ChangeBriefing } from '@/shared/lib/git/tauri-change-briefing';
import { briefingRange } from './briefing-model';
import { findLatestChangeDay } from './latest-change-day';

const history = (status: ChangeBriefing['status'], committedAt: string[]): ChangeBriefing => ({
  status, sourceRoot: '/repo', snapshot: 's', head: 'h', base: null, tip: null, netPaths: null, limit: 2000, partialReasons: [],
  commits: committedAt.map((at, index) => ({ hash: String(index), subject: 'fix(map): a', committedAt: at, paths: [] })),
});

describe('latest day with changes', () => {
  it('widens the window from today until a read holds a change', async () => {
    const read = vi.fn()
      .mockResolvedValueOnce(history('measured', []))
      .mockResolvedValueOnce(history('measured', ['2026-10-30T10:00:00', '2026-11-02T10:00:00']));
    expect(await findLatestChangeDay(read, '2026-11-14')).toBe('2026-11-02');
    expect(read).toHaveBeenCalledTimes(2);
    expect(read.mock.calls[0]).toEqual([briefingRange('day', '2026-11-08')!.startEpoch, briefingRange('day', '2026-11-14')!.endEpoch]);
  });

  it('reads the whole history last and answers null when it holds nothing', async () => {
    const read = vi.fn().mockResolvedValue(history('measured', []));
    expect(await findLatestChangeDay(read, '2026-11-14')).toBeNull();
    expect(read).toHaveBeenCalledTimes(4);
    expect(read.mock.calls[3][0]).toBe(0);
  });

  it('stops at an unreadable repository instead of reading wider', async () => {
    const read = vi.fn().mockResolvedValue(history('unreadable', []));
    expect(await findLatestChangeDay(read, '2026-11-14')).toBeNull();
    expect(read).toHaveBeenCalledTimes(1);
  });
});
