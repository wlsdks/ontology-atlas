/**
 * Two Hangul keyboard states and no general fuzziness, which would let one consonant reach half the
 * vault: a query of consonant initials, spaces ignored on both sides; and a last syllable the IME
 * has not finished, whose keys are a jamo prefix of the syllable plus the next one's initial (a
 * two-set keyboard shows that initial as a final). Ranges index the haystack's NFC form.
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
 * Nobody types the space between words reduced to initials, so neither side keeps it;
 * `findHangulMatch` keeps its own map back for highlighting.
 */
export function chosungKey(value: string): string {
  return toChosung(value).replace(/ /g, "");
}

/** Consonant jamo and spaces only, with at least one consonant. */
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

/**
 * How many characters the keys that type `prefix` cover from `target` on: 1, or 2 when
 * they also take `next`'s initial, which a two-set keyboard shows as a final; 0 if none.
 */
function prefixReach(target: string, next: string, prefix: string): 0 | 1 | 2 {
  const targetJamo = jamoOf(target);
  const ownKeys = targetJamo.length;
  if (isSyllable(next.codePointAt(0) ?? 0)) targetJamo.push(jamoOf(next)[0]!);
  const prefixJamo = jamoOf(prefix);
  if (prefixJamo.length > targetJamo.length) return 0;
  for (let i = 0; i < prefixJamo.length; i += 1) {
    if (targetJamo[i] !== prefixJamo[i]) return 0;
  }
  return prefixJamo.length > ownKeys ? 2 : 1;
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
 * Try a literal substring first; it ranks higher. O(|haystack| · |query|): each start compares up
 * to |query| characters of at most five keys.
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

  // Code units, not code points: Hangul lies in the BMP, so a code-unit range slices the string
  // the caller highlights; an astral character compares as a lone surrogate and never matches.
  const lastIndex = needle.length - 1;
  const limit = text.length - needle.length;
  for (let start = 0; start <= limit; start += 1) {
    let reach = 1;
    for (let offset = 0; offset <= lastIndex; offset += 1) {
      const target = text[start + offset] ?? "";
      const wanted = needle[offset] ?? "";
      reach =
        offset === lastIndex
          ? prefixReach(target, text[start + offset + 1] ?? "", wanted)
          : sameCharacter(target, wanted) ? 1 : 0;
      if (reach === 0) break;
    }
    if (reach > 0) return { start, end: start + lastIndex + reach };
  }
  return null;
}

export function hangulIncludes(haystack: string, query: string): boolean {
  return findHangulMatch(haystack, query) !== null;
}

export function hangulStartsWith(haystack: string, query: string): boolean {
  return findHangulMatch(haystack, query)?.start === 0;
}
