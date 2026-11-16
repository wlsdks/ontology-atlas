import { definePreference } from '@/shared/lib/preferences/define-preference';

/**
 * The in-app update state machine, pure, so the rules of when to speak up are testable. The app
 * spoke, the user did not ask: easy to dismiss, and the dismissal is remembered.
 */

export type UpdatePhase =
  /** Not checked yet, or not the desktop app. Nothing is drawn. */
  | { kind: 'idle' }
  /** Checking. This stage is **never drawn** — the user did not ask for it. */
  | { kind: 'checking' }
  /** Up to date. Visible only when the user pressed check themselves. */
  | { kind: 'current' }
  /** A new version exists. This is the first point at which it speaks. */
  | { kind: 'available'; version: string; notes: string | null }
  /** Downloading. It states only as much of the progress as it knows. */
  | { kind: 'downloading'; version: string; received: number; total: number | null }
  /** Installed. All that remains is a restart. */
  | { kind: 'ready'; version: string }
  /** Failure. State what failed, and leave a path for manual handling. */
  | { kind: 'failed'; operation: 'check' | 'install'; message: string };

/** An app left open for days still hears about a release within a working session. */
export const CHECK_INTERVAL_MS = 4 * 60 * 60 * 1000;

/** How often an open app asks itself whether a check is due; the interval above decides. */
export const AUTO_CHECK_TICK_MS = 30 * 60 * 1000;

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

export interface CheckPolicyInput {
  readonly isDesktop: boolean;
  readonly now: number;
  readonly lastCheckedAt: number | null;
  readonly automatic: boolean;
  /** Did the user press it in settings themselves? Then the interval is ignored. */
  readonly manual?: boolean;
}

/** Never on the web, where a tab cannot replace itself. */
export function shouldCheckForUpdate({
  isDesktop,
  now,
  lastCheckedAt,
  automatic,
  manual = false,
}: CheckPolicyInput): boolean {
  if (!isDesktop) return false;
  if (manual) return true;
  if (!automatic) return false;
  if (lastCheckedAt === null) return true;
  // A clock that went backwards is also due, or the next check never comes.
  const elapsed = now - lastCheckedAt;
  return elapsed < 0 || elapsed >= CHECK_INTERVAL_MS;
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
  /** The version the feed offers, or `null` when this build is current. */
  readonly found: { version: string; notes: string | null } | null;
  readonly manual: boolean;
  readonly phase: UpdatePhase;
  /** Installed in this session and waiting for a restart. */
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
  if (!manual && !canAutomaticResultReplace(phase)) return null;
  if (!found) return manual ? { kind: 'current' } : null;
  if (found.version === readyVersion) return manual ? { kind: 'ready', version: found.version } : null;
  if (!manual && !shouldSurfaceVersion(found.version, dismissedVersion)) return null;
  return { kind: 'available', version: found.version, notes: found.notes };
}

const BYTES_PER_MEGABYTE = 1024 * 1024;

/** Megabytes with one decimal, the precision a download line can honestly move by. */
export function formatMegabytes(bytes: number): string {
  return (Math.max(0, bytes) / BYTES_PER_MEGABYTE).toFixed(1);
}

/** Re-exported from `shared/lib`, where the agent tool install shares it. */
export { formatDownloadProgress } from '@/shared/lib/locale-text/progress-format';

/** One paragraph of release notes is enough. A popover that becomes reading material goes unread. */
export function summarizeNotes(notes: string | null | undefined, maxChars = 220): string | null {
  if (!notes) return null;
  const firstBlock = notes.trim().split(/\n{2,}/)[0]?.replace(/\s+/g, ' ').trim();
  if (!firstBlock) return null;
  if (firstBlock.length <= maxChars) return firstBlock;
  return `${firstBlock.slice(0, maxChars - 1).trimEnd()}…`;
}
