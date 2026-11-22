/**
 * Work still arriving shimmers (`.acp-working-shimmer`, `app/globals.css`); landed work is still.
 * These functions pick the state, so every caller asks the same question and tests need no render.
 */
export const WORKING_SHIMMER_CLASS = 'acp-working-shimmer';

export function workingShimmer(live: boolean): string | undefined {
  return live ? WORKING_SHIMMER_CLASS : undefined;
}

/**
 * Whether the composer's status words are the agent working: only `thinking`. `awaiting` is the
 * agent blocked on the person, and a sweeping band there would say the opposite; a silent turn has
 * its own sentence, and animating over it would claim output that is not arriving.
 */
export function composerStatusLive(footerStatus: string, silent: boolean): boolean {
  return footerStatus === 'thinking' && !silent;
}

/**
 * What a tool row is doing: `running` sweeps; `awaiting` is a call open but blocked on the person's
 * permission answer, so it is still and says so; `settled` is every row whose call landed or was
 * abandoned.
 */
export type ToolRowPhase = 'running' | 'awaiting' | 'settled';

export function toolRowPhase(running: boolean, awaitingPermission: boolean): ToolRowPhase {
  if (!running) return 'settled';
  return awaitingPermission ? 'awaiting' : 'running';
}
