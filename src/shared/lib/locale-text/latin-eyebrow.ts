'use client';

import { useLocale } from 'next-intl';

/**
 * Latin-only eyebrow treatment (mono, uppercase, wide tracking) for Latin-script locales only:
 * Hangul has no capitalisation, and `font-mono` is a Latin subset so only the spaces keep monospace
 * advance. `tracking` stays a literal at the call site so Tailwind's scanner sees it.
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
