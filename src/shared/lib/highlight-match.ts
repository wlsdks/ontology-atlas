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
  if (!tokenRe) return [{ text, match: false }];
  return scanSegments(text, tokenRe) ?? [{ text, match: false }];
}
