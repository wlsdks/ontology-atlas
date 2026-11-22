import { describe, expect, it } from 'vitest';

import type { VaultDoc, VaultSourceFile } from '../../model/vault-manifest';
import { deriveSourceProgress, recordedInstantMs, recordedLocalDay, SOURCE_PROGRESS_MAX_POINTS } from './source-progress';
import { type SourceCompileState } from './source-compile-state';
import { buildLibraryModel, type LibrarySourceRow } from './vault-library';

/** 2026-11-19 21:00 in Seoul; a fixed offset keeps local days independent of the machine. */
const SEOUL = { now: Date.parse('2026-11-19T12:00:00Z'), offsetMinutes: () => 540 };

function source(path: string): VaultSourceFile {
  return { path, name: path.split('/').pop() as string, format: 'md', bytes: 10, mtime: 1 };
}

function page(slug: string, frontmatter: Record<string, unknown>): VaultDoc {
  return {
    slug, path: `${slug}.md`, title: slug, tags: [], frontmatter, 
    updatedAt: '2026-11-19T00:00:00Z', linksOut: [],
  };
}

const HASH = (letter: string) => letter.repeat(64);

/** One page citing one source with a matching hash, unless the overrides say otherwise. */
function cites(slug: string, path: string, compiledAt: string | null, extra: Record<string, unknown> = {}) {
  return page(slug, {
    sources: [path],
    source_hash: { [path]: HASH('a') },
    ...(compiledAt === null ? {} : { compiled_at: compiledAt }),
    ...extra,
  });
}

const MINUTES = '회의록';
const NFC_PATH = `sources/${MINUTES.normalize('NFC')}.md`;
const NFD_PATH = `sources/${MINUTES.normalize('NFD')}.md`;

/** Every state, three dated local days, a future date, a missing date and a decomposed citation. */
function fixture() {
  const paths = ['a', 'b', 'c', 'future', 'undated', 'uncited', 'stale', 'partial', 'checking', 'unreadable']
    .map((name) => `sources/${name}.md`);
  const sources = [...paths, NFC_PATH].map(source);
  const docs = [
    cites('wiki/a', 'sources/a.md', '2026-11-17T01:00:00Z'),
    cites('wiki/b', 'sources/b.md', '2026-11-18T01:00:00Z'),
    // 23:30 UTC on the 18th is the 19th in Seoul.
    cites('wiki/c', 'sources/c.md', '2026-11-18T23:30:00Z'),
    cites('wiki/minutes', NFD_PATH, '2026-11-19'),
    cites('wiki/future', 'sources/future.md', '2026-11-21T00:00:00Z'),
    cites('wiki/undated', 'sources/undated.md', null),
    cites('wiki/stale', 'sources/stale.md', '2026-11-18T00:00:00Z', { source_hash: { 'sources/stale.md': HASH('f') } }),
    cites('wiki/partial', 'sources/partial.md', '2026-11-18T00:00:00Z', { sources_truncated: ['sources/partial.md'] }),
    cites('wiki/checking', 'sources/checking.md', '2026-11-18T00:00:00Z'),
    cites('wiki/unreadable', 'sources/unreadable.md', '2026-11-18T00:00:00Z'),
  ];
  const hashes = new Map(sources
    .filter(({ path }) => path !== 'sources/checking.md' && path !== 'sources/unreadable.md')
    .map(({ path }) => [path, HASH('a')] as const));
  return buildLibraryModel({
    sources, docs, hashes, unreadable: new Set(['sources/unreadable.md']), offsetMinutes: SEOUL.offsetMinutes,
  });
}

function row(state: SourceCompileState, compiledAt: string | null = null, index = 0): LibrarySourceRow {
  return {
    ...source(`sources/r${index}.md`),
    state,
    citedBy: [],
    compiledDay: state === 'compiled' && compiledAt !== null
      ? recordedLocalDay(compiledAt, SEOUL.offsetMinutes) ?? -1
      : -1,
  };
}

function rows(count: number, state: SourceCompileState): LibrarySourceRow[] {
  return Array.from({ length: count }, (_, index) => row(state, '2026-11-19T00:00:00Z', index));
}

