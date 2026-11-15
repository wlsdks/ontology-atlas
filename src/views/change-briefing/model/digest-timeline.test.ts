import { describe, expect, it } from 'vitest';
import { briefingRange } from './briefing-model';
import type { DigestChange } from './change-digest';
import { dayTicks, timelineColumns, timelineUnit } from './digest-timeline';

let sequence = 0;
function at(localTime: string): DigestChange {
  sequence += 1;
  return { commit: { hash: String(sequence).padStart(40, '0'), subject: `fix: change ${sequence}`, committedAt: new Date(localTime).toISOString(), paths: [] }, number: null, files: 0, concepts: [], type: 'fix' };
}

describe('timeline unit', () => {
  it.each([
    ['day', '2026-11-13', '', '', 'minute'],
    ['custom', '2026-11-13', '2026-11-13', '2026-11-13', 'minute'],
    ['week', '2026-11-13', '', '', 'day'],
    ['month', '2026-11-13', '', '', 'day'],
    ['custom', '2026-11-13', '2026-09-01', '2026-11-01', 'day'],
    ['custom', '2026-11-13', '2026-09-01', '2026-11-02', 'week'],
    ['year', '2026-11-13', '', '', 'week'],
  ] as const)('draws a %s period anchored on %s from %j to %j by %s', (period, anchor, from, to, unit) => {
    expect(timelineUnit(period, briefingRange(period, anchor, from, to)!)).toBe(unit);
  });
});

describe('ticks of a day', () => {
  it('puts each change at its local minute and stacks changes of the same minute oldest first', () => {
    const first = at('2026-11-13T09:15:10');
    const second = at('2026-11-13T09:15:40');
    const later = at('2026-11-13T17:00:00');
    const ticks = dayTicks([later, second, first]);
    expect(ticks.map(tick => [tick.change, tick.minute, tick.stack, tick.sameMinute])).toEqual([
      [first, 555, 0, 2], [second, 555, 1, 2], [later, 1020, 0, 1],
    ]);
  });

  it('stacks ticks inside one drawn slot and keeps the last slot inside the day', () => {
    const ticks = dayTicks([at('2026-11-13T09:01:00'), at('2026-11-13T09:04:00'), at('2026-11-13T09:07:00'), at('2026-11-13T23:59:00')], 6);
    expect(ticks.map(tick => [tick.slot, tick.stack, tick.sameMinute])).toEqual([[540, 0, 1], [540, 1, 1], [546, 0, 1], [1434, 0, 1]]);
  });

  it('draws no tick for a change without a readable time', () => {
    const unreadable = at('2026-11-13T09:00:00');
    unreadable.commit.committedAt = 'not a time';
    expect(dayTicks([unreadable])).toEqual([]);
  });
});

describe('columns of a longer period', () => {
  it('draws one column per day of a week, newest change first, with empty days kept', () => {
    const range = briefingRange('week', '2026-11-13')!;
    const monday = at('2026-11-09T10:00:00');
    const fridayEarly = at('2026-11-13T08:00:00');
    const fridayLate = at('2026-11-13T20:00:00');
    const columns = timelineColumns([monday, fridayEarly, fridayLate], range, 'day');
    expect(columns.map(column => column.start)).toEqual(['2026-11-09', '2026-11-10', '2026-11-11', '2026-11-12', '2026-11-13', '2026-11-14', '2026-11-15']);
    expect(columns.map(column => column.changes.length)).toEqual([1, 0, 0, 0, 2, 0, 0]);
    expect(columns[4].changes).toEqual([fridayLate, fridayEarly]);
  });

  it('draws a year as weeks starting Monday, clipped to the year, that add up to every change', () => {
    const range = briefingRange('year', '2026-06-01')!;
    const changes = [at('2026-01-01T12:00:00'), at('2026-01-05T12:00:00'), at('2026-12-31T12:00:00')];
    const columns = timelineColumns(changes, range, 'week');
    expect(columns[0]).toMatchObject({ start: '2026-01-01', end: '2026-01-04' });
    expect(columns[1]).toMatchObject({ start: '2026-01-05', end: '2026-01-11' });
    expect(columns.at(-1)).toMatchObject({ start: '2026-12-28', end: '2026-12-31' });
    expect(columns).toHaveLength(53);
    expect(columns.reduce((sum, column) => sum + column.changes.length, 0)).toBe(changes.length);
  });
});
