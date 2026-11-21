/** Is a turn that has not answered still alive? `prompt` has no timeout, so a stopped turn looks like a working one, which emits `session/update` constantly. Pure: the caller supplies the clock. */

/** How long a turn may stay silent, not how long it may run: the longest observed gap in a sweep (`analyze_repo_structure` over 1,419 files) was seconds. */
export const TURN_SILENCE_LIMIT_MS = 90_000;

export type TurnLiveness = 'idle' | 'working' | 'awaiting-answer' | 'silent';

/** `lastUpdateAt` is the latest `session/update`, or the send that opened the turn; null means no turn is open. Only `thinking` can be judged. */
export function turnLiveness(
  status: string,
  lastUpdateAt: number | null,
  now: number,
  awaitingAnswer = false,
  limitMs: number = TURN_SILENCE_LIMIT_MS,
): TurnLiveness {
  if (status !== 'thinking') return 'idle';
  // Updates genuinely stop while a permission card awaits an answer; the wait is the person's, and saying nothing is happening would blame the agent.
  if (awaitingAnswer) return 'awaiting-answer';
  // No timestamp means the turn just opened; reading it as silent would flag every turn at once.
  if (lastUpdateAt === null) return 'working';
  return now - lastUpdateAt >= limitMs ? 'silent' : 'working';
}
