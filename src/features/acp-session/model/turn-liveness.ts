/**
 * Is a turn that has not answered yet still **alive**?
 *
 * `prompt` has no timeout, because a turn sweeping a codebase can take minutes, so a
 * turn that stopped answering looks exactly like a working one. A working turn emits
 * `session/update` constantly; silence far longer than any gap means it stopped talking.
 *
 * This module is pure. The caller supplies the clock, so the decision is testable without waiting.
 */

/**
 * ⚠️ Not a guess at how long a turn takes — a turn may run for many minutes and stay live the whole
 * way, because it keeps emitting updates. This is how long a turn may stay **silent**.
 *
 * The longest observed gap between updates in a real sweep was a single `analyze_repo_structure`
 * call over 1,419 files, which is seconds. Ninety seconds is well above any real gap and well below
 * the thirteen minutes a person sat locked out.
 */
export const TURN_SILENCE_LIMIT_MS = 90_000;

export type TurnLiveness = 'idle' | 'working' | 'awaiting-answer' | 'silent';

/**
 * @param status the session status; only `thinking` can be judged
 * @param lastUpdateAt epoch ms of the most recent `session/update`, or of the send that opened the
 *   turn when none has arrived yet. `null` means no turn is open.
 * @param now epoch ms
 * @param awaitingAnswer a permission request is on screen, waiting for the person
 */
export function turnLiveness(
  status: string,
  lastUpdateAt: number | null,
  now: number,
  awaitingAnswer = false,
  limitMs: number = TURN_SILENCE_LIMIT_MS,
): TurnLiveness {
  if (status !== 'thinking') return 'idle';
  /*
   * ⚠️ **The ball is in the person's court, so silence is theirs, not the agent's.** Caught in the
   * installed rc.12 build: a permission card sat on screen while the notice underneath said the
   * agent had gone quiet for three minutes. Updates genuinely stop while an answer is awaited, so
   * the check below sees a stall — but the wait is already explained by the card, and telling
   * somebody that nothing is happening while they are the thing that is not happening is worse than
   * saying nothing.
   */
  if (awaitingAnswer) return 'awaiting-answer';
  // ⚠️ No timestamp means the turn just opened, not that it has been silent forever. Reading a
  // missing clock as "silent" would flag every turn the instant it started.
  if (lastUpdateAt === null) return 'working';
  return now - lastUpdateAt >= limitMs ? 'silent' : 'working';
}
