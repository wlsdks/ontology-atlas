/**
 * sessionStorage helpers for dismissing the INDEX "get started" module. Not localStorage: looking
 * around is a dismiss, not an opt-out, so the guidance returns in a new session (the approved
 * docstring in `docs/prototypes/first-run-v3-flagship.html`).
 */
export const FIRST_RUN_STARTER_DISMISSED_KEY = 'demo:first-run-starter-dismissed:v1';

export function readFirstRunStarterDismissed(
  key: string = FIRST_RUN_STARTER_DISMISSED_KEY,
): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return window.sessionStorage.getItem(key) === '1';
  } catch {
    // Private mode and the like: the module appears again, a safe fallback.
    return false;
  }
}

export function writeFirstRunStarterDismissed(
  key: string = FIRST_RUN_STARTER_DISMISSED_KEY,
): void {
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage.setItem(key, '1');
  } catch {
    /* Private mode: skip; the next click tries again. */
  }
}
