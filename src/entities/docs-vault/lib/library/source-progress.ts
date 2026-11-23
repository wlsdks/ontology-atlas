import type { SourceCompileState } from './source-compile-state';
import type { LibraryModel } from './vault-library';
import { DAY_MS, dayOfDate, isoDay, localDay, runtimeOffset } from '@/shared/lib/library/recorded-date';

/**
 * A source counts only when `compiled`; `checking` and `unreadable` stay in the total. Dates are the `compiled_at` each citing
 * page records, never Git, so the web and the app draw the same line. O(S) for S sources plus O(P) for P ≤ 120 points.
 */

/** Day bucket while the span is at most this many days; weeks past it. */
const MAX_DAY_POINTS = 90;
/** Week buckets while there are at most this many; months past it. */
const MAX_WEEK_POINTS = 120;
export const SOURCE_PROGRESS_MAX_POINTS = 120;

export type SourceProgressUnit = 'day' | 'week' | 'month';

export interface SourceProgressPoint {
  start: string;
  /** Last local day of the bucket, clamped to today, `YYYY-MM-DD`. The count is as of this day. */
  end: string;
  count: number;
}

export interface SourceProgress {
  total: number;
  compiled: number;
  byState: Readonly<Record<SourceCompileState, number>>;
  /** `compiled / total` in percent, rounded down; 100 only when every source is compiled. */
  percent: number;
  /** True when 0 < compiled / total < 1%, where `percent` alone would read 0. */
  underOnePercent: boolean;
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
  now: number;
  /** Minutes east of UTC at an instant, so local days are deterministic under test; defaults to the runtime's zone. */
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
  of: (day: number) => number;
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
