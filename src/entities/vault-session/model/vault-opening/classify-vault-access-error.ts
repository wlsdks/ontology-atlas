/**
 * Tells a macOS-protected folder (consent denied) apart from a merely broken one.
 * Recognition is by errno text, not path: a protected folder can be anywhere.
 */
import { MISSING_TARGET_SIGNATURES, PERMISSION_DENIED_SIGNATURES } from '@/shared/lib/failures/failure-code';

export type VaultAccessErrorKind = 'permission-denied' | 'unknown';

// The signature tables live in `failure-code`, where every other catch site reads them: two copies would drift and the screens would disagree about one failure.
const DENIED_SIGNATURES: readonly string[] = PERMISSION_DENIED_SIGNATURES;

export function classifyVaultAccessError(message: unknown): VaultAccessErrorKind {
  const text = typeof message === 'string' ? message : messageOf(message);
  if (!text) return 'unknown';
  const lowered = text.toLowerCase();
  return DENIED_SIGNATURES.some((signature) => lowered.includes(signature))
    ? 'permission-denied'
    : 'unknown';
}

/** The folder name to show instead of an absolute path; null when there is no path, and the copy then works without one ("allow access to " would be worse). */
export function deniedFolderName(rootPath: string | null | undefined): string | null {
  if (typeof rootPath !== 'string') return null;
  const trimmed = rootPath.trim().replace(/[/\\]+$/, '');
  if (!trimmed) return null;
  const name = trimmed.split(/[/\\]/).pop();
  return name ? name : null;
}

const MISSING_SIGNATURES: readonly string[] = MISSING_TARGET_SIGNATURES;

/** Separate from `classifyVaultAccessError`: a protected folder is allowed in System Settings, a missing one is chosen again. The desktop reports "missing" as `path-missing` through a path preflight; the web has none, so it reads the exception. */
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
