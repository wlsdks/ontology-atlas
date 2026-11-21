/**
 * Cancelling a file/folder picker is not a failure: it returns quietly to the state before the picker
 * instead of showing the browser's "user aborted" in danger red. `err instanceof DOMException &&
 * err.name === 'AbortError'` leaks in two cases: a DOMException from another realm (iframe, worker,
 * extension) fails `instanceof`, and Tauri commands reject `Err(String)` as a plain string. So the test
 * drops to the name and the message. Misclassifying a cancellation as an error costs more than the reverse.
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
