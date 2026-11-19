import type { LibraryModel, SourceCompileState } from './vault-library';

/**
 * How many sources have a wiki page, and since when. A source counts only when it is `compiled`;
 * `checking` and `unreadable` stay in the total and never count. Dates are the `compiled_at` each
 * citing page records, never Git, so the web and the app draw the same line.
 *
 * Cost: O(S + C) for S sources and C covering citations, plus O(P) for P ≤ 120 series points.
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

const NO_DATES: readonly { compiledAt: string | null }[] = [];

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

const DATE_ONLY = /^(\d{4})-(\d{2})-(\d{2})$/;

/**
 * The local day a recorded `compiled_at` falls on, or null when it is not a date. A bare
 * `YYYY-MM-DD` is the day as written; a timestamp is placed by its instant.
 */
function recordedDay(
  value: string,
  offsetMinutes: (epochMs: number) => number,
): number | null {
  const bare = DATE_ONLY.exec(value);
  if (bare) {
    const year = Number(bare[1]);
    const month = Number(bare[2]);
    const day = Number(bare[3]);
    if (month < 1 || month > 12 || day < 1 || day > 31) return null;
    const number = dayOfDate(year, month, day);
    // `Date.UTC` rolls 2026-02-31 into March; a date that rolled is not a date.
    return isoDay(number) === value ? number : null;
  }
  const instant = Date.parse(value);
  return Number.isFinite(instant) ? localDay(instant, offsetMinutes) : null;
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
  // Pages written in one run share one `compiled_at`, so each distinct string is parsed once.
  const parsed = new Map<string, number | null>();
  const dayOf = (value: string): number | null => {
    let day = parsed.get(value);
    if (day === undefined) {
      day = recordedDay(value, offsetMinutes);
      // A day after today or before 2000 is not believed (`compiled_at` is copied by agents).
      if (day !== null && (day > today || day < MIN_DAY)) day = null;
      parsed.set(value, day);
    }
    return day;
  };

  const dated: number[] = [];
  let undated = 0;
  let first = Infinity;
  for (const row of model.sources) {
    byState[row.state] += 1;
    if (row.state !== 'compiled') continue;
    let earliest = Infinity;
    for (const citation of row.coveredBy ?? NO_DATES) {
      if (citation.compiledAt === null) continue;
      const day = dayOf(citation.compiledAt);
      if (day !== null && day < earliest) earliest = day;
    }
    if (earliest === Infinity) {
      undated += 1;
      continue;
    }
    dated.push(earliest);
    if (earliest < first) first = earliest;
  }

  const total = model.sources.length;
  const compiled = byState.compiled;
  const percent = total === 0 ? 0 : Math.floor((compiled * 100) / total);
  let todayCount = 0;
  let unit: SourceProgressUnit = 'day';
  let step = 1;
  const series: SourceProgressPoint[] = [];
  if (dated.length > 0) {
    const buckets = chooseBuckets(first, today);
    unit = buckets.unit;
    step = buckets.step;
    const added = new Array<number>(buckets.count).fill(0);
    for (const day of dated) {
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
