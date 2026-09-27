import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { FONT_WEIGHT } from '../../src/shared/ui/font-weight';
import { readGlobalCss } from '../../scripts/lib/global-css.mjs';

/**
 * **Type values on drawing surfaces** — canvas `ctx.font` and inline SVG attributes.
 *
 * **Why this gate is required (measured 2026-08-05).** After closing the weight axis
 * everywhere in the DOM (#942, #947) and confirming "0 off-ramp" by on-screen
 * measurement, **two layers were still off the ramp**:
 *
 * | Layer | What | Why nobody saw it |
 * |---|---|---|
 * | canvas | `ctx.font = \`600 …\`` in 4 places | numbers interpolated into a **template string** inside `.ts` — out of range for both the lint selector (className) and the ramp ratchet (`.tsx` utilities) |
 * | inline SVG | `fontSize={10}` · `fontWeight={600}` | **JSX attributes**, so there is no class string |
 *
 * A DOM sweep cannot catch them either — canvas leaves no text in the DOM, and the
 * SVG renders on exactly one route (`/ko/project/storefront/`), so its existence is
 * invisible until that route is opened.
 *
 * **They had already diverged within one layer**: `footprint-glyph.ts` used `650`
 * (on the ramp) while the other four used `600` (off it).
 *
 * **What it enforces:**
 *
 * 1. CSS ↔ JS mirror agreement (`--font-weight-*` ↔ `FONT_WEIGHT`).
 * 2. **No weight literal** in a canvas `ctx.font` — reference `FONT_WEIGHT`.
 * 3. **No `fontSize`/`fontWeight` attributes** on inline SVG — passing them via
 *    `className` makes CSS apply to SVG `<text>` too, which puts them inside the
 *    range of the existing lint rules and ratchets.
 */

const ROOT = process.cwd();
const CSS = readGlobalCss();

function cssWeight(name: string): number {
  const m = CSS.match(new RegExp(`^\\s*--font-weight-${name}\\s*:\\s*(\\d+);`, 'm'));
  if (!m) throw new Error(`--font-weight-${name} 이 app/globals.css 에 없다`);
  return Number(m[1]);
}

/** A comment is not a value — the trap hit three times in this round, in both directions. */
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
  // `ctx.font = \`600 …\`` — a canvas font string starting with a literal weight
  for (const m of src.matchAll(/\.font\s*=\s*`(\d+)\s/g)) {
    acc.canvasFontLiteral.push(`${rel}  ctx.font = \`${m[1]} …\``);
  }
  // Type values passed as JSX attributes
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
      'A canvas cannot read `var()`, so the value has to be copied, and a copied value\n' +
        'drifts without a gate: it had split into `600` at four sites and `650` at one.\n' +
        'Read the mirror instead, as in `FONT_WEIGHT.strong`.\n' +
        scan.canvasFontLiteral.join('\n'),
    ).toEqual([]);
  });

  it('인라인 SVG 에 fontSize/fontWeight 속성이 없다 — className 으로 준다', () => {
    expect(
      scan.svgTypeAttr,
      'CSS font-size and font-weight apply to SVG `<text>` as well. Given as attributes,\n' +
        'there is no class string, so neither the lint selectors nor the ramp ratchet see a thing.\n' +
        'Use a class, as in `className="text-caption font-[var(--font-weight-strong)]"`.\n' +
        scan.svgTypeAttr.join('\n'),
    ).toEqual([]);
  });

  it('프로브 — 탐지기가 실제로 먹는다', () => {
    const probe = (body: string): Scan => {
      const acc: Scan = { files: 0, canvasFontLiteral: [], svgTypeAttr: [] };
      scanSource('probe.ts', body, acc);
      return acc;
    };
    // Violation
    expect(probe('ctx.font = `600 12px mono`;').canvasFontLiteral).toHaveLength(1);
    expect(probe('<text fontSize={10} />').svgTypeAttr).toHaveLength(1);
    expect(probe('<text fontWeight={600} />').svgTypeAttr).toHaveLength(1);
    // Clean — mirror reference, class
    expect(probe('ctx.font = `${FONT_WEIGHT.strong} 12px mono`;').canvasFontLiteral).toEqual([]);
    expect(probe('<text className="text-caption font-[var(--font-weight-strong)]" />').svgTypeAttr).toEqual([]);
    // A quotation inside a comment is not a value
    expect(probe('// ctx.font = `600 12px mono` 는 금지다\nconst a = 1;').canvasFontLiteral).toEqual([]);
    expect(probe('/* <text fontSize={10} /> 처럼 쓰지 마라 */\nconst a = 1;').svgTypeAttr).toEqual([]);
  });
});
