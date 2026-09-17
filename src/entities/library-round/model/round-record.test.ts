import { describe, expect, it } from 'vitest';

import {
  type RoundRecord,
  cadenceFromKey,
  cadenceKey,
  isRoundDue,
  isValidClockTime,
  nextDueAt,
  parseRoundState,
  roundProblems,
  serializeRoundState,
} from './round-record';

/** Local-time constructor so the expectations read like the wall clock the spec talks about. */
const local = (y: number, m: number, d: number, h = 0, min = 0) => new Date(y, m - 1, d, h, min, 0, 0);

function round(overrides: Partial<RoundRecord> = {}): RoundRecord {
  return {
    id: 'r1',
    name: 'Pages still match',
    kind: 'consistency',
    cadence: { every: 'hour' },
    enabled: true,
    onStale: 'redraft',
    createdAt: '2026-09-17T00:00:00.000Z',
    nextDueAt: '2026-09-17T01:00:00.000Z',
    ...overrides,
  };
}

describe('cadence', () => {
  it('an hourly round runs on the hour, strictly after the moment it is asked from', () => {
    expect(nextDueAt({ every: 'hour' }, local(2026, 9, 17, 9, 2))).toEqual(local(2026, 9, 17, 10, 0));
    // Exactly on the hour: the *next* hour, so a pass that ran at 10:00 does not run again at 10:00.
    expect(nextDueAt({ every: 'hour' }, local(2026, 9, 17, 10, 0))).toEqual(local(2026, 9, 17, 11, 0));
  });

  it('a six-hourly round lines up on 00, 06, 12, 18 so two such rounds share a grid', () => {
    expect(nextDueAt({ every: '6h' }, local(2026, 9, 17, 9, 2))).toEqual(local(2026, 9, 17, 12, 0));
    expect(nextDueAt({ every: '6h' }, local(2026, 9, 17, 23, 30))).toEqual(local(2026, 9, 18, 0, 0));
  });

  it('a daily round is the wall-clock time, today if still ahead, otherwise tomorrow', () => {
    expect(nextDueAt({ daily: '09:00', weekdaysOnly: false }, local(2026, 9, 17, 8, 59))).toEqual(local(2026, 9, 17, 9, 0));
    expect(nextDueAt({ daily: '09:00', weekdaysOnly: false }, local(2026, 9, 17, 9, 0))).toEqual(local(2026, 9, 18, 9, 0));
  });

  it('a weekday round skips Saturday and Sunday', () => {
    // 2026-09-18 is a Friday.
    expect(nextDueAt({ daily: '09:00', weekdaysOnly: true }, local(2026, 9, 18, 9, 30))).toEqual(local(2026, 9, 21, 9, 0));
  });

  it('a missed window catches up once: the next due time after a late run is in the future', () => {
    // Slept through 01:00..08:00; the runner catches up at 08:55 and asks for the next due time.
    const next = nextDueAt({ every: 'hour' }, local(2026, 9, 17, 8, 55));
    expect(next).toEqual(local(2026, 9, 17, 9, 0));
  });

  it('maps a cadence to its key and back', () => {
    expect(cadenceKey({ every: 'hour' })).toBe('hour');
    expect(cadenceKey({ every: '6h' })).toBe('6h');
    expect(cadenceKey({ daily: '09:00', weekdaysOnly: false })).toBe('daily');
    expect(cadenceKey({ daily: '09:00', weekdaysOnly: true })).toBe('weekdays');
    expect(cadenceFromKey('weekdays', '07:30')).toEqual({ daily: '07:30', weekdaysOnly: true });
  });

  it('accepts only two-digit 24-hour clock times', () => {
    expect(isValidClockTime('09:00')).toBe(true);
    expect(isValidClockTime('23:59')).toBe(true);
    expect(isValidClockTime('9:00')).toBe(false);
    expect(isValidClockTime('24:00')).toBe(false);
  });
});

describe('due', () => {
  it('is due at or after nextDueAt, and never while paused', () => {
    const r = round({ nextDueAt: '2026-09-17T09:00:00.000Z' });
    expect(isRoundDue(r, new Date('2026-09-17T08:59:59.000Z'))).toBe(false);
    expect(isRoundDue(r, new Date('2026-09-17T09:00:00.000Z'))).toBe(true);
    expect(isRoundDue({ ...r, enabled: false }, new Date('2026-09-17T10:00:00.000Z'))).toBe(false);
  });
});

describe('problems', () => {
  it('a service round needs a connector; a limit is a small positive integer', () => {
    expect(roundProblems(round())).toEqual([]);
    expect(roundProblems(round({ kind: 'service' }))).toEqual(['service-without-connector']);
    expect(roundProblems(round({ name: '  ' }))).toEqual(['name-empty']);
    expect(roundProblems(round({ limit: 0 }))).toEqual(['limit-invalid']);
    expect(roundProblems(round({ limit: 500 }))).toEqual(['limit-invalid']);
  });
});

describe('state file', () => {
  it('round-trips a state, including the away marker', () => {
    const text = serializeRoundState({
      v: 1,
      rounds: [round()],
      awayFrom: '2026-09-16T18:30:00.000Z',
      lastAway: { from: '2026-09-15T18:00:00.000Z', to: '2026-09-16T09:00:00.000Z' },
    });
    const parsed = parseRoundState(text);
    expect(parsed.status).toBe('ok');
    expect(parsed.state.rounds).toEqual([round()]);
    expect(parsed.state.awayFrom).toBe('2026-09-16T18:30:00.000Z');
    expect(parsed.state.lastAway).toEqual({ from: '2026-09-15T18:00:00.000Z', to: '2026-09-16T09:00:00.000Z' });
  });

  it('an absent or empty file is missing, not malformed', () => {
    expect(parseRoundState(null).status).toBe('missing');
    expect(parseRoundState('  ').status).toBe('missing');
  });

  it('a file it cannot read is reported malformed with no rounds, never partially repaired', () => {
    expect(parseRoundState('{').status).toBe('malformed');
    expect(parseRoundState(JSON.stringify({ v: 2, rounds: [] })).status).toBe('malformed');
    const oneBad = JSON.stringify({ v: 1, rounds: [round(), { id: 'x' }] });
    const parsed = parseRoundState(oneBad);
    expect(parsed.status).toBe('malformed');
    expect(parsed.state.rounds).toEqual([]);
  });

  it('drops fields it does not know rather than carrying them into the next write', () => {
    const text = JSON.stringify({ v: 1, rounds: [{ ...round(), secret: 'x' }] });
    const parsed = parseRoundState(text);
    expect(parsed.status).toBe('ok');
    expect('secret' in parsed.state.rounds[0]).toBe(false);
  });
});
