// A repository string (a file name, a manifest key, a route, a README line)
// printed inside a plain-text response is data. Control and format characters
// are written as escapes, so a newline in a `bin` key cannot start a forged
// `Next:` line, and a length cap keeps one string from filling the response.

const UNPRINTABLE = /[\p{Cc}\p{Cf}\u2028\u2029]/gu;
const NAMED = { '\n': '\\n', '\r': '\\r', '\t': '\\t' };

/** `value` as one printable line of at most `max` characters, with the cut counted. */
export function repoText(value, max = 160) {
  const escaped = String(value ?? '').replace(UNPRINTABLE, (char) =>
    NAMED[char] ?? `\\u{${char.codePointAt(0).toString(16)}}`);
  const chars = [...escaped];
  return chars.length > max ? `${chars.slice(0, max).join('')}...(+${chars.length - max} chars)` : escaped;
}

/**
 * `value` as JSON on one line that parses back to the same value: JSON already
 * escapes control characters; format characters and line separators are
 * escaped too, so a call printed for the agent to make cannot hide or break a line.
 */
export function oneLineJson(value) {
  return JSON.stringify(value).replace(/[\p{Cf}\u2028\u2029]/gu, (char) => Array.from({ length: char.length },
    (_, at) => `\\u${char.charCodeAt(at).toString(16).padStart(4, '0')}`).join(''));
}
