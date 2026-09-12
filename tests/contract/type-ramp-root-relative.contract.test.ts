import { readdirSync, readFileSync, statSync } from 'node:fs';
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

/** Every `.ts`/`.tsx` under `src/` and `app/` — the two directories the ramp lint covers. */
function sourceFiles(): string[] {
  const found: string[] = [];
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir)) {
      const full = path.join(dir, entry);
      if (statSync(full).isDirectory()) {
        if (entry === 'node_modules' || entry === 'data') continue;
        walk(full);
      } else if (/\.tsx?$/.test(entry)) {
        found.push(full);
      }
    }
  };
  for (const dir of ['src', 'app']) walk(path.join(ROOT, dir));
  return found;
}

/** Comments are blanked so a px value quoted in prose cannot read as a declaration. */
const CODE = CSS.replace(/\/\*[\s\S]*?\*\//g, (block) => block.replace(/[^\n]/g, ' '));

interface Declaration {
  readonly name: string;
  readonly value: string;
  readonly line: number;
}

function declarations(prefix: 'text' | 'leading'): Declaration[] {
  const found: Declaration[] = [];
  // ⚠️ `(?:^|[{;])` rather than `^`: a one-line scoped override — `[data-dense] { --text-body:
  // 12px; }` — puts the declaration after a brace on the same line, and an anchor that only
  // knows the line start walks straight past it. Nothing formats `app/globals.css` (no
  // prettier or stylelint in `package.json`), so that spelling is a live possibility rather
  // than a hypothetical. The fourth self-probe below plants exactly that line.
  const pattern = new RegExp(`(?:^|[{;])[ \\t]*(--${prefix}-[a-z0-9-]+)\\s*:\\s*([^;{}]+);`, 'gm');
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
    'clamp(2.5rem, 4.8cqw, 96px) — a three-armed size, so no single unit describes it. Its ' +
      'floor IS root-relative (the reader\'s guarantee, and `2.5rem` is the same 40px it was); ' +
      'the `4.8cqw` term answers to its own container, which text zoom cannot reach at all; ' +
      'the `96px` ceiling is the layout\'s limit, not the reader\'s',
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

  it('한 줄 스코프 오버라이드도 잡는다 — 중괄호 뒤의 선언은 선언이다', () => {
    // The anchor's own probe: the same declaration, written after a brace on one line. An
    // earlier version of this detector reported it as absent, which is the quietest way for a
    // ramp step to come back to `px`.
    const oneLine = '[data-dense] { --text-body: 12px; }';
    const pattern = /(?:^|[{;])[ \t]*(--text-[a-z0-9-]+)\s*:\s*([^;{}]+);/gm;
    const found = [...oneLine.matchAll(pattern)].map((m) => `${m[1]}: ${m[2].trim()}`);
    expect(found).toEqual(['--text-body: 12px']);
  });

  it('접두사 밖의 타입 크기 토큰도 루트를 따른다 — 접두사가 사양이 되면 안 된다', () => {
    // `--text-*` is a naming convention, not the quantity. A size token under any other name
    // that a component consumes as a font size through `text-[length:var(…)]` is still type,
    // and until 2026-09-12 `--topology-chrome-title-size: 12px` was exactly that: a 12px type
    // step no ramp gate could see, sitting behind two consumers. The detector reads the
    // consumers rather than guessing from names, so a new one is covered on its first day.
    const sources = sourceFiles();
    expect(sources.length, '스캔이 비었다 — src/app 에서 소비자를 못 찾았다').toBeGreaterThan(50);
    const consumed = new Set<string>();
    for (const file of sources) {
      const body = readFileSync(file, 'utf8');
      for (const match of body.matchAll(/text-\[length:var\((--[a-z0-9-]+)\)\]/g)) {
        consumed.add(match[1]);
      }
    }
    expect(consumed.size, '소비자 스캔이 0 이다 — 정규식이 드리프트했다').toBeGreaterThan(0);

    const offenders: string[] = [];
    for (const name of [...consumed].sort()) {
      // A token that points at a ramp step inherits the ramp's unit by construction.
      const declaration = CODE.match(
        new RegExp(`(?:^|[{;])[ \\t]*${name}\\s*:\\s*([^;{}]+);`, 'm'),
      );
      if (!declaration) continue;
      const value = declaration[1].trim();
      if (/var\(--text-/.test(value)) continue;
      if (/^[0-9.]+rem$/.test(value)) continue;
      if (/^calc\(.*var\(--text-/.test(value)) continue;
      offenders.push(`  ${name}: ${value}`);
    }
    expect(
      offenders,
      '`text-[length:var(…)]` 로 소비되는 크기 토큰이 루트를 따르지 않는다.\n' +
        '접두사가 아니라 수량이 규칙을 정한다 — rem 으로 적거나 var(--text-*) 를\n' +
        '가리킨다. 위반:\n' +
        offenders.join('\n'),
    ).toEqual([]);
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
