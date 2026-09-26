import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { judgeRatchet } from './lib/ratchet-base';

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
 * makes it one somebody has to take deliberately by recording the raise.
 */

/**
 * **Judged against the change's merge base, not a literal** (2026-09-26).
 *
 * The ceiling was a literal with a dated paragraph for every deliberate raise, and every
 * one of this file's commits moved it. Two branches that each added a correctly placed
 * surface name conflicted on that line. Now the count runs on the working tree and on the
 * merge-base tree (`tests/contract/lib/ratchet-base.ts`); only growth fails, and a removal
 * is banked by the next branch's base without anyone lowering a number.
 *
 * A deliberate addition is a `tests/contract/ratchet-raises/surface-named-strings.<slug>.json`
 * record whose `why` names the render-site check and the test that holds it, as the
 * paragraphs here used to (they are in this file's Git history). One record covers both
 * locales, which must tell the same story (below).
 *
 * 25 is the measurement at conversion. It is never edited: it serves a clone with no merge
 * base, and is a floor for a tree compared with itself.
 */
const SURFACE_NAMED_FALLBACK = 25;

const NAMES_A_SURFACE = /브라우저|browser/i;

function strings(value: unknown, path = ''): [string, string][] {
  if (typeof value === 'string') return [[path, value]];
  if (!value || typeof value !== 'object') return [];
  return Object.entries(value as Record<string, unknown>).flatMap(([key, next]) =>
    strings(next, path ? `${path}.${key}` : key),
  );
}

/** Every string in one locale's namespace parts, which compose `messages/<locale>.json` one-to-one. */
function catalogueStrings(root: string, locale: string): [string, string][] {
  const dir = join(root, 'messages', locale);
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((name) => name.endsWith('.json'))
    .sort()
    .flatMap((name) => strings(JSON.parse(readFileSync(join(dir, name), 'utf8')) as unknown, name.slice(0, -5)));
}

describe('copy that names the surface the reader is on', () => {
  it.each(['ko', 'en'])('does not grow in %s', (locale) => {
    const all = catalogueStrings(process.cwd(), locale);
    /* Anti-idle: an empty catalogue would pass while measuring nothing. */
    expect(all.length).toBeGreaterThan(500);

    const named = all.filter(([, text]) => NAMES_A_SURFACE.test(text));
    const verdict = judgeRatchet({
      gate: 'surface-named-strings',
      measure: (root) => catalogueStrings(root, locale).filter(([, text]) => NAMES_A_SURFACE.test(text)).length,
      reads: [`messages/${locale}`],
      fallback: SURFACE_NAMED_FALLBACK,
    });
    expect(
      named.length,
      `${named.length} strings name the reader's surface (ceiling ${verdict.ceiling}).\n${verdict.explain}\n` +
        'A sentence naming a surface is only right where that surface is the one the reader is on,\n' +
        'and whether that holds depends on the render site rather than on the words. If the new one\n' +
        'is behind a surface check, record the raise and say which check. If it is not, state\n' +
        'the fact instead of the surface — this screen does not re-measure, the draft is unsaved,\n' +
        'the clipboard was blocked.\n\n' +
        named.map(([key]) => `  ${key}`).join('\n'),
    ).toBeLessThanOrEqual(verdict.ceiling);
  });

  it('keeps both locales telling the same story', () => {
    /* A surface named in one language and not the other is a translation that lost a condition. */
    const count = (locale: string) =>
      catalogueStrings(process.cwd(), locale).filter(([, text]) => NAMES_A_SURFACE.test(text)).length;
    expect(count('ko')).toBe(count('en'));
  });
});
