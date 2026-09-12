/**
 * **A failure reaches a person as a code, never as the developer's English.**
 *
 * ## The defect this exists to remove
 *
 * Installed-app inspection before v1.2.2 (finding B2): pressing the answer page's redraft
 * button (`library.answers.refresh`) on a Korean screen printed **"The retained question or
 * its history cannot be read."** into the page body, brighter than the copy around it. That
 * sentence is a `throw new Error(...)` argument written for whoever reads the stack, and the UI
 * preferred it over the sentence the product had already written, at **eight sites across
 * six files**, all sharing one shape:
 *
 * ```ts
 * err instanceof Error && err.message ? err.message : t('…')   // the raw wins
 * ```
 *
 * A thrown string cannot be translated: it is minted in a module that has no idea which
 * language the reader chose. So the rule is the same one `native-error.ts` already
 * established for Tauri commands — **the throwing side mints a code, and the screen owns
 * the sentence.** This module is that rule for failures thrown inside the web app.
 *
 * ## Two ways a failure gets its code
 *
 * 1. **It says so.** `codedFailure('answer-history-unreadable')` carries the code as a
 *    field. This is what any throw site in this repository should do.
 * 2. **The operating system said so.** A `DOMException`, a Rust `Err(String)` or a
 *    browser filesystem rejection is not ours to re-mint, so its text is matched against
 *    the signature tables below. These are the same tables
 *    `classify-vault-access-error.ts` reads, kept here so there is one list rather than
 *    two that drift.
 *
 * Anything else has **no code**, and a screen with no code shows the sentence it wrote
 * for that press. The raw text is not lost — it goes to a `data-*` attribute or the
 * console, where the person who can act on it is looking.
 */

/**
 * Signatures of a refusal, as `std::io::Error::to_string()` and the browser render them.
 *
 * `EPERM` (1) is what macOS TCC returns for a protected location; `EACCES` (13) is the
 * ordinary filesystem refusal. They reach a person the same way and have the same remedy,
 * so they carry one code.
 */
export const PERMISSION_DENIED_SIGNATURES = [
  'operation not permitted',
  'permission denied',
  'os error 1)',
  'os error 13)',
] as const;

/**
 * Signatures of "that is not there any more", as each runtime words it.
 *
 * The browser throws a `DOMException` named `NotFoundError` whose message is written for a
 * developer ("A requested file or directory could not be found at the time an operation
 * was processed."); Rust words the same fact as `No such file or directory (os error 2)`.
 */
export const MISSING_TARGET_SIGNATURES = [
  'notfounderror',
  'no such file or directory',
  'os error 2)',
  'could not be found',
] as const;

/** Signatures of "something is already there, and nothing was overwritten". */
export const ALREADY_EXISTS_SIGNATURES = [
  'already exists',
  'file exists',
  'os error 17)',
] as const;

/**
 * A failure that names itself.
 *
 * `detail` is machine-supplied fact only — a path, an OS error, a code the runtime
 * returned — and stays English on purpose, exactly as `native-error.ts` requires of the
 * detail half of a Tauri rejection. Prose in the detail would be a second untranslatable
 * sentence, which is the defect this whole module removes.
 */
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

function textOf(err: unknown): string {
  if (typeof err === 'string') return err;
  if (err instanceof Error) return `${err.name} ${err.message}`;
  if (err && typeof err === 'object' && 'message' in err) {
    const message = (err as { message?: unknown }).message;
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
export function failureCodeOf(err: unknown): string | null {
  if (err instanceof CodedFailure) return err.code;
  if (typeof err === 'string' && /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/.test(err)) return err;
  const text = textOf(err);
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
export function failureDetailOf(err: unknown): string | null {
  if (err instanceof CodedFailure) return err.detail;
  if (typeof err === 'string') return err.trim() || null;
  if (err instanceof Error) return err.message.trim() || null;
  return null;
}
