/**
 * Korean particles — **pick one when it can be known, show both only when it
 * cannot.**
 *
 * **Why this exists** (2026-07-29, while dogfooding). Finishing the tutorial
 * printed: `「결제 취소」 을(를) 만들었습니다.` — "취소" ends without a final
 * consonant, so the only correct particle is 「를」, yet the copy handed the user
 * a parenthesis while knowing the answer. Showing both is a **fallback for not
 * knowing**, not a default: once the name is known the particle is decided. The
 * repo's habit is not to ask the user something the screen already knows.
 *
 * **When both are kept.** Only when the last character is **neither a Hangul
 * syllable nor a digit**. For a name ending in Latin letters (`order-create`)
 * there is no settled pronunciation, so no final consonant can be derived —
 * reading "create" as 「크리에이트」 gives one, 「크리에잇」 gives none. Choosing
 * either is wrong half the time, so showing both is the honest answer, and this
 * function's fallback returns exactly that.
 */

/** Particle pairs selected by whether the preceding word ends in a final consonant: [with, without]. */
const PAIRS = {
  object: ["을", "를"],
  subject: ["이", "가"],
  topic: ["은", "는"],
  with: ["과", "와"],
  /** 「으로/로」 — a final ㄹ exceptionally takes the "without" form. */
  direction: ["으로", "로"],
} as const;

export type JosaKind = keyof typeof PAIRS;

const HANGUL_FIRST = 0xac00;
const HANGUL_LAST = 0xd7a3;
/** Jongseong index 8 is ㄹ. Only 「으로/로」 treats it as if there were no final consonant. */
const JONG_RIEUL = 8;

/**
 * For a name ending in a digit, the final consonant follows **how the digit is
 * read aloud**: 0 (영), 1 (일), 3 (삼), 6 (육), 7 (칠) and 8 (팔) have one;
 * 2, 4, 5 and 9 do not.
 */
const DIGIT_HAS_BATCHIM: Record<string, boolean> = {
  "0": true,
  "1": true,
  "2": false,
  "3": true,
  "4": false,
  "5": false,
  "6": true,
  "7": true,
  "8": true,
  "9": false,
};

interface Batchim {
  /** Does it end in a final consonant; `null` when undecidable. */
  has: boolean | null;
  /** Is the final consonant ㄹ (used only by 「으로/로」). */
  rieul: boolean;
}

function readBatchim(word: string): Batchim {
  const trimmed = word.trim();
  if (trimmed === "") return { has: null, rieul: false };
  const last = trimmed[trimmed.length - 1]!;
  const code = last.codePointAt(0)!;
  if (code >= HANGUL_FIRST && code <= HANGUL_LAST) {
    const jong = (code - HANGUL_FIRST) % 28;
    return { has: jong !== 0, rieul: jong === JONG_RIEUL };
  }
  const digit = DIGIT_HAS_BATCHIM[last];
  if (digit !== undefined) return { has: digit, rieul: last === "1" };
  return { has: null, rieul: false };
}

/**
 * Chooses the particle to follow `word`, falling back to the both-forms shape
 * (`을(를)`) when it cannot be decided.
 *
 * It returns **only the particle** — joining it to the name is the caller's job
 * (`{name}{josa}` in the i18n message), so messages in other languages can skip
 * this value entirely.
 */
export function josa(word: string, kind: JosaKind): string {
  const [withBatchim, withoutBatchim] = PAIRS[kind];
  const { has, rieul } = readBatchim(word);
  if (has === null) return `${withBatchim}(${withoutBatchim})`;
  if (kind === "direction" && rieul) return withoutBatchim;
  return has ? withBatchim : withoutBatchim;
}
