/**
 * A failure reaches a person as a code, never as the developer's English: a thrown string cannot be
 * translated, so the thrower mints a code and the screen owns the sentence (as `native-error.ts`
 * does for Tauri). OS text is matched against the signature tables below, which
 * `classify-vault-access-error.ts` also reads. With no code the screen shows its own sentence.
 */

/**
 * As `std::io::Error::to_string()` and the browser render them. `EPERM` (macOS TCC) and `EACCES`
 * reach a person the same way with the same remedy, so they share one code.
 */
export const PERMISSION_DENIED_SIGNATURES = [
  'operation not permitted',
  'permission denied',
  'os error 1)',
  'os error 13)',
] as const;

/** The browser's `NotFoundError` and Rust's `os error 2` word the same fact differently. */
export const MISSING_TARGET_SIGNATURES = [
  'notfounderror',
  'no such file or directory',
  'os error 2)',
  'could not be found',
] as const;

const ALREADY_EXISTS_SIGNATURES = [
  'already exists',
  'file exists',
  'os error 17)',
] as const;

/** `detail` is machine fact only (a path, an OS error) and stays English; prose would be untranslatable. */
export class CodedFailure extends Error {
  readonly code: string;
  readonly detail: string | null;

  constructor(code: string, detail?: string | null) {
    super(detail ? `${code}: ${detail}` : code);
    this.name = 'CodedFailure';
    this.code = code;
    this.detail = detail && detail.trim() ? detail.trim() : null;
  }
}

/** Mint a failure the screen can translate. Prefer this over `throw new Error('sentence')`. */
export function codedFailure(code: string, detail?: string | null): CodedFailure {
  return new CodedFailure(code, detail);
}

function textOf(error: unknown): string {
  if (typeof error === 'string') return error;
  if (error instanceof Error) return `${error.name} ${error.message}`;
  if (error && typeof error === 'object' && 'message' in error) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === 'string') return message;
  }
  return '';
}

function matches(text: string, signatures: readonly string[]): boolean {
  const lowered = text.toLowerCase();
  return signatures.some((signature) => lowered.includes(signature));
}

/**
 * The code this failure should be translated by, or `null` when nothing recognised it.
 *
 * A bare kebab-case string is accepted and returned as-is so a hook can hand a code it
 * already stored (`actionError`) to the same lookup a raw rejection goes through.
 */
export function failureCodeOf(error: unknown): string | null {
  if (error instanceof CodedFailure) return error.code;
  if (typeof error === 'string' && /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/.test(error)) return error;
  const text = textOf(error);
  if (!text) return null;
  if (matches(text, PERMISSION_DENIED_SIGNATURES)) return 'permission-denied';
  if (matches(text, MISSING_TARGET_SIGNATURES)) return 'target-missing';
  if (matches(text, ALREADY_EXISTS_SIGNATURES)) return 'already-exists';
  return null;
}

/**
 * The English fact behind the failure, for a place a developer reads — a `data-*`
 * attribute, the console, a technical-information fold. **Never for the page body.**
 */
export function failureDetailOf(error: unknown): string | null {
  if (error instanceof CodedFailure) return error.detail;
  if (typeof error === 'string') return error.trim() || null;
  if (error instanceof Error) return error.message.trim() || null;
  return null;
}
