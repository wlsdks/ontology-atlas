/**
 * Hangul-aware matching — how a Korean keyboard actually produces a query.
 *
 * **Why it was needed:** every search surface here matched normalised substrings
 * only, so the two things a Korean typist does first both returned nothing
 * (measured 2026-09-19 against the bundled Online Store sample, 125 concepts):
 * a query typed as consonant initials alone, and a name whose last syllable the
 * keyboard has not finished. `hangul-match.test.ts` and the "hangul keyboard"
 * block in `widgets/global-search/lib/match.test.ts` carry those queries as data,
 * which is where the examples belong — source comments here are English.
 *
 * The second case is not a convenience: a Hangul IME emits a syllable one jamo at
 * a time, so **every Korean word passes through it on the way to being typed**. A
 * palette that shows nothing until the syllable closes flickers empty on every
 * character.
 *
 * Two rules, and no general fuzziness beyond them — a subsequence matcher would let
 * one consonant reach half the vault with no way for the reader to see why:
 *
 * 1. **Chosung** — a query made only of consonant jamo matches the initials of
 *    consecutive syllables, in order. Spaces are ignored on both sides: nobody
 *    types the space between the words of a name they are abbreviating to its
 *    initials, and a two-word capability got 0 results until they were (measured
 *    live on the Online Store sample, 2026-09-19). The highlighted range spans
 *    back over any space the match crossed.
 * 2. **Trailing partial syllable** — every character but the last must match
 *    exactly, and the last must be a jamo prefix of the syllable it lands on.
 *    Compound medials and final clusters are split into the keys that type them,
 *    so a syllable ending at *o* is a genuine prefix of one whose medial is *wa*
 *    (typed *o* then *a*), and a syllable with no final is a prefix of the same
 *    syllable with one.
 *
 * Positions are returned so the same match can be highlighted; they index the
 * **NFC form** of the haystack, which is what `normalize("NFC")` on the label
 * renders identically. Callers that highlight must normalise the same way.
 */

const SYLLABLE_FIRST = 0xac00;
const SYLLABLE_LAST = 0xd7a3;
const JUNG_COUNT = 21;
const JONG_COUNT = 28;

/** Compatibility-jamo initials, in syllable-index order. */
const CHO = [
  "ㄱ", "ㄲ", "ㄴ", "ㄷ", "ㄸ", "ㄹ", "ㅁ", "ㅂ", "ㅃ", "ㅅ",
  "ㅆ", "ㅇ", "ㅈ", "ㅉ", "ㅊ", "ㅋ", "ㅌ", "ㅍ", "ㅎ",
] as const;

/** Compatibility-jamo medials, in syllable-index order. */
const JUNG = [
  "ㅏ", "ㅐ", "ㅑ", "ㅒ", "ㅓ", "ㅔ", "ㅕ", "ㅖ", "ㅗ", "ㅘ",
  "ㅙ", "ㅚ", "ㅛ", "ㅜ", "ㅝ", "ㅞ", "ㅟ", "ㅠ", "ㅡ", "ㅢ", "ㅣ",
] as const;

/** Compatibility-jamo finals; index 0 is "no final". */
const JONG = [
  "", "ㄱ", "ㄲ", "ㄳ", "ㄴ", "ㄵ", "ㄶ", "ㄷ", "ㄹ", "ㄺ",
  "ㄻ", "ㄼ", "ㄽ", "ㄾ", "ㄿ", "ㅀ", "ㅁ", "ㅂ", "ㅄ", "ㅅ",
  "ㅆ", "ㅇ", "ㅈ", "ㅊ", "ㅋ", "ㅌ", "ㅍ", "ㅎ",
] as const;

const CHO_SET: ReadonlySet<string> = new Set(CHO);

/**
 * Clusters written with one code point but typed as two keys. Splitting them is
 * what lets the state the IME was in one keystroke earlier count as a prefix of
 * the finished syllable.
 */
const CLUSTER_PARTS: Readonly<Record<string, readonly [string, string]>> = {
  "ㄳ": ["ㄱ", "ㅅ"],
  "ㄵ": ["ㄴ", "ㅈ"],
  "ㄶ": ["ㄴ", "ㅎ"],
  "ㄺ": ["ㄹ", "ㄱ"],
  "ㄻ": ["ㄹ", "ㅁ"],
  "ㄼ": ["ㄹ", "ㅂ"],
  "ㄽ": ["ㄹ", "ㅅ"],
  "ㄾ": ["ㄹ", "ㅌ"],
  "ㄿ": ["ㄹ", "ㅍ"],
  "ㅀ": ["ㄹ", "ㅎ"],
  "ㅄ": ["ㅂ", "ㅅ"],
  "ㅘ": ["ㅗ", "ㅏ"],
  "ㅙ": ["ㅗ", "ㅐ"],
  "ㅚ": ["ㅗ", "ㅣ"],
  "ㅝ": ["ㅜ", "ㅓ"],
  "ㅞ": ["ㅜ", "ㅔ"],
  "ㅟ": ["ㅜ", "ㅣ"],
  "ㅢ": ["ㅡ", "ㅣ"],
};

function isSyllable(code: number): boolean {
  return code >= SYLLABLE_FIRST && code <= SYLLABLE_LAST;
}

function pushSplit(out: string[], jamo: string): void {
  const parts = CLUSTER_PARTS[jamo];
  if (parts) {
    out.push(parts[0], parts[1]);
    return;
  }
  out.push(jamo);
}

/**
 * One character as the sequence of keys that types it. A syllable becomes its
 * initial, medial and (when present) final, with clusters split; anything else
 * stays as itself so the comparison degrades to plain equality.
 */
