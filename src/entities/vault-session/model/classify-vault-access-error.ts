/**
 * Tells a folder the operating system is *protecting* apart from a folder that is merely broken.
 *
 * ⚠️ **Why this exists** (owner report, 2026-08-24, then measured). Picking a folder under Desktop,
 * Documents, Downloads, iCloud Drive or an external volume makes macOS ask for consent. Deny it — or
 * have an ad-hoc build whose identity macOS no longer recognises — and the read fails with
 * `Operation not permitted (os error 1)`. That raw string went straight to the screen under the
 * generic `access-failed` code, which told the person nothing they could act on: it names an errno,
 * not a folder, and never mentions that the fix is a checkbox in System Settings.
 *
 * The consequence was worse than an unhelpful sentence. Earlier the app sat on its "moving to the
 * local docs picker" frame forever against a TCC-blocked vault, because nothing in the product
 * distinguished "you have not allowed this yet" from "this folder is gone".
 *
 * **Recognition is by errno text, not by path.** Guessing from the path — "this looks like it is
 * under Documents" — would be wrong in both directions: a protected folder can sit anywhere the user
 * has moved it, and an ordinary project inside Documents needs no warning once consent is granted.
 * The operating system already answered the question; this reads its answer.
 */
import { MISSING_TARGET_SIGNATURES, PERMISSION_DENIED_SIGNATURES } from '@/shared/lib/failure-code';

export type VaultAccessErrorKind = 'permission-denied' | 'unknown';

/**
 * The signature tables live in `@/shared/lib/failure-code`, which is where every other catch site
 * reads them from. Two copies of "what a refusal looks like" would drift the first time an errno
 * was added to one of them, and the screens they feed would then disagree about the same failure.
 */
const DENIED_SIGNATURES: readonly string[] = PERMISSION_DENIED_SIGNATURES;

export function classifyVaultAccessError(message: unknown): VaultAccessErrorKind {
  const text = typeof message === 'string' ? message : messageOf(message);
  if (!text) return 'unknown';
  const lowered = text.toLowerCase();
  return DENIED_SIGNATURES.some((signature) => lowered.includes(signature))
    ? 'permission-denied'
    : 'unknown';
}

/**
 * The folder name to name on screen, so the sentence points at something the person recognises
 * rather than at an absolute path they must read character by character.
 *
 * Returns `null` when there is no path to name — the copy then falls back to a sentence that works
 * without one, because a screen that says "allow access to " is worse than one that never promised
 * a name.
 */
export function deniedFolderName(rootPath: string | null | undefined): string | null {
  if (typeof rootPath !== 'string') return null;
  const trimmed = rootPath.trim().replace(/[/\\]+$/, '');
  if (!trimmed) return null;
  const name = trimmed.split(/[/\\]/).pop();
  return name ? name : null;
}

/** Shared with every other catch site — see the note on `DENIED_SIGNATURES` above. */
const MISSING_SIGNATURES: readonly string[] = MISSING_TARGET_SIGNATURES;

/**
 * Is this failure "the folder is gone" rather than "the read broke"?
 *
 * Kept separate from `classifyVaultAccessError` because the two answer different questions and the
 * remedies differ: a protected folder is allowed in System Settings, a missing one is chosen again.
 * The desktop already reports the missing case as `path-missing` through a path preflight; the web
 * has no path to preflight, so it has to read the exception instead.
 */
export function isMissingFolderError(error: unknown): boolean {
  if (error instanceof Error && error.name === 'NotFoundError') return true;
  const text = typeof error === 'string' ? error : messageOf(error);
  if (!text) return false;
  const lowered = text.toLowerCase();
  return MISSING_SIGNATURES.some((signature) => lowered.includes(signature));
}

function messageOf(error: unknown): string {
  if (error instanceof Error) return error.message;
  return '';
}
