import type { LibraryModel, SourceCompileState } from './vault-library';

/**
 * How many sources have a wiki page, and since when. A source counts only when it is `compiled`;
 * `checking` and `unreadable` stay in the total and never count. Dates are the `compiled_at` each
 * citing page records, never Git, so the web and the app draw the same line; the library model
 * keeps one day number per source (`compiledDay`), and this reads it.
 *
 * Cost: O(S) for S sources, two passes and no per-source allocation, plus O(P) for P ≤ 120 points.
 */

const DAY_MS = 86_400_000;
/** Day bucket while the span is at most this many days; weeks past it. */
const MAX_DAY_POINTS = 90;
/** Week buckets while there are at most this many; months past it. */
const MAX_WEEK_POINTS = 120;
/** No series is longer than this; months group into larger steps past it. */
export const SOURCE_PROGRESS_MAX_POINTS = 120;
/** The earliest day a recorded date is believed: 2000-01-01. */
const MIN_DAY = 10_957;

export type SourceProgressUnit = 'day' | 'week' | 'month';

export interface SourceProgressPoint {
  /** First local day of the bucket, `YYYY-MM-DD`. */
  start: string;
  /** Last local day of the bucket, clamped to today, `YYYY-MM-DD`. The count is as of this day. */
  end: string;
  /** Sources with a wiki page whose earliest valid date falls on or before `end`. */
  count: number;
}

export interface SourceProgress {
  /** Every source in the folder, `unreadable` and `checking` included. */
  total: number;
  /** Sources in `compiled`; the only state that counts. */
  compiled: number;
  byState: Readonly<Record<SourceCompileState, number>>;
  /** `compiled / total` in percent, rounded down; 100 only when every source is compiled. */
  percent: number;
  /** True when 0 < compiled / total < 1%, where `percent` alone would read 0. */
  underOnePercent: boolean;
  /** Compiled sources whose earliest valid date is today's local day. */
  today: number;
  /** Compiled sources with no valid date: missing, unparsable, after today, or before 2000. */
  undated: number;
  unit: SourceProgressUnit;
  /** Units per point: 1, or more months per point once months alone exceed the cap. */
  step: number;
  /** Cumulative, oldest first, ending at the bucket that holds today; empty when nothing is dated. */
  series: readonly SourceProgressPoint[];
}

export interface SourceProgressClock {
  /** Now, in epoch milliseconds. */
  now: number;
  /**
   * Minutes east of UTC at an instant, so local days are deterministic under test. Defaults to the
   * runtime's zone.
   */
  offsetMinutes?: (epochMs: number) => number;
}

const STATES: readonly SourceCompileState[] = [
  'not-compiled',
  'compiled',
  'partial',
  'stale',
  'checking',
  'unreadable',
];

function runtimeOffset(epochMs: number): number {
  return -new Date(epochMs).getTimezoneOffset();
}

/** Local day number (days since 1970-01-01) of an instant. */
function localDay(epochMs: number, offsetMinutes: (epochMs: number) => number): number {
  return Math.floor((epochMs + offsetMinutes(epochMs) * 60_000) / DAY_MS);
}

/** Day number of a calendar date; `Date.UTC` is arithmetic here, not a zone. */
function dayOfDate(year: number, month: number, day: number): number {
  return Math.floor(Date.UTC(year, month - 1, day) / DAY_MS);
}

function isoDay(day: number): string {
  return new Date(day * DAY_MS).toISOString().slice(0, 10);
}

/**
 * ISO 8601 only: a date, or a date-time with `T`, optional seconds and fraction, and a required `Z`
 * or offset. `Date.parse` is not used, because engines disagree on anything else (V8 reads
 * `build 12` as 2001-12-01), and the web and the app must draw the same line.
 */
const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,9}))?)?(?:(Z)|([+-])(\d{2}):?(\d{2})))?$/;

/**
 * The local day index a recorded `compiled_at` falls on, or null when it is not an ISO date or
 * falls before 2000. A bare `YYYY-MM-DD` is the day as written; a timestamp is placed by its instant.
 */
export function recordedLocalDay(
  value: string,
  offsetMinutes: (epochMs: number) => number = runtimeOffset,
): number | null {
  const day = recordedDay(value, offsetMinutes);
  return day === null || day < MIN_DAY ? null : day;
}

