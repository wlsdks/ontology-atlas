/**
 * Tells a macOS-protected folder (consent denied) apart from a merely broken one.
 * Recognition is by errno text, not path: a protected folder can be anywhere.
 */
import { MISSING_TARGET_SIGNATURES, PERMISSION_DENIED_SIGNATURES } from '@/shared/lib/failures/failure-code';

export type VaultAccessErrorKind = 'permission-denied' | 'unknown';

/**
 * The signature tables live in `@/shared/lib/failures/failure-code`, which is where every other catch site
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
