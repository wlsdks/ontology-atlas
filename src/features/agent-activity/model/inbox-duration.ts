import { elapsedParts } from '@/shared/lib/elapsed';

/**
 * What a finished task's duration says in the bell inbox, as parts the messages word.
 *
 * ⚠️ **Under a second says nothing** (owner review, 2026-09-26). The duration runs from a
 * task's first change to its last, so a task that wrote once lasted 0 ms and its row read
 * "Claude Code · 0s · 3 days ago": a number with no information in it, standing where a
 * reader looks for how long the work took. It is left out instead.
 *
 * **One precision at every size.** The largest unit, then the next one only when it is not
 * zero: 45s, 2m 5s, 2m, 1h 5m, 1h. The inbox used to drop the seconds from minutes but keep
 * the minutes of an hour, zero included ("1h 0m"), and the live status beside it already
 * counts in the same two units.
 */
type InboxDuration =
  | { unit: 'seconds'; seconds: number }
  | { unit: 'minutes'; minutes: number; seconds: number }
  | { unit: 'hours'; hours: number; minutes: number };

/** The shortest duration worth a word. */
const INBOX_DURATION_FLOOR_MS = 1000;

export function inboxDuration(ms: number): InboxDuration | null {
  if (!Number.isFinite(ms) || ms < INBOX_DURATION_FLOOR_MS) return null;
  const { hours, minutes, seconds } = elapsedParts(ms);
  if (hours > 0) return { unit: 'hours', hours, minutes };
  if (minutes > 0) return { unit: 'minutes', minutes, seconds };
  return { unit: 'seconds', seconds };
}