function recordedDay(
  value: string,
  offsetMinutes: (epochMs: number) => number,
): number | null {
  const match = ISO_DATE.exec(value);
  if (!match) return null;
  const [, year, month, day, hour, minute, second, fraction, zulu, sign, zoneHour, zoneMinute] = match;
  const date = dayOfDate(Number(year), Number(month), Number(day));
  // `Date.UTC` rolls 2026-02-30 into March; a date that rolled is not a date.
  if (isoDay(date) !== `${year}-${month}-${day}`) return null;
  if (hour === undefined) return date;
  if (Number(hour) > 23 || Number(minute) > 59 || Number(second ?? 0) > 59) return null;
  if (!zulu && (Number(zoneHour) > 23 || Number(zoneMinute) > 59)) return null;
  const zone = zulu ? 0 : (sign === '-' ? -1 : 1) * (Number(zoneHour) * 60 + Number(zoneMinute));
  const instant = date * DAY_MS
    + ((Number(hour) * 60 + Number(minute) - zone) * 60 + Number(second ?? 0)) * 1000
    + Number((fraction ?? '').slice(0, 3).padEnd(3, '0'));
  return localDay(instant, offsetMinutes);
}

/** Months since 1970-01 of a day number. */
function monthIndex(day: number): number {
  const date = new Date(day * DAY_MS);
  return (date.getUTCFullYear() - 1970) * 12 + date.getUTCMonth();
}

function dayOfMonthIndex(index: number): number {
  return dayOfDate(1970 + Math.floor(index / 12), (index % 12) + 1, 1);
}

/** Monday-aligned week number; day 0 (1970-01-01) was a Thursday. */
function weekIndex(day: number): number {
  return Math.floor((day + 3) / 7);
}

interface Buckets {
  unit: SourceProgressUnit;
  step: number;
  count: number;
  /** Bucket of a day number, 0-based from the first. */
  of: (day: number) => number;
  /** First day number of a bucket. */
  startOf: (bucket: number) => number;
}

function chooseBuckets(first: number, today: number): Buckets {
  if (today - first + 1 <= MAX_DAY_POINTS) {
    return { unit: 'day', step: 1, count: today - first + 1, of: (day) => day - first, startOf: (bucket) => first + bucket };
  }
  const firstWeek = weekIndex(first);
  const weeks = weekIndex(today) - firstWeek + 1;
  if (weeks <= MAX_WEEK_POINTS) {
    return {
      unit: 'week',
      step: 1,
      count: weeks,
      of: (day) => weekIndex(day) - firstWeek,
      startOf: (bucket) => Math.max(first, (firstWeek + bucket) * 7 - 3),
    };
  }
  const firstMonth = monthIndex(first);
  const months = monthIndex(today) - firstMonth + 1;
  const step = Math.ceil(months / SOURCE_PROGRESS_MAX_POINTS);
  return {
    unit: 'month',
    step,
    count: Math.ceil(months / step),
    of: (day) => Math.floor((monthIndex(day) - firstMonth) / step),
    startOf: (bucket) => Math.max(first, dayOfMonthIndex(firstMonth + bucket * step)),
  };
}

export function deriveSourceProgress(
  model: Pick<LibraryModel, 'sources'>,
  clock: SourceProgressClock,
): SourceProgress {
  const offsetMinutes = clock.offsetMinutes ?? runtimeOffset;
  const today = localDay(clock.now, offsetMinutes);
  const byState = Object.fromEntries(STATES.map((state) => [state, 0])) as Record<SourceCompileState, number>;
  // A day after today is not believed: `compiled_at` is copied by agents.
  const datedDay = (day: number | undefined): number => (day === undefined || day < 0 || day > today ? -1 : day);

  let undated = 0;
  let first = Infinity;
  for (const row of model.sources) {
    byState[row.state] += 1;
    if (row.state !== 'compiled') continue;
    const day = datedDay(row.compiledDay);
    if (day < 0) undated += 1;
    else if (day < first) first = day;
  }

  const total = model.sources.length;
  const compiled = byState.compiled;
  const percent = total === 0 ? 0 : Math.floor((compiled * 100) / total);
  let todayCount = 0;
  let unit: SourceProgressUnit = 'day';
  let step = 1;
  const series: SourceProgressPoint[] = [];
  if (first !== Infinity) {
    const buckets = chooseBuckets(first, today);
    unit = buckets.unit;
    step = buckets.step;
    const added = new Array<number>(buckets.count).fill(0);
    for (const row of model.sources) {
      if (row.state !== 'compiled') continue;
      const day = datedDay(row.compiledDay);
      if (day < 0) continue;
      added[buckets.of(day)] += 1;
      if (day === today) todayCount += 1;
    }
    let running = 0;
    for (let bucket = 0; bucket < buckets.count; bucket += 1) {
      running += added[bucket];
      const end = bucket + 1 < buckets.count ? buckets.startOf(bucket + 1) - 1 : today;
      series.push({ start: isoDay(buckets.startOf(bucket)), end: isoDay(end), count: running });
    }
  }

  return {
    total,
    compiled,
    byState,
    percent,
    underOnePercent: compiled > 0 && compiled * 100 < total,
    today: todayCount,
    undated,
    unit,
    step,
    series,
  };
}
