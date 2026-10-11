/**
 * Every Tauri command failure arrives as `<code>` or `<code>: <detail>`; `detail` is
 * machine-supplied English fact, never prose. A known code becomes the localized sentence; an
 * unknown code falls back to the English detail.
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
