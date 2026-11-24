import { describe, expect, it } from 'vitest';
import type { LandedChange } from '@/shared/lib/work-status/tauri-work-status';
import { landedDays, landedWithin, readSubject } from './landed-change';

const change = (subject: string, at: Date | null): LandedChange => ({
  hash: subject.padEnd(40, '0').slice(0, 40), subject, at: at ? Math.floor(at.getTime() / 1000) : null, merge: true, files: 1, insertions: 1, deletions: 0,
});

describe('a landed subject', () => {
  it.each([
    ['feat(map): draw the selection ring (#12)', { kind: 'feat', scope: 'map', title: 'draw the selection ring', pullRequest: 12 }],
    ['fix: keep it apart', { kind: 'fix', scope: null, title: 'keep it apart', pullRequest: null }],
    ['style(ui)!: tighten the grid (#7)', { kind: 'design', scope: 'ui', title: 'tighten the grid', pullRequest: 7 }],
    ['Merge #3856: feat(work-status): show which session waits', { kind: 'feat', scope: 'work-status', title: 'show which session waits', pullRequest: 3856 }],
    ['Merge pull request #4 from someone/branch', { kind: null, scope: null, title: 'Merge pull request #4 from someone/branch', pullRequest: 4 }],
    ['Update README.md', { kind: null, scope: null, title: 'Update README.md', pullRequest: null }],
    ['wip: half done', { kind: null, scope: null, title: 'wip: half done', pullRequest: null }],
  ])('reads %s', (subject, expected) => {
    expect(readSubject(subject)).toEqual(expected);
  });
});

describe('landed days', () => {
  const now = new Date(2026, 10, 24, 9, 0).getTime();

  it('groups newest first by the reader’s calendar day and counts back from today', () => {
    const days = landedDays([
      change('a', new Date(2026, 10, 24, 8, 0)),
      change('b', new Date(2026, 10, 24, 0, 5)),
      change('c', new Date(2026, 10, 23, 23, 50)),
      change('d', new Date(2026, 10, 20, 12, 0)),
    ], now);
    expect(days.map(day => [day.daysAgo, day.changes.map(c => c.subject).join('')])).toEqual([[0, 'ab'], [1, 'c'], [4, 'd']]);
  });

  it('puts a change without a time on the day above it', () => {
    const days = landedDays([change('a', new Date(2026, 10, 24, 8, 0)), change('b', null)], now);
    expect(days).toHaveLength(1);
    expect(days[0]!.changes).toHaveLength(2);
  });

  it('counts the changes within the last days, today included', () => {
    const changes = [change('a', new Date(2026, 10, 24, 1, 0)), change('b', new Date(2026, 10, 18, 1, 0)), change('c', new Date(2026, 10, 17, 1, 0))];
    expect(landedWithin(changes, now, 1)).toBe(1);
    expect(landedWithin(changes, now, 7)).toBe(2);
  });
});
