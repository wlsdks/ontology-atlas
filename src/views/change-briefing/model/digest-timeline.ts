import { localDate, type BriefingPeriod, type BriefingRange } from './briefing-model';
import type { DigestChange } from './change-digest';

export type TimelineUnit = 'minute' | 'day' | 'week';

/** Up to this many days a period draws one column per day; a longer one draws weeks. */
const DAY_COLUMN_LIMIT = 62;
const MINUTES_PER_DAY = 1440;
const SECONDS_PER_DAY = 86_400;

export function timelineUnit(period: BriefingPeriod, range: BriefingRange): TimelineUnit {
  const days = Math.round((range.endEpoch - range.startEpoch) / SECONDS_PER_DAY);
  if (days <= 1) return 'minute';
  return period === 'year' || days > DAY_COLUMN_LIMIT ? 'week' : 'day';
}

export interface DayTick {
  change: DigestChange;
  /** Local minute of the day, 0 to 1439. */
  minute: number;
  /** The first minute of the slot the tick is drawn in. */
  slot: number;
  /** Position from the baseline among ticks sharing the slot, oldest lowest. */
  stack: number;
  /** Changes merged in the same minute, this one included. */
  sameMinute: number;
}

function localMinute(change: DigestChange) {
  const at = new Date(change.commit.committedAt);
  return Number.isNaN(at.getTime()) ? null : at.getHours() * 60 + at.getMinutes();
}

/**
 * One tick per change at its local minute; ticks sharing a slot of `slotMinutes` stack upward, so
 * a slot as narrow as a drawn tick never overlaps another. A change without a readable time draws
 * no tick. O(n log n).
 */
export function dayTicks(changes: readonly DigestChange[], slotMinutes = 1): DayTick[] {
  const slotWidth = Math.max(1, Math.floor(slotMinutes));
  const timed = changes.flatMap(change => {
    const minute = localMinute(change);
    return minute === null ? [] : [{ change, minute, at: Date.parse(change.commit.committedAt) }];
  }).sort((a, b) => a.at - b.at);
  const perMinute = new Map<number, number>();
  for (const { minute } of timed) perMinute.set(minute, (perMinute.get(minute) ?? 0) + 1);
  const height = new Map<number, number>();
  return timed.map(({ change, minute }) => {
    const slot = Math.min(MINUTES_PER_DAY - slotWidth, minute - (minute % slotWidth));
    const stack = height.get(slot) ?? 0;
    height.set(slot, stack + 1);
    return { change, minute, slot, stack, sameMinute: perMinute.get(minute) ?? 1 };
  });
}

export interface TimelineColumn {
  /** First and last local dates the column covers, inside the period. */
  start: string;
  end: string;
  /** Newest first. */
  changes: DigestChange[];
}

function addDays(date: string, days: number) {
  const next = new Date(`${date}T00:00:00`);
  next.setDate(next.getDate() + days);
  return localDate(next);
}

/** Columns of whole days, or weeks starting Monday clipped to the period. O(days + changes). */
export function timelineColumns(changes: readonly DigestChange[], range: BriefingRange, unit: 'day' | 'week'): TimelineColumn[] {
  const columns: TimelineColumn[] = [];
  const columnOf = new Map<string, number>();
  for (let date = range.start; date <= range.end; date = addDays(date, 1)) {
    const monday = new Date(`${date}T00:00:00`).getDay() === 1;
    if (unit === 'day' || !columns.length || monday) columns.push({ start: date, end: date, changes: [] });
    const column = columns[columns.length - 1];
    column.end = date;
    columnOf.set(date, columns.length - 1);
  }
  const newest = [...changes].sort((a, b) => (Date.parse(b.commit.committedAt) || 0) - (Date.parse(a.commit.committedAt) || 0));
  for (const change of newest) {
    const at = new Date(change.commit.committedAt);
    const index = Number.isNaN(at.getTime()) ? undefined : columnOf.get(localDate(at));
    if (index !== undefined) columns[index].changes.push(change);
  }
  return columns;
}
