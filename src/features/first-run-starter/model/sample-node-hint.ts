/**
 * localStorage helpers for the one-time "press a node" hint in sample mode. Permanent, unlike
 * `first-run-starter-dismiss`: after the first node press the lesson has landed.
 */
export const SAMPLE_NODE_HINT_DISMISSED_KEY = 'demo:sample-node-hint-dismissed:v1';

export function readSampleNodeHintDismissed(
  key: string = SAMPLE_NODE_HINT_DISMISSED_KEY,
): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return window.localStorage.getItem(key) === '1';
  } catch {
    // Private mode and the like: the hint reappears, a safe fallback.
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
    /* Private mode: skip. */
  }
}
