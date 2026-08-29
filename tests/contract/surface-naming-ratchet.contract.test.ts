import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/**
 * ⚠️ **A string that names the surface the reader is on can only be right on one of them.**
 *
 * Two of these were found on 2026-08-28, both by looking at the installed app rather than by
 * reading code, and neither was catchable any other way — the sentences were grammatical, and a
 * full-page screenshot shows nothing wrong with a sentence that is simply in the wrong place:
 *
 * | Where | What the app said |
 * |---|---|
 * | architecture record stamp | "this browser cannot confirm the source still matches" — beside a panel listing 87 modules it had just read from disk |
 * | docs editor, git panel | an unsaved draft "kept in browser", and any blocked clipboard blamed on "the browser" |
 *
 * The defect is never the word. It is a sentence naming a surface while sitting on a code path
 * that runs on both, and whether that is true depends on the render site, not on the string. So
 * this counts rather than judges: `.claude/rules/documentation.md` allows a mechanical inventory
 * ratchet and forbids a hand-written list of forbidden words, because a word list weakens silently
 * unless somebody keeps expanding it while a count cannot.
 *
 * **The number may fall and never rise.** Adding one is not forbidden — the download call to
 * action, the degraded-runtime notes and the unsupported-picker warning all name the browser
 * correctly, because the browser is what their reader is actually in. It is a decision, and this
 * makes it one somebody has to take deliberately by moving the number.
 */

/** Measured 2026-08-28, after the two defects above were repaired. Lower it when you remove one. */
const SURFACE_NAMED_CEILING = 17;

const NAMES_A_SURFACE = /브라우저|browser/i;

function strings(value: unknown, path = ''): [string, string][] {
  if (typeof value === 'string') return [[path, value]];
  if (!value || typeof value !== 'object') return [];
  return Object.entries(value as Record<string, unknown>).flatMap(([key, next]) =>
    strings(next, path ? `${path}.${key}` : key),
  );
}

describe('copy that names the surface the reader is on', () => {
  it.each(['ko', 'en'])('does not grow in %s', (locale) => {
    const catalogue = JSON.parse(readFileSync(`messages/${locale}.json`, 'utf8')) as unknown;
    const all = strings(catalogue);
    /* Anti-idle: an empty catalogue would pass while measuring nothing. */
    expect(all.length).toBeGreaterThan(500);

    const named = all.filter(([, text]) => NAMES_A_SURFACE.test(text));
    expect(
      named.length,
      `${named.length} strings name the reader's surface (ceiling ${SURFACE_NAMED_CEILING}).\n` +
        'A sentence naming a surface is only right where that surface is the one the reader is on,\n' +
        'and whether that holds depends on the render site rather than on the words. If the new one\n' +
        'is behind a surface check, raise the ceiling in this file and say so. If it is not, state\n' +
        'the fact instead of the surface — this screen does not re-measure, the draft is unsaved,\n' +
        'the clipboard was blocked.\n\n' +
        named.map(([key]) => `  ${key}`).join('\n'),
    ).toBeLessThanOrEqual(SURFACE_NAMED_CEILING);
  });

  it('keeps both locales telling the same story', () => {
    /* A surface named in one language and not the other is a translation that lost a condition. */
    const count = (locale: string) =>
      strings(JSON.parse(readFileSync(`messages/${locale}.json`, 'utf8')) as unknown).filter(
        ([, text]) => NAMES_A_SURFACE.test(text),
      ).length;
    expect(count('ko')).toBe(count('en'));
  });
});
