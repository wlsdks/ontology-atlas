import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  type RoundCadence,
  type RoundRecord,
  cadenceFromKey,
  cadenceFromMinutes,
  cadenceKey,
  cadenceMinutes,
  deriveRoundKind,
  roundFingerprint,
  roundPlaceLabels,
  roundPlaces,
  turnsPerDay,
  isRoundDue,
  isValidClockTime,
  nextDueAt,
  parseRoundState,
  roundProblems,
  roundWidens,
  serializeRoundState,
} from './round-record';

/** Local-time constructor, so expectations read as wall-clock times. */
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

describe("what this Mac's allowance covers", () => {
  it('changes with anything an unattended pass does, and not with its name, switch or clock', () => {
    const base = round({
      kind: 'service',
      connectorId: 'c1',
      connectorName: 'slack',
      query: 'release notes',
      limit: 20,
      places: [
        { kind: 'vault', paths: ['wiki/releases'] },
        { kind: 'service', connectorId: 'c1', connectorName: 'slack', location: '#release-room' },
      ],
    });
    const allowed = roundFingerprint(base);
    expect(
      roundFingerprint({ ...base, name: 'Renamed', enabled: false, lastPassAt: '2026-09-18T00:00:00.000Z', nextDueAt: '2026-09-19T00:00:00.000Z' }),
    ).toBe(allowed);
    const changes: RoundRecord[] = [
      { ...base, kind: 'ontology' },
      { ...base, cadence: { everyMinutes: 1 } },
      { ...base, onStale: 'mark' },
      { ...base, query: 'a different question' },
      { ...base, limit: 100 },
      { ...base, places: [{ kind: 'vault', paths: [] }] },
      { ...base, places: [...base.places!, { kind: 'service', connectorId: 'c2', connectorName: 'github' }] },
    ];
    for (const changed of changes) expect(roundFingerprint(changed)).not.toBe(allowed);
  });
});

describe('an edit that widens what this Mac allowed', () => {
  const service = round({
    kind: 'service',
    connectorId: 'c1',
    connectorName: 'slack',
    limit: 20,
    cadence: { every: '6h' },
    places: [
      { kind: 'vault', paths: ['wiki/releases'] },
      { kind: 'service', connectorId: 'c1', connectorName: 'slack', location: '#release-room' },
    ],
  });

  it('widens when a pass may run more often, write more, or read somewhere new', () => {
    expect(roundWidens(service, { ...service, cadence: { every: 'hour' } })).toBe(true);
    expect(roundWidens(round({ onStale: 'mark' }), round({ onStale: 'redraft' }))).toBe(true);
    expect(roundWidens(round({ kind: 'consistency' }), { ...service, cadence: { every: 'hour' } })).toBe(true);
    expect(roundWidens(service, { ...service, limit: 50 })).toBe(true);
    expect(roundWidens(service, { ...service, places: [{ kind: 'vault', paths: [] }, service.places![1]] })).toBe(true);
    expect(roundWidens(service, { ...service, places: [{ kind: 'vault', paths: ['wiki/releases', 'sources/planning'] }, service.places![1]] })).toBe(true);
    expect(roundWidens(service, { ...service, places: [service.places![0], { kind: 'service', connectorId: 'c1', connectorName: 'slack' }] })).toBe(true);
    expect(roundWidens(service, { ...service, places: [...service.places!, { kind: 'service', connectorId: 'c2', connectorName: 'github' }] })).toBe(true);
    const own = round({ places: [{ kind: 'vault', paths: [], ownDocumentsOnly: true }] });
    expect(roundWidens(own, round({ places: [{ kind: 'vault', paths: [] }] }))).toBe(true);
  });

  it('does not widen for a new name, a slower cadence, fewer places, or a different question', () => {
    expect(roundWidens(service, { ...service, name: 'Release room' })).toBe(false);
    expect(roundWidens(service, { ...service, cadence: { daily: '09:00', weekdaysOnly: true } })).toBe(false);
    expect(roundWidens(service, { ...service, places: [{ kind: 'vault', paths: ['wiki/releases/2026'] }, service.places![1]] })).toBe(false);
    expect(roundWidens(service, { ...service, places: [service.places![0]], kind: 'consistency' })).toBe(false);
    expect(roundWidens(service, {
      ...service,
      query: 'incidents only',
      places: [service.places![0], { kind: 'service', connectorId: 'c1', connectorName: 'slack', location: '#release-room', query: 'incidents only' }],
    })).toBe(false);
    expect(roundWidens(round({ onStale: 'redraft' }), round({ onStale: 'mark' }))).toBe(false);
    expect(roundWidens(round({ kind: 'ontology', query: 'source gaps' }), round({ kind: 'ontology', query: 'relations' }))).toBe(false);
  });
});

