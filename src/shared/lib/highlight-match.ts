import { findHangulMatch } from './hangul-match';

/**
 * Splits text into matched / unmatched segments for search highlighting. Pure data, no
 * JSX, so it unit-tests easily and the renderer only has to wrap segments in `<mark>`.
 *
 * - Case-insensitive; every occurrence matches.
 * - An empty query (after trim), or no match, yields the whole text as one unmatched
 *   segment.
 * - Regex metacharacters are escaped so tokens match literally.
 * - **Whitespace between tokens matches any run of whitespace** (spaces, newlines, tabs).
 *   Document bodies wrap at ~80 columns, so a phrase the user typed on one line may be
 *   split across a newline in the source. Literal substring matching finds zero matches
 *   there, and both the highlight and the scroll-to fail.
 * - **A scattered phrase falls back to per-token OR matching.** `searchDocs` in
 *   `widgets/docs-vault/lib/search.ts` counts a multi-token query as a hit when each token
 *   appears anywhere in the document — a non-contiguous phrase just scores at
 *   `bodyTierScore`, the lowest tier; the phrase is never required. If highlighting only
 *   accepted a contiguous phrase, search would report a hit while the viewer showed zero
 *   marks. Reproduced live by searching "relationship type" and opening the CLI Developer Entry
 *   body match.
 * - **A Hangul query no literal pass found falls back to `shared/lib/hangul-match`.**
 *   Consonant initials, and a name whose last syllable the keyboard has not finished,
 *   are matches the palette ranks, so the reader has to be able to see them; an
 *   unmarked row is a row with no visible reason for being in the list, which is the
 *   state highlighting exists to prevent.
 */
export interface HighlightSegment {
  text: string;
  match: boolean;
}

function escapeRegExpToken(token: string): string {
  return token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Compiles the query into a whitespace-tolerant regex: tokens are joined with `\s+` so any
 * run of whitespace in the source matches. Each token is an escaped literal, so
 * metacharacters stay safe. Returns null for an empty query.
 *
 * Ranking (`search.ts`'s bodyPhraseScore / bodyTierScore split) uses this function to
 * decide whether the phrase is actually contiguous, so changing its behaviour changes the
 * ranking contract too. That is why the scattered-token fallback lives in
 * `splitHighlightSegments` and not here.
 */
export function buildPhraseMatcher(
  query: string,
  flags = 'gi',
): RegExp | null {
  const tokens = query.trim().split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return null;
  const pattern = tokens.map(escapeRegExpToken).join('\\s+');
  return new RegExp(pattern, flags);
}

/**
 * Fallback matcher for a multi-token query whose phrase is nowhere contiguous: the tokens
 * become a literal alternation matched with OR. Sorted longest-first so a short token that
 * is a substring of a longer one cannot consume it first. Returns null for fewer than two
 * tokens, where the result would equal `buildPhraseMatcher` and the fallback would be
 * pointless.
 */
function buildScatteredTokenMatcher(
  tokens: string[],
  flags = 'gi',
): RegExp | null {
  if (tokens.length < 2) return null;
  const escaped = [...tokens].sort((a, b) => b.length - a.length).map(escapeRegExpToken);
  return new RegExp(escaped.join('|'), flags);
}

/** Splits text with the given regex. Returns null when nothing matched — deciding whether
 *  to fall back is the caller's job. */
function scanSegments(text: string, re: RegExp): HighlightSegment[] | null {
  const segments: HighlightSegment[] = [];
  let cursor = 0;
  let match: RegExpExecArray | null;
  let matchedAny = false;
  re.lastIndex = 0;
  while ((match = re.exec(text)) !== null) {
    matchedAny = true;
    if (match.index > cursor) {
      segments.push({ text: text.slice(cursor, match.index), match: false });
    }
    segments.push({ text: match[0], match: true });
    cursor = match.index + match[0].length;
    // Tokens are all non-empty, so a zero-length match should be impossible; guard the
    // infinite loop anyway.
    if (match[0].length === 0) re.lastIndex += 1;
  }
  if (!matchedAny) return null;
  if (cursor < text.length) {
    segments.push({ text: text.slice(cursor), match: false });
  }
  return segments;
}

/**
 * Every Hangul-aware occurrence, as segments. Ranges from `findHangulMatch` index the
 * NFC form, so the text is normalised once and the segments are cut from that — the
 * same characters, rendered identically.
 */
function scanHangulSegments(text: string, query: string): HighlightSegment[] | null {
  const normalized = text.normalize('NFC');
  const segments: HighlightSegment[] = [];
  let cursor = 0;
  while (cursor < normalized.length) {
    const found = findHangulMatch(normalized.slice(cursor), query);
    if (!found) break;
    const start = cursor + found.start;
    const end = cursor + found.end;
    if (start > cursor) segments.push({ text: normalized.slice(cursor, start), match: false });
    segments.push({ text: normalized.slice(start, end), match: true });
    cursor = end;
  }
  if (segments.length === 0) return null;
  if (cursor < normalized.length) {
    segments.push({ text: normalized.slice(cursor), match: false });
  }
  return segments;
}

export function splitHighlightSegments(
  text: string,
  query: string,
): HighlightSegment[] {
  const re = buildPhraseMatcher(query);
  if (!re) return [{ text, match: false }];

  const phraseSegments = scanSegments(text, re);
  if (phraseSegments) return phraseSegments;

  // No contiguous phrase: fall back to scattered tokens, so highlighting agrees with
  // search.ts's AND-match contract and the mark + scrollIntoView still land.
  const tokens = query.trim().split(/\s+/).filter(Boolean);
  const tokenRe = buildScatteredTokenMatcher(tokens);
  const tokenSegments = tokenRe ? scanSegments(text, tokenRe) : null;
  if (tokenSegments) return tokenSegments;

  // Still nothing literal: the query may be Hangul the keyboard has not finished
  // writing, which is what the matcher ranked this row on.
  return scanHangulSegments(text, query) ?? [{ text, match: false }];
}

/**
 * The summary, cut so its first match is near the start.
 *
 * A search result's description is one truncated line, so a match late in the
 * sentence is highlighted past the ellipsis and the row shows **no reason at all**
 * for being in the list — measured live on 2026-09-19: searching an English word
 * the Korean titles do not carry marked the description of every row, and on some
 * of them the mark rendered outside its own box. Starting the line at the match is
 * what every code search does, and the leading ellipsis says the sentence began
 * earlier.
 *
 * The cut lands on the **first** whitespace inside the `leadIn` characters before
 * the match, so a word or two of run-up survives and no word is sliced in half. One
 * unbroken token that long leaves no boundary to use, and the line then starts at
 * the match itself. A match already inside `leadIn` leaves the text alone — nothing
 * is hidden to buy space that was not needed.
 */
export function snippetAroundFirstMatch(
  text: string,
  query: string,
  leadIn = 12,
): string {
  const segments = splitHighlightSegments(text, query);
  const firstMatch = segments.findIndex((segment) => segment.match);
  if (firstMatch <= 0) return text;
  const before = segments.slice(0, firstMatch).reduce((sum, s) => sum + s.text.length, 0);
  if (before <= leadIn) return text;
  const whole = segments.map((s) => s.text).join('');
  const window = whole.slice(before - leadIn, before);
  const boundary = window.search(/\s/);
  const cut = boundary === -1 ? before : before - leadIn + boundary + 1;
  return `…${whole.slice(cut)}`;
}
