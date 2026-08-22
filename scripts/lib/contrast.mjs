/**
 * Contrast calculation — **pure functions**. It knows nothing of the DOM or the
 * browser.
 *
 * **Why this file exists.** `/design-council` instructs the 「도해」 (infoviz) seat
 * that *"design-infoviz must measure contrast"*, and that seat's brief makes
 * *"measure contrast — take the composited contrast of adjacent segments, and below
 * 3:1 there must be a colour-independent distinguisher"* a precondition of any
 * verdict. **But there was no instrument to measure with.** As of 2026-08-03 no
 * script in this repository computed contrast, and `/design-audit` only **checked
 * colours against the token set** without producing a ratio — whether a token was
 * used and whether it is legible are different questions.
 *
 * An instruction with no instrument turns that seat into eyeballing, with "looks
 * fine" called a measurement. That cost was paid on 2026-07-26: the amber /
 * eucalyptus pair had a composited contrast of **1.14:1** on the track, so they did
 * not separate by luminance at all and separated only by hue — and hue is precisely
 * the axis red-green colour blindness (about 8% of men) separates worst. The premise
 * that colour carried identity was itself wrong, and what revealed it was a number,
 * not an eye.
 *
 * **Basis:** WCAG 2.2's relative luminance and contrast ratio definitions
 * (§ Relative luminance · Contrast ratio). Thresholds are 1.4.3 Contrast (Minimum)
 * — body text 4.5:1, large text (18.66px+bold or 24px+) 3:1 — and 1.4.11 Non-text
 * Contrast 3:1.
 *
 * ⚠️ **Without compositing alpha this calculation lies.** This app uses alpha tokens
 * for text and borders (`--color-overlay-*`, `--color-border-soft`). Measuring the
 * pre-composite colour reports better than reality — which is why compositing lives
 * here.
 */

/** `rgb(r, g, b)` · `rgba(r, g, b, a)` · `#rgb` · `#rrggbb` → `[r, g, b, a]`. */
export function parseColor(input) {
  if (!input) return null;
  const s = String(input).trim();
  if (s === "transparent") return [0, 0, 0, 0];
  const hex = /^#([0-9a-f]{3,8})$/i.exec(s);
  if (hex) {
    const h = hex[1];
    const wide = h.length <= 4 ? h.split("").map((c) => c + c).join("") : h;
    const n = (i) => parseInt(wide.slice(i * 2, i * 2 + 2), 16);
    return [n(0), n(1), n(2), wide.length >= 8 ? n(3) / 255 : 1];
  }
  const fn = /^rgba?\(([^)]+)\)$/i.exec(s);
  if (fn) {
    const parts = fn[1].split(/[\s,/]+/).filter(Boolean).map(Number);
    if (parts.length < 3 || parts.slice(0, 3).some(Number.isNaN)) return null;
    return [parts[0], parts[1], parts[2], parts.length > 3 && !Number.isNaN(parts[3]) ? parts[3] : 1];
  }
  return null;
}

/**
 * **Composites** a translucent foreground over an opaque background (source-over).
 *
 * This app's text and borders are alpha tokens. Measuring without compositing
 * reports better than reality, and that optimism is silent because a number still
 * comes out.
 */
export function composite(fg, bg) {
  const a = fg[3];
  if (a >= 1) return [fg[0], fg[1], fg[2], 1];
  return [
    fg[0] * a + bg[0] * (1 - a),
    fg[1] * a + bg[1] * (1 - a),
    fg[2] * a + bg[2] * (1 - a),
    1,
  ];
}

/** WCAG 2.2 relative luminance. */
export function relativeLuminance([r, g, b]) {
  const lin = (v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

/**
 * Contrast ratio. Both colours **must be opaque** — run `composite` first if either
 * is translucent. White against black is 21:1; a colour against itself is 1:1.
 */
export function contrastRatio(a, b) {
  const l1 = relativeLuminance(a);
  const l2 = relativeLuminance(b);
  const [hi, lo] = l1 > l2 ? [l1, l2] : [l2, l1];
  return (hi + 0.05) / (lo + 0.05);
}

/**
 * WCAG 1.4.3's definition of large text — 18.66px+ bold, or 24px+. (The spec says
 * 14pt bold / 18pt; these are the CSS px equivalents.)
 */
export function isLargeText(fontSizePx, fontWeight) {
  const weight = Number(fontWeight) || (fontWeight === "bold" ? 700 : 400);
  return fontSizePx >= 24 || (fontSizePx >= 18.66 && weight >= 700);
}

/**
 * The verdict for one piece of text.
 *
 * @param {{ fg: string, bg: string, fontSizePx: number, fontWeight: string|number }} input
 *   `fg`/`bg` are computed-style strings. `bg` must be a background **already
 *   resolved to opaque** (composited back through its ancestors).
 */
export function judgeText({ fg, bg, fontSizePx, fontWeight }) {
  const bgc = parseColor(bg);
  const fgc = parseColor(fg);
  if (!bgc || !fgc) return null;
  const solidBg = bgc[3] >= 1 ? bgc : composite(bgc, [0, 0, 0, 1]);
  const ratio = contrastRatio(composite(fgc, solidBg), solidBg);
  const large = isLargeText(fontSizePx, fontWeight);
  const required = large ? 3 : 4.5;
  return { ratio: +ratio.toFixed(2), required, large, passes: ratio >= required };
}

/**
 * Do two adjacent data marks separate **by luminance**? (WCAG 1.4.11 non-text,
 * 3:1.)
 *
 * Why this repository specifically needs this function: on 2026-07-26 adjacent
 * segments separated only by hue, at 1.14:1 by luminance. **Hue is not a channel for
 * 8% of users**, so the verdict on "are they distinguishable" is this ratio, not
 * hue. Below 3:1 a colour-independent distinguisher (a seam, label, pattern, or
 * order) must exist.
 */
export function judgeAdjacentMarks({ a, b, over }) {
  const base = parseColor(over) ?? [0, 0, 0, 1];
  const solidBase = base[3] >= 1 ? base : composite(base, [0, 0, 0, 1]);
  const ma = parseColor(a);
  const mb = parseColor(b);
  /**
   * **An unparseable colour is "not measured", not "passed"** — the same contract as
   * `judgeText` (code review, 2026-08-07).
   *
   * Without this guard, a `null` from `parseColor` made the `composite` just below
   * read `fg[3]` and **throw a TypeError**. The sibling function returns `null` at the
   * same point; only this one died. `parseColor` reads `#hex` and `rgb()/rgba()` only,
   * so its input becomes whatever Chromium serialises as `color(srgb …)` or
   * `oklch(…)` (wide-gamut displays, `color-mix()`).
   *
   * While this function lived only inside a manual instrument a person was watching,
   * but when it entered a CI ratchet on 2026-08-06 it became **a path where the gate
   * crashes**. The caller already counted unmeasured cases with
   * `if (!judged) continue`, and that line was dead.
   */
  if (!ma || !mb) return null;
  const ca = composite(ma, solidBase);
  const cb = composite(mb, solidBase);
  const ratio = contrastRatio(ca, cb);
  return {
    ratio: +ratio.toFixed(2),
    passes: ratio >= 3,
    /** Below 3:1, the signal that a person must confirm a colour-independent distinguisher exists. */
    needsNonColorChannel: ratio < 3,
  };
}
