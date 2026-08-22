'use client';

import { useLocale } from 'next-intl';

/**
 * Turns the Latin-only eyebrow treatment (mono + uppercase + wide tracking) on
 * **for Latin-script locales only**.
 *
 * This is the code-side single source for `docs/DESIGN-SYSTEM.md`
 * "라틴 전용 장식은 한글에 얹지 않는다" (do not put Latin-only decoration on
 * Hangul, 2026-07-26). That section's reasoning is the whole of this function:
 *
 * - `uppercase` plus wide tracking is how a Latin small-caps subhead reads, but
 *   Hangul has no capitalisation, so **only the letter spacing** widens.
 * - `font-mono` (JetBrains Mono) is a Latin subset, so Hangul falls back and
 *   **only the spaces** keep the monospace advance — 「첫 실행」 ends up reading
 *   as 「첫  실행」.
 * - The eyebrow itself is not banned, though: on English labels, tabs and
 *   legends it is a legitimate signal.
 *
 * So the condition drops to the locale. Measured at 1512×950 in Korean: 12 places
 * on the first screen were putting 1.36–2.09px of tracking on Hangul.
 *
 * `tracking` is passed through by the caller — eyebrows differ in width, and it
 * is safer to leave the literal where Tailwind's source scanner can see it, at
 * the call site.
 */
const LATIN_SCRIPT_LOCALES = new Set(['en']);

export function isLatinScriptLocale(locale: string): boolean {
  return LATIN_SCRIPT_LOCALES.has(locale.split('-')[0].toLowerCase());
}

export function latinEyebrowClass(locale: string, tracking = ''): string {
  if (!isLatinScriptLocale(locale)) return '';
  return tracking ? `font-mono uppercase ${tracking}` : 'font-mono uppercase';
}

/**
 * For components — picks the eyebrow classes from the current screen language.
 *
 * `useLocale()` is called unconditionally. A component rendered outside the intl
 * provider cannot use this hook, and that is a render tree to fix rather than
 * something to paper over with a fallback (widget tests that inject labels as
 * props mock the provider).
 */
export function useLatinEyebrow(tracking = ''): string {
  return latinEyebrowClass(useLocale(), tracking);
}
