import { describe, expect, it } from 'vitest';
import { readGlobalCss } from '../../scripts/lib/global-css.mjs';

/**
 * Tailwind scans code only: with automatic detection on, class-shaped text in `.md` prose becomes
 * a candidate and can break the dev server. Deleting `source(none)` revives that.
 */

describe('Tailwind 소스 스캔 범위', () => {
  const css = readGlobalCss();

  it('자동 탐지를 끈다 — 안 끄면 문서·산문까지 훑는다', () => {
    expect(
      /@import\s+"tailwindcss"\s+source\(none\)\s*;/.test(css),
      'It must be `@import "tailwindcss" source(none);`. Without `source(none)` ' +
        'Tailwind scans the repository on its own, turns text like `text-[var(…)]` inside `.md` prose ' +
        'into classes, Turbopack rejects that CSS and `pnpm dev` answers 500 ' +
        '(a real incident on 2026-08-04; the production build was fine, so CI missed it).',
    ).toBe(true);
  });

  it('훑을 곳을 명시한다 — 코드만, 문서는 아니다', () => {
    const sources = [...css.matchAll(/@source\s+"([^"]+)"/g)].map((m) => m[1]);
    expect(sources.length, '`source(none)` 을 켰으면 `@source` 로 코드를 등록해야 한다').toBeGreaterThan(0);

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
        `@source 에 ${need} 가 없다 — 그 아래 클래스가 CSS 에서 통째로 빠진다`,
      ).toBe(true);
    }
  });
});
