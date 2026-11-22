const MINUTE_S = 60;
const HOUR_S = 60 * MINUTE_S;
const DAY_S = 24 * HOUR_S;

/** A clock time in the reader's own zone, with the date when it is not today, for when a session started or a worktree was locked. */
export function clockTime(epochMs: number, nowMs: number, locale: string): string {
  const today = new Date(epochMs).toDateString() === new Date(nowMs).toDateString();
  const date: Intl.DateTimeFormatOptions = today ? {} : { month: 'short', day: 'numeric' };
  return new Intl.DateTimeFormat(locale, { ...date, hour: '2-digit', minute: '2-digit' }).format(epochMs);
}

/** `3 hours ago`: the largest whole unit, so a glance reads the age without arithmetic. */
export function timeAgo(epochSeconds: number, nowMs: number, locale: string): string {
  const elapsed = Math.max(0, Math.round(nowMs / 1000 - epochSeconds));
  const format = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' });
  if (elapsed < HOUR_S) return format.format(-Math.max(1, Math.round(elapsed / MINUTE_S)), 'minute');
  if (elapsed < DAY_S) return format.format(-Math.round(elapsed / HOUR_S), 'hour');
  return format.format(-Math.round(elapsed / DAY_S), 'day');
}
