import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { controlClass } from '../../src/shared/ui/control-class';
import { readGlobalCss } from '../../scripts/lib/global-css.mjs';

/** A comment is not a value — a trap stepped on four times in this round. */
function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
}

/** Terminates an opening tag by brace depth — steps over multi-line tags and callbacks. */
function openingTag(src: string, from: number): string {
  let depth = 0;
  let quote: string | null = null;
  for (let i = from; i < src.length; i += 1) {
    const c = src[i];
    if (quote) {
      if (c === quote && src[i - 1] !== '\\') quote = null;
    } else if (c === '"' || c === "'" || c === '`') quote = c;
    else if (c === '{') depth += 1;
    else if (c === '}') depth -= 1;
    else if (c === '>' && depth === 0) return src.slice(from, i + 1);
  }
  return src.slice(from, from + 3000);
}

function collectTsx(): string[] {
  const out: string[] = [];
  const walk = (dir: string): void => {
    for (const name of readdirSync(dir)) {
      const p = path.join(dir, name);
      if (statSync(p).isDirectory()) {
        if (name === 'node_modules' || name === '.next') continue;
        walk(p);
        continue;
      }
      if (!/\.tsx$/.test(name) || name.includes('.test.')) continue;
      out.push(p);
    }
  };
  for (const root of ['src', 'app']) walk(path.join(process.cwd(), root));
  return out;
}

/**
 * Keyboard focus ring comes from the value layer and shows only after a real tab press, so a DOM
 * sweep cannot see it. The value layer emits strings, so combinations are assembled here instead.
 */

const ROOT = process.cwd();
const RING = 'focus-visible:ring-';
const OUTLINE_OFF = 'focus-visible:outline-none';

const SHAPES = ['chip', 'icon', 'row', 'link', 'pill', 'card'] as const;
const SIZES = ['sm', 'md', 'lg'] as const;

