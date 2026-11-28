import { describe, expect, it } from 'vitest';
import { readGlobalCss } from '../../../scripts/lib/design/global-css.mjs';

/**
 * Tailwind scans code only: with automatic detection on, class-shaped text in `.md` prose becomes
 * a candidate and can break the dev server. Deleting `source(none)` revives that.
 */

describe('Tailwind source scan scope', () => {
  const css = readGlobalCss();

  it('turns auto-detection off — otherwise it sweeps documents and prose too', () => {
    expect(
      /@import\s+"tailwindcss"\s+source\(none\)\s*;/.test(css),
      'It must be `@import "tailwindcss" source(none);`. Without `source(none)` ' +
        'Tailwind scans the repository on its own, turns text like `text-[var(…)]` inside `.md` prose ' +
        'into classes, the bundler rejects that CSS and `pnpm dev` answers 500 ' +
        '(a real incident on 2026-08-04, under the previous bundler; the production build was fine, so CI missed it).',
    ).toBe(true);
  });

  it('names where to sweep explicitly — code only, not documents', () => {
    const sources = [...css.matchAll(/@source\s+"([^"]+)"/g)].map((m) => m[1]);
    expect(sources.length, 'if `source(none)` is on, code must be registered with `@source`').toBeGreaterThan(0);

    // Mixing documents into the scanned paths removes this contract's reason to exist.
    const docLike = sources.filter((s) => /\.md|docs\/|\.claude\/|\.agents\//.test(s));
    expect(
      docLike,
      `An @source scans documents: ${docLike.join(' · ')}. Class-shaped text inside prose ` +
        'becomes CSS and breaks the dev server.',
    ).toEqual([]);

    // If code drops out, classes vanish silently — the screen collapses with no error.
    for (const need of ['app/', 'src/']) {
      expect(
        sources.some((s) => s.includes(need)),
        `@source lacks ${need} — the classes under it drop out of the CSS wholesale`,
      ).toBe(true);
    }
  });
});
