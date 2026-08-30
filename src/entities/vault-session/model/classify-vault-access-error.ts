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
export type VaultAccessErrorKind = 'permission-denied' | 'unknown';

/**
 * Signatures of a refusal, as `std::io::Error::to_string()` renders them on macOS.
 *
 * `EPERM` (1) is what TCC returns for a protected location. `EACCES` (13) is the ordinary
 * filesystem-permission refusal, which reaches a person the same way and has the same remedy shape,
 * so it is classified together rather than left in the generic bucket.
 */
const DENIED_SIGNATURES = [
  'operation not permitted',
  'permission denied',
  'os error 1)',
  'os error 13)',
];

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

function messageOf(error: unknown): string {
  if (error instanceof Error) return error.message;
  return '';
}
