/**
 * Reads the dates a wiki page records (`compiled_at`) the same way on the web and in the app. Pure,
 * so the Library's ranking and the scripts that measure it load it without the vault entity.
 */

export const DAY_MS = 86_400_000;
/** The earliest day a recorded date is believed: 2000-01-01. */
const MIN_DAY = 10_957;

export function runtimeOffset(epochMs: number): number {
  return -new Date(epochMs).getTimezoneOffset();
}

export function localDay(epochMs: number, offsetMinutes: (epochMs: number) => number): number {
  return Math.floor((epochMs + offsetMinutes(epochMs) * 60_000) / DAY_MS);
}

/** Day number of a calendar date; `Date.UTC` is arithmetic here, not a zone. */
export function dayOfDate(year: number, month: number, day: number): number {
  return Math.floor(Date.UTC(year, month - 1, day) / DAY_MS);
}

export function isoDay(day: number): string {
  return new Date(day * DAY_MS).toISOString().slice(0, 10);
}

/**
 * ISO 8601 only: a date, or a date-time with `T`, optional seconds and fraction, and an optional `Z`
 * or offset. `Date.parse` is not used, because engines disagree on anything else (V8 reads
 * `build 12` as 2001-12-01), and the web and the app must draw the same line.
 */
const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,9}))?)?(?:(Z)|([+-])(\d{2}):?(\d{2}))?)?$/;

/**
 * The local day index a recorded `compiled_at` falls on, or null when it is not an ISO date or
 * falls before 2000. A bare `YYYY-MM-DD` or a date-time with no zone is the day as written; a zoned
 * timestamp is placed by its instant.
 */
export function recordedLocalDay(
  value: string,
  offsetMinutes: (epochMs: number) => number = runtimeOffset,
): number | null {
  const parts = recordedParts(value);
  if (!parts) return null;
  const day = parts.zoneMinutes === null
    ? parts.date
    : localDay(parts.date * DAY_MS + parts.timeMs - parts.zoneMinutes * 60_000, offsetMinutes);
  return day < MIN_DAY ? null : day;
}

/**
 * A recorded `compiled_at` as epoch ms, read by the rules `recordedLocalDay` uses, or null. A bare
 * date is that local day's midnight and a date-time with no zone is local wall time.
 */
export function recordedInstantMs(
  value: string,
  offsetMinutes: (epochMs: number) => number = runtimeOffset,
): number | null {
  if (recordedLocalDay(value, offsetMinutes) === null) return null;
  const parts = recordedParts(value)!;
  const asWritten = parts.date * DAY_MS + parts.timeMs;
  if (parts.zoneMinutes !== null) return asWritten - parts.zoneMinutes * 60_000;
  const guess = asWritten - offsetMinutes(asWritten) * 60_000;
  return asWritten - offsetMinutes(guess) * 60_000;
}

interface RecordedParts {
  date: number;
  timeMs: number;
  /** Minutes east of UTC; null when the value names no zone. */
  zoneMinutes: number | null;
}

function recordedParts(value: string): RecordedParts | null {
  const match = ISO_DATE.exec(value);
  if (!match) return null;
  const [, year, month, day, hour, minute, second, fraction, zulu, sign, zoneHour, zoneMinute] = match;
  const date = dayOfDate(Number(year), Number(month), Number(day));
  // `Date.UTC` rolls 2026-02-30 into March; a date that rolled is not a date.
  if (isoDay(date) !== `${year}-${month}-${day}`) return null;
  if (hour === undefined) return { date, timeMs: 0, zoneMinutes: null };
  if (Number(hour) > 23 || Number(minute) > 59 || Number(second ?? 0) > 59) return null;
  const timeMs = ((Number(hour) * 60 + Number(minute)) * 60 + Number(second ?? 0)) * 1000
    + Number((fraction ?? '').slice(0, 3).padEnd(3, '0'));
  // A local time with no zone (Python's `isoformat()`) is the day as written, like a bare date.
  if (!zulu && sign === undefined) return { date, timeMs, zoneMinutes: null };
  if (!zulu && (Number(zoneHour) > 23 || Number(zoneMinute) > 59)) return null;
  return { date, timeMs, zoneMinutes: zulu ? 0 : (sign === '-' ? -1 : 1) * (Number(zoneHour) * 60 + Number(zoneMinute)) };
}
