import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { column, concept } from '../../scripts/lib/locale-vocabulary.mjs';
import { judgeRatchet } from './lib/ratchet-base';

/**
 * A string naming the surface the reader is on can be right on only one of them, and that depends on
 * the render site. So this counts instead of judging, and the count may fall but never rise.
 */

/**
 * Judged against the merge base (`tests/contract/lib/ratchet-base.ts`); only growth fails. An addition
 * is a `tests/contract/ratchet-raises/surface-named-strings/<slug>.json` record. The fallback serves
 * a clone with no merge base and is never edited.
 */
const SURFACE_NAMED_FALLBACK: number = concept('surfaceNaming').fallback;

const namesASurface = (locale: string): RegExp => column('surfaceNaming', locale).pattern;

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
  it.each(concept('surfaceNaming').applies as string[])('does not grow in %s', (locale) => {
    const all = catalogueStrings(process.cwd(), locale);
    /* Anti-idle: an empty catalogue would pass while measuring nothing. */
    expect(all.length).toBeGreaterThan(500);

    const named = all.filter(([, text]) => namesASurface(locale).test(text));
    const verdict = judgeRatchet({
      gate: 'surface-named-strings',
      measure: (root) => catalogueStrings(root, locale).filter(([, text]) => namesASurface(locale).test(text)).length,
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

  it('keeps every locale telling the same story', () => {
    /* A surface named in one language and not the other is a translation that lost a condition. */
    const count = (locale: string) =>
      catalogueStrings(process.cwd(), locale).filter(([, text]) => namesASurface(locale).test(text)).length;
    for (const locale of concept('surfaceNaming').applies as string[]) expect(count(locale)).toBe(count('en'));
  });
});
