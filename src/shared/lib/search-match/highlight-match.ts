import { findHangulMatch } from './hangul-match';

/**
 * Whitespace between tokens matches any run, since bodies wrap mid-phrase. A scattered phrase falls
 * back to per-token matching and an unmatched Hangul query to `hangul-match`, because search ranks
 * both as hits, and a listed row without a mark shows no reason for being there.
 */
export interface HighlightSegment {
  text: string;
  match: boolean;
}

function escapeRegExpToken(token: string): string {
  return token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Ranking (`search.ts`) uses this to decide whether a phrase is contiguous, so the scattered-token
 * fallback lives in `splitHighlightSegments`, not here.
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
 * Longest-first, so a short token inside a longer one cannot consume it. Null under two tokens,
 * where it would equal `buildPhraseMatcher`.
 */
function buildScatteredTokenMatcher(
  tokens: string[],
  flags = 'gi',
): RegExp | null {
  if (tokens.length < 2) return null;
  const escaped = [...tokens].sort((a, b) => b.length - a.length).map(escapeRegExpToken);
  return new RegExp(escaped.join('|'), flags);
}

/** Returns null when nothing matched; whether to fall back is the caller's job. */
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
  readsHangul = true,
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
  return (readsHangul ? scanHangulSegments(text, query) : null) ?? [{ text, match: false }];
}

/**
 * Cuts the summary so the first match is near the start; otherwise a late match sits past the
 * ellipsis. The cut lands on the first whitespace within `leadIn` characters before the match.
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