describe('cadence', () => {
  it('an hourly round runs on the hour, strictly after the moment it is asked from', () => {
    expect(nextDueAt({ every: 'hour' }, local(2026, 9, 17, 9, 2))).toEqual(local(2026, 9, 17, 10, 0));
    // Exactly on the hour yields the next hour, so a 10:00 pass does not repeat.
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
    // Slept through 01:00..08:00; catching up at 08:55 yields one next due time.
    const next = nextDueAt({ every: 'hour' }, local(2026, 9, 17, 8, 55));
    expect(next).toEqual(local(2026, 9, 17, 9, 0));
  });

  it('an interval shorter than an hour divides the hour, so :00 :05 :10 is a shared grid', () => {
    expect(nextDueAt({ everyMinutes: 5 }, local(2026, 9, 17, 9, 2))).toEqual(local(2026, 9, 17, 9, 5));
    expect(nextDueAt({ everyMinutes: 5 }, local(2026, 9, 17, 9, 5))).toEqual(local(2026, 9, 17, 9, 10));
    expect(nextDueAt({ everyMinutes: 10 }, local(2026, 9, 17, 9, 59))).toEqual(local(2026, 9, 17, 10, 0));
    expect(nextDueAt({ everyMinutes: 1 }, local(2026, 9, 17, 9, 59))).toEqual(local(2026, 9, 17, 10, 0));
  });

  it('an interval of an hour or more divides the day from midnight', () => {
    expect(nextDueAt({ everyMinutes: 120 }, local(2026, 9, 17, 9, 2))).toEqual(local(2026, 9, 17, 10, 0));
    expect(nextDueAt({ everyMinutes: 120 }, local(2026, 9, 17, 23, 30))).toEqual(local(2026, 9, 18, 0, 0));
    expect(nextDueAt({ everyMinutes: 720 }, local(2026, 9, 17, 9, 2))).toEqual(local(2026, 9, 17, 12, 0));
    expect(nextDueAt({ everyMinutes: 1440 }, local(2026, 9, 17, 9, 2))).toEqual(local(2026, 9, 18, 0, 0));
  });

  describe('on a daylight-saving day', () => {
    let zone: string | undefined;
    beforeAll(() => {
      zone = process.env.TZ;
    });
    afterAll(() => {
      if (zone === undefined) delete process.env.TZ;
      else process.env.TZ = zone;
    });
    const runs = (cadence: RoundCadence, fromIso: string, count: number) => {
      const out: string[] = [];
      let at = new Date(fromIso);
      for (let i = 0; i < count; i += 1) {
        at = nextDueAt(cadence, new Date(at.getTime() + 30_000));
        out.push(at.toISOString());
      }
      return out;
    };

    it('runs at both 01:00s when the clocks go back, so no real hour goes without its run', () => {
      process.env.TZ = 'America/New_York';
      expect(runs({ everyMinutes: 5 }, '2026-11-01T05:54:00.000Z', 2)).toEqual(['2026-11-01T05:55:00.000Z', '2026-11-01T06:00:00.000Z']);
      expect(runs({ every: 'hour' }, '2026-11-01T04:30:00.000Z', 3)).toEqual([
        '2026-11-01T05:00:00.000Z',
        '2026-11-01T06:00:00.000Z',
        '2026-11-01T07:00:00.000Z',
      ]);
    });

    it('runs a time the clock skips at the first minute after the jump, then keeps its grid', () => {
      process.env.TZ = 'Europe/Berlin';
      expect(runs({ everyMinutes: 120 }, '2026-03-28T22:30:00.000Z', 3)).toEqual([
        '2026-03-28T23:00:00.000Z',
        '2026-03-29T01:00:00.000Z',
        '2026-03-29T02:00:00.000Z',
      ]);
      process.env.TZ = 'America/New_York';
      expect(runs({ every: '6h' }, '2026-03-08T04:30:00.000Z', 3)).toEqual([
        '2026-03-08T05:00:00.000Z',
        '2026-03-08T10:00:00.000Z',
        '2026-03-08T16:00:00.000Z',
      ]);
    });

    it('runs every day, including the day whose midnight does not exist', () => {
      process.env.TZ = 'America/Santiago';
      expect(runs({ everyMinutes: 1440 }, '2026-09-05T05:00:00.000Z', 2)).toEqual(['2026-09-06T04:00:00.000Z', '2026-09-07T03:00:00.000Z']);
      expect(nextDueAt({ daily: '00:00', weekdaysOnly: false }, new Date('2026-09-05T05:00:00.000Z')).toISOString()).toBe('2026-09-06T04:00:00.000Z');
      expect(runs({ everyMinutes: 120 }, '2026-09-06T03:00:00.000Z', 2)).toEqual(['2026-09-06T04:00:00.000Z', '2026-09-06T05:00:00.000Z']);
    });
  });

  it('60 and 360 keep their literals so a file written today reads on the previous build', () => {
    expect(cadenceFromMinutes(60)).toEqual({ every: 'hour' });
    expect(cadenceFromMinutes(360)).toEqual({ every: '6h' });
    expect(cadenceFromMinutes(10)).toEqual({ everyMinutes: 10 });
    expect(cadenceMinutes({ every: 'hour' })).toBe(60);
    expect(cadenceMinutes({ every: '6h' })).toBe(360);
    expect(cadenceMinutes({ everyMinutes: 10 })).toBe(10);
    expect(cadenceMinutes({ daily: '09:00', weekdaysOnly: false })).toBeNull();
    // An interval survives a file round trip.
    const text = serializeRoundState({ v: 1, rounds: [round({ cadence: { everyMinutes: 10 } })] });
    expect(parseRoundState(text).state.rounds[0].cadence).toEqual({ everyMinutes: 10 });
    expect(parseRoundState(JSON.stringify({ v: 1, rounds: [round({ cadence: { everyMinutes: 0 } })] })).status).toBe('malformed');
  });

  it('states the daily agent-turn bill per cadence', () => {
    expect(turnsPerDay({ everyMinutes: 1 })).toBe(1440);
    expect(turnsPerDay({ everyMinutes: 5 })).toBe(288);
    expect(turnsPerDay({ everyMinutes: 10 })).toBe(144);
    expect(turnsPerDay({ everyMinutes: 30 })).toBe(48);
    expect(turnsPerDay({ everyMinutes: 120 })).toBe(12);
    expect(turnsPerDay({ every: 'hour' })).toBe(24);
    expect(turnsPerDay({ every: '6h' })).toBe(4);
    expect(turnsPerDay({ daily: '09:00', weekdaysOnly: true })).toBe(1);
  });

  it('maps a cadence to its key and back', () => {
    expect(cadenceKey({ every: 'hour' })).toBe('hour');
    expect(cadenceKey({ every: '6h' })).toBe('6h');
    expect(cadenceKey({ daily: '09:00', weekdaysOnly: false })).toBe('daily');
    expect(cadenceKey({ daily: '09:00', weekdaysOnly: true })).toBe('weekdays');
    expect(cadenceKey({ everyMinutes: 10 })).toBe('minutes');
    expect(cadenceKey({ everyMinutes: 120 })).toBe('hours');
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

describe('places', () => {
  it('derives the kind: any service place makes it a service round', () => {
    expect(deriveRoundKind([{ kind: 'vault', paths: [] }])).toBe('consistency');
    expect(
      deriveRoundKind([
        { kind: 'vault', paths: ['sources/planning'] },
        { kind: 'service', connectorId: 'c1', connectorName: 'slack' },
      ]),
    ).toBe('service');
  });

  it('a record written before places still describes its places', () => {
    const legacy = round({ kind: 'service', connectorId: 'c1', connectorName: 'confluence', query: 'ENG' });
    expect(roundPlaces(legacy)).toEqual([
      { kind: 'vault', paths: [] },
      { kind: 'service', connectorId: 'c1', connectorName: 'confluence', query: 'ENG' },
    ]);
    expect(roundPlaces(round())).toEqual([{ kind: 'vault', paths: [] }]);
  });

  it('names the places the way the index row and the ledger say them', () => {
    expect(
      roundPlaceLabels([
        { kind: 'vault', paths: ['sources/planning'] },
        { kind: 'service', connectorId: 'c1', connectorName: 'slack', location: '#release-room' },
        { kind: 'service', connectorId: 'c2', connectorName: 'confluence' },
      ]),
    ).toEqual(['sources/planning', 'slack · #release-room', 'confluence']);
  });

  it('reads places back from the file and drops a half-written one', () => {
    const text = serializeRoundState({
      v: 1,
      rounds: [
        round({
          kind: 'service',
          connectorId: 'c1',
          connectorName: 'slack',
          places: [
            { kind: 'vault', paths: ['wiki/releases'] },
            { kind: 'service', connectorId: 'c1', connectorName: 'slack', location: '#release-room' },
          ],
        }),
      ],
    });
    const parsed = parseRoundState(text);
    expect(parsed.status).toBe('ok');
    expect(parsed.state.rounds[0].places).toHaveLength(2);

    const broken = JSON.stringify({
      v: 1,
      rounds: [{ ...round(), places: [{ kind: 'service', connectorId: 'c1' }] }],
    });
    expect(parseRoundState(broken).state.rounds[0]?.places).toBeUndefined();
  });
});
