/** A session name is one line of at most this many characters (grapheme clusters) on every surface. */
export const SESSION_NAME_MAX_CHARACTERS = 60;

const LINE_BREAK = /[\n\r\u0085\u2028\u2029]/;
/** Control characters, and the marks that embed, override or isolate a text direction. */
const REMOVED = /[\p{Cc}\u061C\u200E\u200F\u202A-\u202E\u2066-\u2069]/gu;

function graphemes(text: string): string[] {
  if (typeof Intl !== 'undefined' && 'Segmenter' in Intl) {
    return Array.from(new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(text), part => part.segment);
  }
  return Array.from(text);
}

/**
 * The name a session row may show, or `null` for none: not text, empty, or only removed
 * characters. A line break ends it, and the cut falls between grapheme clusters, so it never
 * splits a Hangul syllable or an emoji. Rust applies the same rule; the page applies it again so no
 * longer or multi-line text reaches a row whatever arrives.
 */
export function sessionNameOf(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const firstLine = raw.split(LINE_BREAK, 1)[0] ?? '';
  const cleaned = firstLine.replace(REMOVED, '').trim();
  if (!cleaned) return null;
  const parts = graphemes(cleaned);
  return parts.length <= SESSION_NAME_MAX_CHARACTERS ? cleaned : parts.slice(0, SESSION_NAME_MAX_CHARACTERS).join('').trimEnd();
}
