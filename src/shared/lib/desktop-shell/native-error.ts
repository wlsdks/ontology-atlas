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
  code: string | null;
  detail: string;
  raw: string;
}

export type NativeErrorLookup = (code: string) => string | undefined;

/** invoke's rejection payload → a string. Rust returns `Err(String)`, but Error/unknown happen. */
function payloadText(error: unknown): string {
  if (typeof error === 'string') return error;
  if (error instanceof Error) return error.message;
  return String(error);
}

export function parseNativeError(error: unknown): NativeErrorParts {
  const raw = payloadText(error).trim();
  const match = CODED.exec(raw);
  if (!match) return { code: null, detail: raw, raw };
  return { code: match[1], detail: (match[2] ?? '').trim(), raw };
}

/**
 * Without a lookup the payload is untouched: the agent loop's `noticeFor` matches the
 * `audit-blocked:` and `timed-out:` prefixes (`agent-notice-codes.contract.test.ts`). With one, an
 * unknown code still degrades to the English detail.
 */
export function nativeErrorMessage(error: unknown, lookup?: NativeErrorLookup): string {
  const { code, detail, raw } = parseNativeError(error);
  if (!lookup) return raw;
  const sentence = code ? lookup(code) : undefined;
  if (!sentence) return detail || raw;
  return detail ? `${sentence} (${detail})` : sentence;
}
