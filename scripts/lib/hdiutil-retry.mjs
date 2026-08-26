/**
 * Decides whether an `hdiutil create` failure is worth another attempt.
 *
 * ⚠️ **Why this exists — one flaky line cost a whole signed release.** rc.15 built,
 * signed and notarized on aarch64 and then died on x64 with:
 *
 * ```text
 * hdiutil: create failed - Resource busy
 * [desktop-release-artifact] package DMG failed with exit 1
 * ```
 *
 * Nothing was wrong with the build. `hdiutil` is reading a folder that the runner's
 * own indexing, an antivirus pass, or a still-attached volume of the same name is
 * holding open, and the window is milliseconds wide. Because the DMG is the last step
 * before staging, the two publish jobs were skipped and the release had to be
 * dispatched again from the beginning — the same shape of waste as the ACP registry
 * gate: a green product stopped by machine weather.
 *
 * ⚠️ **Why the retry is conditional and not a loop around every failure.** A blind
 * retry is worse than none: a genuinely unsignable bundle, a missing app, or a full
 * disk would be attempted three times and then reported with the *last* error, which
 * hides both the cause and the fact that it never varied. Only failures whose text
 * names a busy or locked resource are transient; everything else fails on the first
 * attempt exactly as before.
 *
 * ⚠️ **Why the matching is on text rather than exit code.** `hdiutil` exits 1 for
 * everything. The distinguishing information is only in the message, so that is what
 * is read — and it is read case-insensitively across both streams, because the same
 * condition is reported as "Resource busy" by `create` and as "resource temporarily
 * unavailable" by the attach path underneath it.
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
