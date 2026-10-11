import { elapsedParts } from '@/shared/lib/agent-activity/elapsed';

/**
 * Duration of a finished task as parts for the messages. Under a second says nothing (a single write
 * lasts 0 ms), so it is left out. One precision at every size: the largest unit, then the next only
 * when not zero.
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
