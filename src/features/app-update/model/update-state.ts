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

/** Once a day. So someone who opens the app often is not asked every time. */
export const CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000;

/** A dismissal is remembered for that version only — the next version must ask again. */
export const DISMISSED_VERSION_KEY = 'app-update:dismissed-version';
export const LAST_CHECK_KEY = 'app-update:last-check';

export interface CheckPolicyInput {
  readonly isDesktop: boolean;
  readonly now: number;
  readonly lastCheckedAt: number | null;
  /** Did the user press it in settings themselves? Then the interval is ignored. */
  readonly manual?: boolean;
}

/** Never on the web, where a tab cannot replace itself. */
export function shouldCheckForUpdate({
  isDesktop,
  now,
  lastCheckedAt,
  manual = false,
}: CheckPolicyInput): boolean {
  if (!isDesktop) return false;
  if (manual) return true;
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

/** Re-exported from `shared/lib`, where the agent tool install shares it. */
export { formatDownloadProgress } from '@/shared/lib/progress-format';

/** One paragraph of release notes is enough. A popover that becomes reading material goes unread. */
export function summarizeNotes(notes: string | null | undefined, maxChars = 220): string | null {
  if (!notes) return null;
  const firstBlock = notes.trim().split(/\n{2,}/)[0]?.replace(/\s+/g, ' ').trim();
  if (!firstBlock) return null;
  if (firstBlock.length <= maxChars) return firstBlock;
  return `${firstBlock.slice(0, maxChars - 1).trimEnd()}…`;
}
