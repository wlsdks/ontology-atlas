/**
 * **Cancelling a file/folder picker is not a failure.**
 *
 * Found in the entry review: simply cancelling the folder picker put
 * "user aborted" — the browser's own string — in danger red inside the card.
 * Cancelling is the user's intended, normal exit, so there is no reason to raise
 * an error surface; it should return quietly to the state just before the picker
 * opened.
 *
 * Letting each caller decide with
 * `err instanceof DOMException && err.name === 'AbortError'` leaks in two places,
 * both of which occur in practice:
 *
 * 1. **A DOMException from another realm** — exceptions thrown by an iframe,
 *    worker or extension fail `instanceof`, because their constructor belongs to
 *    a different realm.
 * 2. **Cancellations that are not DOMExceptions** — Tauri commands reject
 *    `Err(String)` as a plain string, and polyfills throw an ordinary `Error`.
 *
 * So the test drops from "the constructor" to **the name and the message**.
 * Misclassifying a cancellation as an error costs the user more than the
 * reverse: the first puts a red warning on a normal action, while the second
 * quietly returns to the previous state.
 */
const ABORT_NAME = 'AbortError';
/** The browser's own wording — the fallback test for paths that lose the name (a string reject). */
const ABORT_MESSAGE = /\buser\s+aborted\b/i;

export function isPickerAbort(err: unknown): boolean {
  if (err === null || err === undefined) return false;
  if (typeof err === 'string') return ABORT_MESSAGE.test(err);
  const candidate = err as { name?: unknown; message?: unknown };
  if (candidate.name === ABORT_NAME) return true;
  return typeof candidate.message === 'string' && ABORT_MESSAGE.test(candidate.message);
}
