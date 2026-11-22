/**
 * Two cells wide (Hangul, Han, kana, fullwidth). A Latin-calibrated width underestimates Hangul by
 * ~40% (10.38 vs ~7 px at weight 600, 12 px), pushing glyphs outside the hit rectangle.
 */
function isWideGlyph(codePoint: number): boolean {
  return (
    (codePoint >= 0x1100 && codePoint <= 0x11ff) || // Hangul jamo
    (codePoint >= 0x2e80 && codePoint <= 0xa4cf) || // CJK radicals ~ Han ~ kana ~ compatibility jamo
    (codePoint >= 0xac00 && codePoint <= 0xd7a3) || // Hangul syllables
    (codePoint >= 0xf900 && codePoint <= 0xfaff) ||
    (codePoint >= 0xfe30 && codePoint <= 0xfe4f) ||
    (codePoint >= 0xff00 && codePoint <= 0xff60) ||
    (codePoint >= 0xffe0 && codePoint <= 0xffe6)
  );
}

/**
 * Deterministic text width without `ctx`, the single ruler for the bar rectangle: hit-testing and label
 * reservation have no canvas, and two rulers make draw and hit diverge. The coefficients are headless-Chromium
 * measurements (weight 600, 12 px) plus margin, so always wider than reality.
 */
export function estimateCanvasTextWidth(text: string, fontSize: number): number {
  let cells = 0;
  for (const ch of text) {
    const cp = ch.codePointAt(0) ?? 0;
    if (isWideGlyph(cp)) cells += 0.92;
    else if (cp === 0x20) cells += 0.32;
    else if (cp >= 0x30 && cp <= 0x39) cells += 0.62;
    else if (cp >= 0x41 && cp <= 0x5a) cells += 0.72;
    else cells += 0.58;
  }
  return cells * fontSize;
}