describe('키보드 초점 — base 레이어가 바닥을 깔고, 값 층이 그 위에 얹는다', () => {
  /**
   * The floor is the base rule in `globals.css`: `:where()` gives specificity 0 and
   * `outline-offset: -2px` keeps box size. Both checks are needed: floor alone hides a value layer
   * that lost its ring; value layer alone leaves bypassing elements bare.
   */
  it('base 레이어가 모든 상호작용 요소에 초점 바닥을 깐다', () => {
    const css = readGlobalCss();
    const rule = /:where\(([\s\S]{0,400}?)\):focus-visible\s*\{([\s\S]{0,200}?)\}/.exec(css);
    expect(rule, 'globals.css 의 `:where(...):focus-visible` 바닥 규칙이 사라졌다').not.toBeNull();

    const selector = rule![1];
    for (const needed of ['button', 'summary', 'a[href]', 'role="button"', 'tabindex']) {
      expect(selector, `초점 바닥이 ${needed} 를 안 덮는다`).toContain(needed);
    }
    // Programmatically moved focus (a modal container) must be excluded. `toContain('-1')` is not enough:
    // it passes while `-1` appears anywhere in the selector.
    expect(
      selector.replace(/\s+/g, ''),
      'tabindex="-1" 를 면제하지 않으면 프로그램으로 옮긴 초점(모달 컨테이너)에도 링이 그려진다',
    ).toContain('[tabindex]:not([tabindex="-1"])');

    const body = rule![2];
    expect(body, '바닥이 아웃라인을 안 그린다').toMatch(/outline:\s*2px/);
    expect(body, '안쪽으로 안 그리면 상자 치수가 바뀌고 이웃과 겹친다').toMatch(/outline-offset:\s*-/);
    expect(body, '초점 색이 인디고 계보가 아니다').toMatch(/--color-indigo/);
  });

  it('모든 모양 × 크기 조합이 초점 링을 싣는다', () => {
    const missing: string[] = [];
    for (const shape of SHAPES) {
      for (const size of SIZES) {
        let out = '';
        try {
          out = controlClass({ shape, size } as Parameters<typeof controlClass>[0]);
        } catch {
          continue; // No such combination means it is outside this contract
        }
        if (!out.includes(RING) || !out.includes(OUTLINE_OFF)) missing.push(`${shape}/${size}`);
      }
    }
    expect(
      missing,
      'When the value layer emits no focus ring, the browser default (the OS accent colour) is drawn,\n' +
        'which is outside the charter of neutrals plus one indigo. Check the FOCUS constant in `control-class.ts`.\n' +
        `Missing: ${missing.join(', ')}`,
    ).toEqual([]);
  });

  it('초점 링 색이 인디고 계보다 — 다른 색이 새로 들어오지 않는다', () => {
    const out = controlClass({ shape: 'chip', size: 'md' });
    const ring = /focus-visible:ring-\[color:var\((--[a-z0-9-]+)\)\]/.exec(out);
    expect(ring, '초점 링이 토큰을 참조하지 않는다').not.toBeNull();
    expect(
      ring![1],
      `초점 링은 인디고 계보여야 한다 — 지금 ${ring![1]}`,
    ).toMatch(/indigo/);
  });

  it('링은 inset 이다 — 촘촘한 행에서 이웃과 겹치지 않고 상자 치수를 안 바꾼다', () => {
    expect(controlClass({ shape: 'row', size: 'md' })).toContain('focus-visible:ring-inset');
  });

  /**
   * A consumer turning off the browser ring with `outline-none` and giving no replacement leaves focus
   * invisible (WCAG 2.4.7). Scope is the opening tag; a border change counts as an indicator and
   * `tabIndex={-1}` containers are exempt because a ring there is the defect.
   */
  it('초점을 끄기만 하고 아무 표시도 안 주는 자리가 없다', () => {
    const files = collectTsx();
    expect(files.length, '스캔이 비었다 — 공집합 위의 게이트는 게이트가 아니다').toBeGreaterThan(150);

    /** Legitimate focus indicators other than a ring — border, background, or shadow changes. */
    const ANY_INDICATOR = /focus-visible:(ring-|border-|bg-|shadow-|text-)/;
    const offenders: string[] = [];
    let scannedTags = 0;

    for (const f of files) {
      const src = stripComments(readFileSync(f, 'utf8'));
      for (const m of src.matchAll(/<[a-zA-Z][a-zA-Z0-9.]*\b/g)) {
        const tag = openingTag(src, m.index ?? 0);
        if (!tag.includes(OUTLINE_OFF)) continue;
        scannedTags += 1;
        // For programmatically moved focus (modal and panel containers) a ring is the defect
        if (/tabIndex=\{-1\}/.test(tag)) continue;
        if (ANY_INDICATOR.test(tag)) continue;
        const line = src.slice(0, m.index).split('\n').length;
        offenders.push(`${path.relative(ROOT, f)}:${line}`);
      }
    }

    expect(scannedTags, '`outline-none` 을 쓰는 태그를 한 개도 못 찾았다 — 탐지기가 죽었다').toBeGreaterThan(50);
    expect(
      offenders,
      '`focus-visible:outline-none` **only removes** the default browser ring. Without a replacement\n' +
        '(one of ring, border, bg or shadow) focus is not visible at all (WCAG 2.4.7).\n' +
        `Violations: ${offenders.join(', ')}`,
    ).toEqual([]);
  });

  it('프로브 — 탐지기가 실제로 먹는다', () => {
    const scan = (body: string): string[] => {
      const src = stripComments(body);
      const out: string[] = [];
      for (const m of src.matchAll(/<[a-zA-Z][a-zA-Z0-9.]*\b/g)) {
        const tag = openingTag(src, m.index ?? 0);
        if (!tag.includes(OUTLINE_OFF)) continue;
        if (/tabIndex=\{-1\}/.test(tag)) continue;
        if (/focus-visible:(ring-|border-|bg-|shadow-|text-)/.test(tag)) continue;
        out.push('hit');
      }
      return out;
    };
    // Violation — turned off with nothing in its place
    expect(scan('<button className="focus-visible:outline-none" />')).toHaveLength(1);
    // Legitimate — ring, border, programmatic container
    expect(scan('<button className="focus-visible:outline-none focus-visible:ring-2" />')).toEqual([]);
    expect(scan('<input className="focus-visible:outline-none focus-visible:border-x" />')).toEqual([]);
    expect(scan('<div tabIndex={-1} className="focus-visible:outline-none" />')).toEqual([]);
    // A quotation inside a comment is not a value
    expect(scan('// <button className="focus-visible:outline-none" />\nconst a = 1;')).toEqual([]);
  });
});
