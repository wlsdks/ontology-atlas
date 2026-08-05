import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { FONT_WEIGHT } from '../../src/shared/ui/font-weight';

/**
 * **그리기 표면의 타입 값** — 캔버스 `ctx.font` 와 인라인 SVG 속성.
 *
 * ## 왜 이 게이트가 없으면 안 되나 (2026-08-05 실측)
 *
 * 무게 축을 DOM 에서 전부 닫고(#942 · #947), 화면 실측으로 「램프 밖 0」을
 * 확인한 뒤에도 **두 층이 램프 밖에 남아 있었다**:
 *
 * | 층 | 무엇 | 왜 아무도 못 봤나 |
 * |---|---|---|
 * | 캔버스 | `ctx.font = \`600 …\`` 4곳 | `.ts` 안에서 숫자를 **템플릿 문자열**에 끼운다 — lint 셀렉터(className)도 램프 래칫(`.tsx` 유틸리티)도 사정거리 밖 |
 * | 인라인 SVG | `fontSize={10}` · `fontWeight={600}` | **JSX 속성**이라 클래스 문자열이 없다 |
 *
 * 그리고 DOM 스윕도 못 잡는다 — 캔버스는 DOM 에 글자를 안 남기고, SVG 는
 * 라우트 하나(`/ko/project/storefront/`)에서만 그려져서 열어 보기 전에는
 * 존재조차 안 보인다.
 *
 * **같은 층 안에서 이미 갈라져 있었다**: `footprint-glyph.ts` 는 `650`(램프
 * 위)을 쓰고 나머지 넷은 `600`(밖)이었다.
 *
 * ## 무엇을 강제하나
 *
 * 1. CSS ↔ JS 거울 일치 (`--font-weight-*` ↔ `FONT_WEIGHT`).
 * 2. 캔버스 `ctx.font` 에 **무게 리터럴 금지** — `FONT_WEIGHT` 를 참조한다.
 * 3. 인라인 SVG 에 `fontSize`/`fontWeight` **속성 금지** — `className` 으로
 *    주면 SVG `<text>` 에도 CSS 가 그대로 먹고, 그 순간 기존 lint·래칫의
 *    사정거리 안으로 들어온다.
 */

const ROOT = process.cwd();
const CSS = readFileSync(path.join(ROOT, 'app/globals.css'), 'utf8');

function cssWeight(name: string): number {
  const m = CSS.match(new RegExp(`^\\s*--font-weight-${name}\\s*:\\s*(\\d+);`, 'm'));
  if (!m) throw new Error(`--font-weight-${name} 이 app/globals.css 에 없다`);
  return Number(m[1]);
}

/** 주석은 값이 아니다 — 이 라운드에서 세 번 밟은 함정(양방향 모두). */
function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
}

interface Scan {
  files: number;
  canvasFontLiteral: string[];
  svgTypeAttr: string[];
}

export function scanSource(rel: string, raw: string, acc: Scan): void {
  const src = stripComments(raw);
  acc.files += 1;
  // `ctx.font = \`600 …\`` — 무게가 리터럴 숫자로 시작하는 canvas font 문자열
  for (const m of src.matchAll(/\.font\s*=\s*`(\d+)\s/g)) {
    acc.canvasFontLiteral.push(`${rel}  ctx.font = \`${m[1]} …\``);
  }
  // JSX 속성으로 준 타입 값
  for (const m of src.matchAll(/\bfont(Size|Weight)=\{?["']?([\d.]+)/g)) {
    acc.svgTypeAttr.push(`${rel}  font${m[1]}={${m[2]}}`);
  }
}

function scanRepo(): Scan {
  const acc: Scan = { files: 0, canvasFontLiteral: [], svgTypeAttr: [] };
  const walk = (dir: string): void => {
    for (const name of readdirSync(dir)) {
      const p = path.join(dir, name);
      if (statSync(p).isDirectory()) {
        if (name === 'node_modules' || name === '.next') continue;
        walk(p);
        continue;
      }
      if (!/\.(ts|tsx)$/.test(name) || name.includes('.test.') || name.includes('.spec.')) continue;
      scanSource(path.relative(ROOT, p), readFileSync(p, 'utf8'), acc);
    }
  };
  for (const root of ['src', 'app']) walk(path.join(ROOT, root));
  return acc;
}

describe('그리기 표면의 타입 값 — 캔버스 · 인라인 SVG', () => {
  const scan = scanRepo();

  it('CSS 램프와 JS 거울이 같은 값이다', () => {
    expect(FONT_WEIGHT.signature).toBe(cssWeight('signature'));
    expect(FONT_WEIGHT.emphasis).toBe(cssWeight('emphasis'));
    expect(FONT_WEIGHT.strong).toBe(cssWeight('strong'));
    expect(Object.keys(FONT_WEIGHT).sort()).toEqual(['emphasis', 'signature', 'strong']);
  });

  it('스캔이 비어 있지 않다 — 공집합 위의 게이트는 게이트가 아니다', () => {
    expect(scan.files).toBeGreaterThan(200);
  });

  it('캔버스 ctx.font 에 무게 리터럴이 없다 — FONT_WEIGHT 를 참조한다', () => {
    expect(
      scan.canvasFontLiteral,
      '캔버스는 `var()` 를 못 읽으므로 값을 옮겨 적을 수밖에 없고, 옮겨 적은 값은\n' +
        '게이트가 없으면 드리프트한다 — 실제로 `600` 4곳과 `650` 1곳으로 갈려 있었다.\n' +
        '`FONT_WEIGHT.strong` 처럼 거울을 참조하라.\n' +
        scan.canvasFontLiteral.join('\n'),
    ).toEqual([]);
  });

  it('인라인 SVG 에 fontSize/fontWeight 속성이 없다 — className 으로 준다', () => {
    expect(
      scan.svgTypeAttr,
      'SVG `<text>` 에도 CSS font-size/weight 가 그대로 먹는다. 속성으로 주면\n' +
        '클래스 문자열이 없어 lint 셀렉터도 램프 래칫도 한 글자도 못 본다.\n' +
        '`className="text-caption font-[var(--font-weight-strong)]"` 처럼 준다.\n' +
        scan.svgTypeAttr.join('\n'),
    ).toEqual([]);
  });

  it('프로브 — 탐지기가 실제로 먹는다', () => {
    const probe = (body: string): Scan => {
      const acc: Scan = { files: 0, canvasFontLiteral: [], svgTypeAttr: [] };
      scanSource('probe.ts', body, acc);
      return acc;
    };
    // 위반
    expect(probe('ctx.font = `600 12px mono`;').canvasFontLiteral).toHaveLength(1);
    expect(probe('<text fontSize={10} />').svgTypeAttr).toHaveLength(1);
    expect(probe('<text fontWeight={600} />').svgTypeAttr).toHaveLength(1);
    // 정상 — 거울 참조 · 클래스
    expect(probe('ctx.font = `${FONT_WEIGHT.strong} 12px mono`;').canvasFontLiteral).toEqual([]);
    expect(probe('<text className="text-caption font-[var(--font-weight-strong)]" />').svgTypeAttr).toEqual([]);
    // 주석 속 인용은 값이 아니다
    expect(probe('// ctx.font = `600 12px mono` 는 금지다\nconst a = 1;').canvasFontLiteral).toEqual([]);
    expect(probe('/* <text fontSize={10} /> 처럼 쓰지 마라 */\nconst a = 1;').svgTypeAttr).toEqual([]);
  });
});
