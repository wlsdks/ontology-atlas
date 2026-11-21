/**
 * Decides whether an `hdiutil create` failure is worth another attempt. `hdiutil: create failed -
 * Resource busy` is transient (the runner's indexing, an antivirus pass or a still-attached volume of
 * the same name holds the folder open), and as the last step before staging it would skip both publish jobs.
 * The retry is conditional: a blind retry would report an unsignable bundle or a full disk three times
 * with the last error. Matching is on text, not exit code, because `hdiutil` exits 1 for everything; it
 * is case-insensitive across both streams ("Resource busy" from `create`, "resource temporarily
 * unavailable" from the attach path).
 */

/**
 * Failure texts that mean "something held the file for a moment", not "this cannot
 * work". Kept as an explicit list so adding one is a deliberate, reviewable act.
 */
const TRANSIENT_PATTERNS = [
  /resource busy/i,
  /resource temporarily unavailable/i,
  /device busy/i,
  /operation timed out/i,
  /^hdiutil: create failed - (?:.*\b)?busy/im,
];

/**
 * @param {{ stdout?: string | null, stderr?: string | null }} output
 * @returns {boolean} true when another attempt is worth making.
 */
export function isTransientHdiutilFailure(output) {
  const text = `${output?.stdout ?? ''}\n${output?.stderr ?? ''}`;
  if (text.trim().length === 0) return false;
  return TRANSIENT_PATTERNS.some((pattern) => pattern.test(text));
}

/**
 * A stale mount of the same volume name is the most common holder, and it survives
 * the process that made it. Detaching it is best-effort: if there is nothing mounted
 * the command fails harmlessly, and the retry is attempted either way.
 *
 * @param {string} volumeName
 * @returns {string} the path a caller should try to detach.
 */
export function stalePathForVolume(volumeName) {
  return `/Volumes/${volumeName}`;
}
