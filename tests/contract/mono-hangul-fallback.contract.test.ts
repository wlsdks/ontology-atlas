import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

/**
 * `font-mono` is used for slugs, paths, tabular numerals **and** for the uppercase
 * eyebrow/data micro-labels this app writes in Korean (194 measured
 * `uppercase` + `font-mono` instances). JetBrains Mono has no Hangul, so with only
 * `ui-monospace, monospace` behind it every Korean string in that stack fell
 * through to the system monospace face, which sets Hangul full-width and swaps in
 * fullwidth punctuation. Shipped rc.10 showed it plainly: wide gaps between
 * syllables and fullwidth parentheses in eyebrow and data labels.
 *
 * The Korean face has to sit **after** the mono face (Latin and digits keep the
 * monospaced form) and **before** the generic fallbacks (Hangul never reaches the
 * system monospace).
 */
describe('mono font stack', () => {
  const css = readFileSync(join(process.cwd(), 'app/globals.css'), 'utf8');

  it('resolves Hangul to the Korean face instead of a system monospace fallback', () => {
    const match = css.match(/--font-mono:\s*([^;]+);/);
    expect(match, '--font-mono must be declared in app/globals.css').not.toBeNull();

    const stack = match![1].split(',').map((part) => part.trim());
    const monoIndex = stack.findIndex((part) => part.includes('--font-jetbrains'));
    const koreanIndex = stack.findIndex((part) => part.includes('--font-pretendard'));
    const genericIndex = stack.findIndex((part) => /ui-monospace|^monospace$/.test(part));

    expect(monoIndex, 'the monospaced face still leads the stack').toBe(0);
    expect(koreanIndex, 'a Hangul-capable face must be in the stack').toBeGreaterThan(-1);
    expect(
      koreanIndex,
      'the Korean face must come before the generic monospace fallbacks',
    ).toBeLessThan(genericIndex);
  });
});
