import { gitHostPlatformFrom } from '@/shared/lib/git/git-install-guide';
import { definePreference } from '@/shared/lib/preferences/define-preference';

/** Pure, so the rules of when to speak up are testable. The user did not ask, so it is easy to dismiss and the dismissal is remembered. */

export type UpdatePhase =
  | { kind: 'idle' }
  /** Checking. This stage is **never drawn** — the user did not ask for it. */
  | { kind: 'checking' }
  /** Up to date. Visible only when the user pressed check themselves. */
  | { kind: 'current' }
  | { kind: 'available'; version: string; notes: string | null }
  | { kind: 'downloading'; version: string; received: number; total: number | null }
  | { kind: 'ready'; version: string }
  | { kind: 'failed'; operation: 'check' | 'install'; message: string };

/** An app left open for days still hears about a release within a working session. */
export const CHECK_INTERVAL_MS = 4 * 60 * 60 * 1000;

/** How often an open app asks itself whether a check is due; at most one automatic request per tick. */
export const AUTO_CHECK_TICK_MS = 30 * 60 * 1000;

/**
 * A tick may land a little under a full tick after the last request (the entry check runs a few
 * seconds after mount, timers drift); ticks are a full tick apart, so this still allows one per tick.
 */
const TICK_SLACK_MS = 60_000;

/** A feed that never answers must not hold the only check slot; the updater and the race both use it. */
export const CHECK_TIMEOUT_MS = 30_000;

/** After this many automatic failures in a row, a failing feed is asked only once per interval. */
export const FAILURES_BEFORE_BACKOFF = 2;

/** A dismissal is remembered for that version only — the next version must ask again. */
export const DISMISSED_VERSION_KEY = 'app-update:dismissed-version';
export const LAST_CHECK_KEY = 'app-update:last-check';

export type UpdateAutoCheck = 'on' | 'off';

const updateAutoCheckPreference = definePreference<UpdateAutoCheck>({
  key: 'app-update:auto-check',
  values: ['on', 'off'],
  fallback: 'on',
});

export function readUpdateAutoCheck(): UpdateAutoCheck {
  return updateAutoCheckPreference.read();
}

export function writeUpdateAutoCheck(value: UpdateAutoCheck): void {
  updateAutoCheckPreference.write(value);
}

export function useUpdateAutoCheck(): UpdateAutoCheck {
  return updateAutoCheckPreference.use();
}

export interface AutomaticDueInput {
  readonly now: number;
  readonly lastSuccessAt: number | null;
  readonly lastAttemptAt: number | null;
  readonly consecutiveFailures: number;
}

/**
 * At most one automatic request per tick whatever the outcome; a failing feed is retried one tick
 * later, then only once per interval after {@link FAILURES_BEFORE_BACKOFF} failures until one
 * succeeds. A clock that went backwards is due, or the next check never comes.
 */
export function isAutomaticCheckDue({ now, lastSuccessAt, lastAttemptAt, consecutiveFailures }: AutomaticDueInput): boolean {
  const attemptGapMs =
    (consecutiveFailures >= FAILURES_BEFORE_BACKOFF ? CHECK_INTERVAL_MS : AUTO_CHECK_TICK_MS) - TICK_SLACK_MS;
  if (lastAttemptAt !== null) {
    const sinceAttempt = now - lastAttemptAt;
    if (sinceAttempt >= 0 && sinceAttempt < attemptGapMs) return false;
  }
  if (consecutiveFailures > 0 || lastSuccessAt === null) return true;
  const sinceSuccess = now - lastSuccessAt;
  return sinceSuccess < 0 || sinceSuccess >= CHECK_INTERVAL_MS;
}

/** The update feed serves macOS builds only; elsewhere every automatic request would be refused. */
export function feedServesPlatform(platformOrUserAgent: string): boolean {
  return gitHostPlatformFrom(platformOrUserAgent) === 'macos';
}

