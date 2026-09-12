import { readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

/**
 * **Every step of the type ramp follows the root font size.**
 *
 * A browser's *text-only* zoom — Chrome's Appearance → Font size, Firefox's "Zoom text only",
 * Safari's accessibility text size — multiplies the **root font size** and nothing else. A ramp
 * written in `px` is immune to it, and until 2026-09-12 this one was: every setting, at every
 * step up to 200%, left Atlas rendering pixel-for-pixel identical, so the whole accessibility
 * control was inert on every surface (carry-forward finding, U2 council, 2026-09-11).
 *
 * The defect left **no value in the code** — `9.5px` is a legitimate size, and the screen looked
 * right. What was wrong was the *unit*, and nothing in the repository could see a unit: the
 * ramp's own inventory gate (`type-ramp-step-defined`) stops at the colon, the lint selectors
 * match class strings, and the computed-pixel gates measure a rendered page at one root, where
 * `px` and `rem` are indistinguishable by construction. That is why this file exists and why it
 * reads the declaration rather than a screen: it is the only instrument that can fail.
 *
 * The complement — that the ramp still renders the same pixels at 100%, and that it actually
 * doubles at 200% while the chrome holds still — is measured in the browser by
 * `tests/e2e/text-zoom-ramp.spec.ts`. Neither gate replaces the other: this one cannot see a
 * screen, and that one cannot tell `px` from `rem` at the default root.
 */
const ROOT = process.cwd();
const CSS = readFileSync(path.join(ROOT, 'app/globals.css'), 'utf8');

/** Comments are blanked so a px value quoted in prose cannot read as a declaration. */
const CODE = CSS.replace(/\/\*[\s\S]*?\*\//g, (block) => block.replace(/[^\n]/g, ' '));

interface Declaration {
  readonly name: string;
  readonly value: string;
  readonly line: number;
}

function declarations(prefix: 'text' | 'leading'): Declaration[] {
  const found: Declaration[] = [];
  const pattern = new RegExp(`^[ \\t]*(--${prefix}-[a-z0-9-]+)\\s*:\\s*([^;{}]+);`, 'gm');
  for (const match of CODE.matchAll(pattern)) {
    // The `--text-<step>--line-height` companions are pointers at a `--leading-*` step, not
    // sizes of their own; the step they point at is checked on its own row.
    if (match[1].endsWith('--line-height')) continue;
    found.push({
      name: match[1],
      value: match[2].trim(),
      line: CODE.slice(0, match.index).split('\n').length,
    });
  }
  return found;
}

/**
 * The steps that are deliberately **not** root-relative, each with the reason written beside
 * the token in `app/globals.css`. A new name may only be added here with that reason and a
 * `docs/DECISIONS.md` record — the list is short on purpose.
 */
const NOT_ROOT_RELATIVE = new Map<string, string>([
  [
    '--text-monument',
    'clamp(40px, 4.8cqw, 96px) — derived from its own container, not a step spent on reading; ' +
      'its specification is that the headline stands on one line inside its measure, and text ' +
      'zoom cannot reach a `cqw` term at all',
  ],
  ['--leading-display-tight', 'a ratio — it already follows the size it is applied to'],
  ['--leading-prose', 'a ratio — it already follows the size it is applied to'],
  ['--leading-monument', 'a ratio — it already follows the size it is applied to'],
]);

describe('타입 램프는 루트 글꼴 크기를 따른다', () => {
  it('탐지기가 램프를 실제로 읽는다 — 빈 스캔은 통과가 아니라 결함이다', () => {
    // If the path or the pattern drifts, every assertion below goes green over an empty set.
    expect(declarations('text').length).toBeGreaterThanOrEqual(9);
    expect(declarations('leading').length).toBeGreaterThanOrEqual(11);
  });

  it.each(['text', 'leading'] as const)(
    '--%s-* 의 모든 단은 rem 이다 — px 는 브라우저 글자 확대가 닿지 않는다',
    (prefix) => {
      const offenders = declarations(prefix)
        .filter((entry) => !NOT_ROOT_RELATIVE.has(entry.name))
        .filter((entry) => !/^[0-9.]+rem$/.test(entry.value))
        .map((entry) => `  app/globals.css:${entry.line}  ${entry.name}: ${entry.value}`);

      expect(
        offenders,
        '램프 단이 루트에 상대적이지 않다. px 로 쓰면 브라우저의 «글자만 확대»\n' +
          '설정이 이 단에 전혀 닿지 않는다 (2026-09-11 U2 carry-forward: 200% 에서\n' +
          '화면이 픽셀 단위로 동일했다). 16px 루트로 나눠 rem 으로 적는다 —\n' +
          '9.5px → 0.59375rem. 램프 밖에 서야 하는 단이라면 이 파일의\n' +
          'NOT_ROOT_RELATIVE 에 사유와 함께 등록하고 docs/DECISIONS.md 에 기록한다.\n' +
          '위반:\n' +
          offenders.join('\n'),
      ).toEqual([]);
    },
  );

  it('예외 목록이 실재하는 토큰만 담는다 — 죽은 예외는 사양이 아니라 오정보다', () => {
    const names = new Set([
      ...declarations('text').map((entry) => entry.name),
      ...declarations('leading').map((entry) => entry.name),
    ]);
    const dead = [...NOT_ROOT_RELATIVE.keys()].filter((name) => !names.has(name));
    expect(dead, '예외 목록에 이제 존재하지 않는 토큰이 남아 있다').toEqual([]);
  });

  it('예외는 rem 으로 슬그머니 바뀌지 않는다 — 바뀌면 예외가 아니라 단이다', () => {
    // The other direction of the same rule: if a documented exception becomes a plain `rem`
    // value, its reason no longer describes it and the entry must leave this list.
    const all = [...declarations('text'), ...declarations('leading')];
    const stale = all
      .filter((entry) => NOT_ROOT_RELATIVE.has(entry.name))
      .filter((entry) => /^[0-9.]+rem$/.test(entry.value))
      .map((entry) => `  ${entry.name}: ${entry.value}`);
    expect(stale, '예외로 등록된 단이 평범한 rem 이 됐다 — 목록에서 내린다').toEqual([]);
  });

  it('읽는 값은 주석이 아니라 선언이다 — 산문에 적힌 px 에 속지 않는다', () => {
    // Self-probe for the comment blanking: the file is full of prose citing `9.5px` and `14px`,
    // and a detector that read those would report offenders that do not exist (or, worse, find
    // a "declaration" in a history note and pass on it).
    expect(CSS).toContain('9.5px');
    const quotedInCode = declarations('text').filter((entry) => entry.value === '9.5px');
    expect(quotedInCode).toEqual([]);
  });
});
