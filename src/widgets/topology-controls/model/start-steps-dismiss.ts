/**
 * Whether the first-steps card has been **dismissed** — per session.
 *
 * `localStorage` is avoided for the same reason as the neighbouring card
 * (`first-run-starter`): 「I'll do it later」 means "not now", not
 * **never again**. Reopening the app should guide the first steps again — and it is
 * dismissed again once the last step is passed.
 *
 * The read and write functions are exactly the ones that card already has (only the
 * key differs) — implementing the same policy twice guarantees a day when only one
 * of them gets fixed.
 */
export const VAULT_START_STEPS_DISMISSED_KEY = 'demo:vault-start-steps-dismissed:v1';