function jamoOf(char: string): string[] {
  const code = char.codePointAt(0) ?? 0;
  if (!isSyllable(code)) return [char];
  const index = code - SYLLABLE_FIRST;
  const jong = index % JONG_COUNT;
  const jung = Math.floor(index / JONG_COUNT) % JUNG_COUNT;
  const cho = Math.floor(index / (JONG_COUNT * JUNG_COUNT));
  const out: string[] = [CHO[cho]!];
  pushSplit(out, JUNG[jung]!);
  if (jong > 0) pushSplit(out, JONG[jong]!);
  return out;
}

/**
 * Every Hangul syllable reduced to its initial consonant, every other character
 * left alone. Length is preserved one-for-one so an index into the result is an
 * index into the input.
 */
export function toChosung(value: string): string {
  let out = "";
  for (const char of value) {
    const code = char.codePointAt(0) ?? 0;
    out += isSyllable(code) ? CHO[Math.floor((code - SYLLABLE_FIRST) / (JONG_COUNT * JUNG_COUNT))]! : char;
  }
  return out;
}

/**
 * Syllable initials with spaces dropped — the form a chosung query is compared
 * against. Nobody types the space between the words of a name they are reducing
 * to initials, so neither side keeps it. Positions are lost, which is why
 * `findHangulMatch` keeps its own map back for highlighting.
 */
export function chosungKey(value: string): string {
  return toChosung(value).replace(/ /g, "");
}

/**
 * True when the query is nothing but consonant jamo and spaces, with at least
 * one consonant: a query of initials only, as against one that already carries a
 * finished syllable.
 */
export function isChosungQuery(value: string): boolean {
  let sawConsonant = false;
  for (const char of value) {
    if (char === " ") continue;
    if (!CHO_SET.has(char)) return false;
    sawConsonant = true;
  }
  return sawConsonant;
}

/** Where a Hangul-aware match sits, as indexes into the NFC form of the haystack. */
export interface HangulMatchRange {
  start: number;
  end: number;
}

/** Does `target` begin with the keys that type `prefix`? */
function syllableStartsWith(target: string, prefix: string): boolean {
  const targetJamo = jamoOf(target);
  const prefixJamo = jamoOf(prefix);
  if (prefixJamo.length > targetJamo.length) return false;
  for (let i = 0; i < prefixJamo.length; i += 1) {
    if (targetJamo[i] !== prefixJamo[i]) return false;
  }
  return true;
}

function containsHangul(value: string): boolean {
  for (const char of value) {
    const code = char.codePointAt(0) ?? 0;
    // Syllables, plus the compatibility-jamo block an IME emits mid-syllable.
    if (isSyllable(code) || (code >= 0x3131 && code <= 0x3163)) return true;
  }
  return false;
}

function sameCharacter(a: string, b: string): boolean {
  return a === b || a.toLowerCase() === b.toLowerCase();
}

/**
 * The first Hangul-aware match of `query` in `haystack`, or null. Both are
 * normalised to NFC first, and the returned range indexes that NFC form.
 *
 * This is deliberately *not* a general fuzzy matcher: it only recognises the two
 * states a Hangul keyboard puts a real query in. A literal substring match is
 * the caller's job and should be tried first — it ranks higher.
 */
export function findHangulMatch(haystack: string, query: string): HangulMatchRange | null {
  const text = haystack.normalize("NFC");
  const needle = query.normalize("NFC").trim();
  if (needle === "" || text === "") return null;
  if (!containsHangul(needle)) return null;

  if (isChosungQuery(needle)) {
    const initials = toChosung(text);
    // Drop spaces from both sides, keeping a map back to where each surviving
    // initial sits in the original, so the highlight can span the space again.
    let packed = "";
    const origin: number[] = [];
    for (let i = 0; i < initials.length; i += 1) {
      const char = initials[i] ?? "";
      if (char === " ") continue;
      packed += char;
      origin.push(i);
    }
    const packedNeedle = needle.replace(/ /g, "");
    if (packedNeedle === "") return null;
    const hit = packed.indexOf(packedNeedle);
    if (hit === -1) return null;
    const start = origin[hit];
    const last = origin[hit + packedNeedle.length - 1];
    if (start === undefined || last === undefined) return null;
    return { start, end: last + 1 };
  }

  // Code units, not code points: Hangul is entirely inside the BMP, so the two
  // agree over every character this path can match, and a code-unit range slices
  // the same string the caller highlights. An astral character elsewhere in the
  // title compares as a lone surrogate and simply never matches.
  const lastIndex = needle.length - 1;
  const limit = text.length - needle.length;
  for (let start = 0; start <= limit; start += 1) {
    let ok = true;
    for (let offset = 0; offset <= lastIndex; offset += 1) {
      const target = text[start + offset] ?? "";
      const wanted = needle[offset] ?? "";
      const matched =
        offset === lastIndex ? syllableStartsWith(target, wanted) : sameCharacter(target, wanted);
      if (!matched) {
        ok = false;
        break;
      }
    }
    if (ok) return { start, end: start + needle.length };
  }
  return null;
}

/** Does a Hangul-aware match of `query` appear anywhere in `haystack`? */
export function hangulIncludes(haystack: string, query: string): boolean {
  return findHangulMatch(haystack, query) !== null;
}

/** Does a Hangul-aware match of `query` begin `haystack`? */
export function hangulStartsWith(haystack: string, query: string): boolean {
  return findHangulMatch(haystack, query)?.start === 0;
}
