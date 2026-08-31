/**
 * The one shape every Tauri command failure arrives in, and the one place it
 * turns back into a sentence a person can read.
 *
 * ## Why the Rust side stopped writing sentences
 *
 * Commands used to reject with a finished Korean sentence and the WebView printed
 * it verbatim. An English-locale reader met Korean; a Korean reader met whatever
 * wording Rust happened to hold. Rust cannot fix this on its own: the locale lives
 * in the frontend router, not in the process.
 *
 * So `src-tauri/src/errors.rs` mints a **code** instead, following the two prefixes
 * this codebase already had (`vault-root-rejected:`, `audit-blocked:`):
 *
 * ```text
 * <code>              e.g. "secret-empty"
 * <code>: <detail>    e.g. "keychain-unavailable: No such keychain"
 * ```
 *
 * `detail` is machine-supplied fact only, in English: an OS error, git's own
 * stderr, a provider or model name the user typed. Never prose, because prose in
 * the detail would be a second untranslatable sentence, which is the whole defect
 * this removes.
 *
 * ## What this module does with it
 *
 * A known code becomes the localized sentence, with the detail in parentheses when
 * there is one, so git's own words about a failed push are not thrown away. An
 * **unknown** code falls back to the English detail rather than to nothing: a code
 * added in Rust and forgotten in `messages/*.json` still says something true.
 *
 * next-intl stays out of this file on purpose (the same choice as
 * `vault-issue-plain-message.ts`): the caller passes a lookup, so a test can drive
 * it with a plain object and no provider.
 */

/**
 * A code is lower-case ASCII kebab. Anchored at the start and followed by end of
 * string or a colon, so an ordinary sentence that merely happens to begin with a
 * lower-case word ("cannot open file: x" — note the spaces) is not mistaken for one.
 */
const CODED = /^([a-z][a-z0-9]*(?:-[a-z0-9]+)*)(?::\s*([\s\S]*))?$/;

export interface NativeErrorParts {
  /** The machine code, or `null` when this failure did not carry one. */
  code: string | null;
  /** Everything after the code. English, machine-supplied, possibly empty. */
  detail: string;
  /** The whole payload as it arrived, for the case where nothing parsed. */
  raw: string;
}

/** Look up one code's localized sentence. `undefined` means "this code is unknown here". */
export type NativeErrorLookup = (code: string) => string | undefined;

/** invoke's rejection payload → a string. Rust returns `Err(String)`, but Error/unknown happen. */
function payloadText(err: unknown): string {
  if (typeof err === 'string') return err;
  if (err instanceof Error) return err.message;
  return String(err);
}

/** Split an invoke rejection into its code and its English detail. */
export function parseNativeError(err: unknown): NativeErrorParts {
  const raw = payloadText(err).trim();
  const match = CODED.exec(raw);
  if (!match) return { code: null, detail: raw, raw };
  return { code: match[1], detail: (match[2] ?? '').trim(), raw };
}

/**
 * One line for the user.
 *
 * With **no lookup at all** the payload comes back untouched — byte for byte what
 * these three bridges returned before codes existed. That is not politeness: the
 * agent loop's `noticeFor` recognises a failed turn by `audit-blocked:` and
 * `timed-out:` prefixes, so a caller that has not been wired to a catalogue must
 * keep its code, or an unwritable folder silently becomes "check your network" —
 * the exact regression `tests/contract/agent-notice-codes.contract.test.ts` exists
 * to prevent.
 *
 * With a lookup, an **unknown** code still degrades to the English detail, so a
 * code minted in Rust and forgotten in `messages/*.json` says something true.
 */
export function nativeErrorMessage(err: unknown, lookup?: NativeErrorLookup): string {
  const { code, detail, raw } = parseNativeError(err);
  if (!lookup) return raw;
  const sentence = code ? lookup(code) : undefined;
  if (!sentence) return detail || raw;
  return detail ? `${sentence} (${detail})` : sentence;
}