describe('source progress counts only sources a wiki page covers', () => {
  const model = fixture();
  const progress = deriveSourceProgress(model, SEOUL);

  it('counts exactly the compiled rows and keeps every other state in the total', () => {
    expect(progress.total).toBe(11);
    expect(progress.compiled).toBe(model.sources.filter((entry) => entry.state === 'compiled').length);
    expect(progress.byState).toEqual({
      'not-compiled': 1, compiled: 6, partial: 1, stale: 1, checking: 1, unreadable: 1,
    });
    expect(progress.percent).toBe(54);
  });

  it('counts a source cited by a decomposed Hangul path', () => {
    expect(model.sources.find((entry) => entry.path === NFC_PATH)?.state).toBe('compiled');
  });

  it('keeps a file that could not be read in the total without counting it', () => {
    expect(model.sources.find((entry) => entry.path === 'sources/unreadable.md')?.state).toBe('unreadable');
    expect(model.pathsNeedingHash).toEqual(['sources/checking.md']);
  });

  it('draws three cumulative steps over three local days and sets future and missing dates apart', () => {
    expect(progress.unit).toBe('day');
    expect(progress.series).toEqual([
      { start: '2026-11-17', end: '2026-11-17', count: 1 },
      { start: '2026-11-18', end: '2026-11-18', count: 2 },
      { start: '2026-11-19', end: '2026-11-19', count: 4 },
    ]);
    expect(progress.undated).toBe(2);
    expect(progress.today).toBe(2);
  });
});

describe('the percent never claims more than the folder holds', () => {
  it.each([
    [249, 250, 99, false],
    [999, 1000, 99, false],
    [1000, 1000, 100, false],
    [1, 101, 0, true],
    [1, 100, 1, false],
    [0, 40, 0, false],
    [0, 0, 0, false],
  ])('%i of %i reads %i%%, under one percent: %s', (compiled, total, percent, underOne) => {
    const progress = deriveSourceProgress(
      { sources: [...rows(compiled, 'compiled'), ...rows(total - compiled, 'not-compiled')] },
      SEOUL,
    );
    expect(progress.percent).toBe(percent);
    expect(progress.underOnePercent).toBe(underOne);
  });

  it('does not count checking rows toward the percent', () => {
    const progress = deriveSourceProgress({ sources: [...rows(1, 'compiled'), ...rows(3, 'checking')] }, SEOUL);
    expect(progress.compiled).toBe(1);
    expect(progress.percent).toBe(25);
  });
});

