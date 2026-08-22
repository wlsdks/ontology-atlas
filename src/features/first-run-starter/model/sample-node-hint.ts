/**
 * The dismiss policy for the one-time "press a node on the map" hint on a first visit
 * in sample mode — pure localStorage read/write helpers.
 *
 * Unlike `first-run-starter-dismiss` (sessionStorage — "I'll just look around" rightly
 * reappears each session), this uses **localStorage (permanent)**: showing the hint
 * again on every visit to someone who has already pressed a node and experienced that
 * "everything is a real document" is nagging. The first click is the lesson landing.
 * A different axis of contract from the session hint.
 */
export const SAMPLE_NODE_HINT_DISMISSED_KEY = 'demo:sample-node-hint-dismissed:v1';

export function readSampleNodeHintDismissed(
  key: string = SAMPLE_NODE_HINT_DISMISSED_KEY,
): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return window.localStorage.getItem(key) === '1';
  } catch {
    // Private mode and the like — the hint simply reappears, which is a safe fallback.
    return false;
  }
}

export function writeSampleNodeHintDismissed(
  key: string = SAMPLE_NODE_HINT_DISMISSED_KEY,
): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(key, '1');
  } catch {
    /* private mode — skip */
  }
}
