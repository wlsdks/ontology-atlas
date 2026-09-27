import { describe, expect, it } from 'vitest';
import { readGlobalCss } from '../../scripts/lib/global-css.mjs';

/**
 * **Tailwind scans code only — never documents.**
 *
 * **Why this contract exists** (2026-08-04, a real incident). With only
 * `@import "tailwindcss"`, Tailwind v4 **scans the repository automatically**, which
 * means it reads **class-shaped text written in `.md` prose** as candidates.
 *
 * One `text-[var(…)]` written in `.claude/rules/design.md` while explaining a rule
 * produced `.text-\[var\(…\)\] { color: var(…) }`, Turbopack's CSS parser rejected
 * it, and **`pnpm dev` returned 500 for everything**.
 *
 * **The worst part is that it was silent.** The production build (`pnpm build`) was
 * fine and CI was green — only the local dev server broke, so no automated check
 * caught it, and it surfaced only when another agent working on something else hit
 * it by chance. A document explaining a rule broke the code using that rule.
 *
 * **What is blocked.** Automatic detection is switched off (`source(none)`) and
 * scanning is **limited to code**. Writing class examples in documents stays correct,
 * and so does keeping them out of the build.
 *
 * ⚠️ **Deleting `source(none)` revives automatic detection** — the incident then
 * recurs exactly, with CI green again and only the dev server dead. Hence this
 * pin.
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