describe('each source is dated once, by the earliest date it can be believed', () => {
  /** One source covered by one page per date, built the way the screen builds it. */
  function dated(...dates: Array<string | null>): LibrarySourceRow {
    const path = 'sources/r0.md';
    const model = buildLibraryModel({
      sources: [source(path)],
      docs: dates.map((compiledAt, index) => cites(`wiki/p${index}`, path, compiledAt)),
      hashes: new Map([[path, HASH('a')]]),
      offsetMinutes: SEOUL.offsetMinutes,
    });
    return model.sources[0];
  }

  it('takes the earliest valid date across covering pages and ignores ones before 2000', () => {
    const progress = deriveSourceProgress({ sources: [dated('2026-11-18', '1999-12-30', '2026-11-10T03:00:00Z')] }, SEOUL);
    expect(progress.series[0]).toEqual({ start: '2026-11-10', end: '2026-11-10', count: 1 });
    expect(progress.today).toBe(0);
  });

  it.each([
    ['a day after today', '2026-11-20'],
    ['a year before 2000', '1998-05-01T00:00:00Z'],
    ['an impossible date', '2026-02-31'],
    ['the 30th of February', '2026-02-30'],
    ['a word', 'yesterday'],
    ['a word and a number', 'build 12'],
    ['a bare number', '1'],
    ['a bare year', '2026'],
    ['a zoneless date-time on an impossible date', '2026-02-30T10:00:00'],
    ['a zoneless date-time past 23 hours', '2026-11-18T24:00:00.5'],
    ['an hour past 23', '2026-11-18T24:00:00Z'],
    ['a space instead of T', '2026-11-18 10:00:00Z'],
    ['a long-form date', 'November 18, 2026'],
  ])('leaves %s out of the line and counts it as undated', (_, value) => {
    const progress = deriveSourceProgress({ sources: [dated(value)] }, SEOUL);
    expect(progress.series).toEqual([]);
    expect(progress.undated).toBe(1);
    expect(progress.compiled).toBe(1);
  });

  it.each([
    ['2026-11-18T15:30Z', '2026-11-19'],
    ['2026-11-18T23:59:59.999+09:00', '2026-11-18'],
    ['2026-11-19T00:30:00-0500', '2026-11-19'],
    ['2026-11-18T14:59:59.123456Z', '2026-11-18'],
    // No zone: the day as written, whatever the zone, as a bare date is.
    ['2026-11-17T23:30:00', '2026-11-17'],
    ['2026-11-17T23:30:00.123456', '2026-11-17'],
  ])('reads the ISO date-time %s as the Seoul day %s', (value, day) => {
    const progress = deriveSourceProgress({ sources: [dated(value)] }, SEOUL);
    expect(progress.series[0]?.start).toBe(day);
  });

  it('places a timestamp on the local day of the injected zone', () => {
    const late = '2026-11-18T20:00:00Z';
    expect(recordedLocalDay(late, SEOUL.offsetMinutes)).toBe(Date.UTC(2026, 10, 19) / 86_400_000);
    expect(recordedLocalDay(late, () => -300)).toBe(Date.UTC(2026, 10, 18) / 86_400_000);
    expect(deriveSourceProgress({ sources: [dated(late)] }, SEOUL).today).toBe(1);
  });

  it.each([
    ['2026-11-18T20:00:00Z', Date.parse('2026-11-18T20:00:00Z')],
    ['2026-11-19T05:00:00+09:00', Date.parse('2026-11-18T20:00:00Z')],
    // No zone: wall time in the injected zone, and a bare date is its midnight.
    ['2026-11-19T05:00:00', Date.parse('2026-11-18T20:00:00Z')],
    ['2026-11-19', Date.parse('2026-11-18T15:00:00Z')],
    ['build 12', null],
    ['2026-02-30', null],
    ['1999-12-31', null],
  ])('reads %s as the same instant the day count uses', (value, ms) => {
    expect(recordedInstantMs(value, SEOUL.offsetMinutes)).toBe(ms);
  });
});

describe('the series stays readable over any span', () => {
  const DAY = 86_400_000;
  function spanning(days: number): LibrarySourceRow[] {
    const today = Date.parse('2026-11-19T00:00:00Z');
    return [row('compiled', new Date(today - days * DAY).toISOString(), 0), row('compiled', '2026-11-19T00:00:00Z', 1)];
  }

  it('switches to Monday-aligned weeks over a 200-day span', () => {
    // 2026-05-03 is a Sunday: the first bucket is that one day, then whole weeks from Monday.
    const progress = deriveSourceProgress({ sources: spanning(200) }, SEOUL);
    expect(progress.unit).toBe('week');
    expect(progress.series.length).toBe(30);
    expect(progress.series[0]).toEqual({ start: '2026-05-03', end: '2026-05-03', count: 1 });
    expect(progress.series[1].start).toBe('2026-05-04');
    expect(progress.series.at(-1)).toEqual({ start: '2026-11-16', end: '2026-11-19', count: 2 });
  });

  it('keeps days up to 90 and months past 120 weeks', () => {
    expect(deriveSourceProgress({ sources: spanning(89) }, SEOUL).unit).toBe('day');
    expect(deriveSourceProgress({ sources: spanning(90) }, SEOUL).unit).toBe('week');
    expect(deriveSourceProgress({ sources: spanning(7 * 125) }, SEOUL).unit).toBe('month');
  });

  it('never returns more than 120 points, from one day to the year 2000', () => {
    for (let days = 0; days <= 9_820; days += 17) {
      const { series, unit, step } = deriveSourceProgress({ sources: spanning(days) }, SEOUL);
      expect(series.length, `${days} days as ${step} ${unit}`).toBeLessThanOrEqual(SOURCE_PROGRESS_MAX_POINTS);
      expect(series.at(-1)?.end).toBe('2026-11-19');
      expect(series.at(-1)?.count).toBe(2);
    }
  });

  it('groups months into larger steps once months alone pass the cap', () => {
    const progress = deriveSourceProgress({ sources: [row('compiled', '2000-01-03', 0)] }, SEOUL);
    expect(progress.unit).toBe('month');
    expect(progress.step).toBe(3);
    expect(progress.series[0]).toEqual({ start: '2000-01-03', end: '2000-03-31', count: 1 });
  });
});