export interface CheckPolicyInput extends Partial<Omit<AutomaticDueInput, 'now' | 'lastSuccessAt'>> {
  readonly isDesktop: boolean;
  readonly now: number;
  readonly lastCheckedAt: number | null;
  readonly automatic: boolean;
  /** Did the user press it in settings themselves? Then the interval is ignored. */
  readonly manual?: boolean;
  readonly feedServesPlatform?: boolean;
}

/** Never on the web, where a tab cannot replace itself. A press checks on any platform. */
export function shouldCheckForUpdate({
  isDesktop,
  now,
  lastCheckedAt,
  automatic,
  manual = false,
  lastAttemptAt = null,
  consecutiveFailures = 0,
  feedServesPlatform: servesPlatform = true,
}: CheckPolicyInput): boolean {
  if (!isDesktop) return false;
  if (manual) return true;
  if (!automatic || !servesPlatform) return false;
  return isAutomaticCheckDue({ now, lastSuccessAt: lastCheckedAt, lastAttemptAt, consecutiveFailures });
}

/** A dismissal means "not now" and expires when the version goes up. */
export function shouldSurfaceVersion(version: string, dismissedVersion: string | null): boolean {
  if (!version) return false;
  return version !== dismissedVersion;
}

/**
 * An automatic result never moves the state backwards or sideways: it may replace only a
 * phase that shows no work in progress and no answer waiting for the person.
 */
export function canAutomaticResultReplace(phase: UpdatePhase): boolean {
  return (
    phase.kind === 'idle' ||
    phase.kind === 'current' ||
    (phase.kind === 'failed' && phase.operation === 'check')
  );
}

export interface CheckResultInput {
  readonly found: { version: string; notes: string | null } | null;
  readonly manual: boolean;
  readonly phase: UpdatePhase;
  readonly readyVersion: string | null;
  readonly dismissedVersion: string | null;
}

/**
 * The phase a finished check moves to, or `null` to leave the screen alone. A version already
 * installed in this session is never offered for download again: asked for, it shows the
 * restart; unasked, it stays silent.
 */
export function phaseAfterCheck({
  found,
  manual,
  phase,
  readyVersion,
  dismissedVersion,
}: CheckResultInput): UpdatePhase | null {
  // A running download is the answer; not even a press replaces it.
  if (phase.kind === 'downloading') return null;
  const newerOnScreen = phase.kind === 'available' && found !== null && found.version !== phase.version;
  if (!manual && !canAutomaticResultReplace(phase) && !newerOnScreen) return null;
  if (!found) return manual ? { kind: 'current' } : null;
  if (found.version === readyVersion) return manual ? { kind: 'ready', version: found.version } : null;
  if (!manual && !shouldSurfaceVersion(found.version, dismissedVersion)) return null;
  return { kind: 'available', version: found.version, notes: found.notes };
}

/** A failed check never hides a restart that is waiting; an automatic failure changes nothing. */
export function phaseAfterFailedCheck({
  manual,
  readyVersion,
  message,
}: {
  manual: boolean;
  readyVersion: string | null;
  message: string;
}): UpdatePhase | null {
  if (!manual) return null;
  if (readyVersion) return { kind: 'ready', version: readyVersion };
  return { kind: 'failed', operation: 'check', message };
}

const BYTES_PER_MEGABYTE = 1024 * 1024;

export function formatMegabytes(bytes: number): string {
  return (Math.max(0, bytes) / BYTES_PER_MEGABYTE).toFixed(1);
}

export { formatDownloadProgress } from '@/shared/lib/locale-text/progress-format';

/** One paragraph of release notes is enough. A popover that becomes reading material goes unread. */
export function summarizeNotes(notes: string | null | undefined, maxChars = 220): string | null {
  if (!notes) return null;
  const firstBlock = notes.trim().split(/\n{2,}/)[0]?.replace(/\s+/g, ' ').trim();
  if (!firstBlock) return null;
  if (firstBlock.length <= maxChars) return firstBlock;
  return `${firstBlock.slice(0, maxChars - 1).trimEnd()}…`;
}
