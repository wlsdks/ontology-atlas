/**
 * The dismiss policy for the INDEX panel's "get started" module — pure
 * sessionStorage (per tab/session) read/write helpers.
 *
 * Why not localStorage: "I'll just look around" is a dismiss, not an opt-out. The
 * guidance reappearing in a new session (a freshly opened browser) is the correct
 * contract — an owner decision (the approved docstring in
 * `docs/prototypes/first-run-v3-flagship.html`). It is a different axis from
 * permanent vault restoration (its own contract — the vault state in `RootEntryPage`
 * and `useDataSourceMode`).
 */
export const FIRST_RUN_STARTER_DISMISSED_KEY = 'demo:first-run-starter-dismissed:v1';

export function readFirstRunStarterDismissed(
  key: string = FIRST_RUN_STARTER_DISMISSED_KEY,
): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return window.sessionStorage.getItem(key) === '1';
  } catch {
    // Private mode and the like — failing to remember the dismiss only means the module
    // appears again, which is a safe fallback.
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
    /* Private mode — skip; the next click simply tries again. */
  }
}
