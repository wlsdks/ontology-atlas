/**
 * The in-app update state machine — pure, with no UI.
 *
 * Why it is separate: what is actually easy to get wrong here is not the drawing but **when to speak
 * up**. Asking too often is noise, failing to remember a dismissal is rude, and drawing a failure as
 * a success is a lie. None of those judgements involve rendering, so they become testable functions here.
 *
 * The nature of this surface — **the app spoke, the user did not ask.** So it does not steal
 * attention, is easy to dismiss, and remembers the dismissal. This app's charter of restraint applies
 * here as everywhere: no glow, no badge, no shake.
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
  /** 실패. 무엇이 실패했는지 말하고, 손으로 받을 길을 남긴다. */
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

/**
 * May it check now?
 *
 * On the web the answer is **never** — a browser tab cannot replace itself, and speaking of updates
 * there proposes something impossible.
 */
export function shouldCheckForUpdate({
  isDesktop,
  now,
  lastCheckedAt,
  manual = false,
}: CheckPolicyInput): boolean {
  if (!isDesktop) return false;
  if (manual) return true;
  if (lastCheckedAt === null) return true;
  // A clock that went backwards (a timezone change, a manual adjustment) is also due. Leaving the
  // elapsed time negative means the next check never comes.
  const elapsed = now - lastCheckedAt;
  return elapsed < 0 || elapsed >= CHECK_INTERVAL_MS;
}

/**
 * May this version be shown to the user?
 *
 * A version already dismissed is not raised again. A dismissal means "not now", not "never", so
 * **the memory expires when the version goes up.**
 */
export function shouldSurfaceVersion(version: string, dismissedVersion: string | null): boolean {
  if (!version) return false;
  return version !== dismissedVersion;
}

/**
 * The progress copy **moved down to `shared/lib`** — the agent tool install needed the same
 * discipline, and when two features on one layer make the same judgement, one layer down is where it
 * belongs. It is re-exported here so existing callers of this module are untouched.
 */
export { formatDownloadProgress } from '@/shared/lib/progress-format';

/** One paragraph of release notes is enough. A popover that becomes reading material goes unread. */
export function summarizeNotes(notes: string | null | undefined, maxChars = 220): string | null {
  if (!notes) return null;
  const firstBlock = notes.trim().split(/\n{2,}/)[0]?.replace(/\s+/g, ' ').trim();
  if (!firstBlock) return null;
  if (firstBlock.length <= maxChars) return firstBlock;
  return `${firstBlock.slice(0, maxChars - 1).trimEnd()}…`;
}
