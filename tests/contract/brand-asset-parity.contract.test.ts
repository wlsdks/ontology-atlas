import { render } from '@testing-library/react';
import { createElement } from 'react';
import { describe, expect, it } from 'vitest';
import {
  BRAND_RADII,
  BRAND_STROKES,
  BrandMark,
  type BrandMarkDetail,
} from '@/shared/ui/brand-mark';
// The build script is plain .mjs — tsc reads its types from JSDoc.
import { markBody, STROKES } from '../../scripts/build-brand-assets.mjs';

/**
 * Brand mark 2-way contract — locks that the component drawing it on screen
 * (`src/shared/ui/brand-mark.tsx`) and the script baking the OS icons
 * (`scripts/build-brand-assets.mjs`) draw **the same picture**.
 *
 * **Why compare output rather than values.** A `.mjs` cannot import a `.tsx`, so
 * coordinates and stroke widths exist in two copies. The script's header claims
 * everything is derived from the component, but in fact it is a **duplicate**, and
 * duplicates always diverge — the same reason this repository keeps 3-way parser and
 * 2-way validator contract tests.
 *
 * Comparing values alone misses "the table matches but the drawing site uses a
 * different value". So both sides' **actually emitted SVG** is parsed and matched
 * layer by layer. That trap was real: a stroke width was fixed while `INK_HEIGHT`
 * still held the old value, throwing off the icon's scale.
 *
 * **Floors on the gaps between ink.** Stroke widths on the compact and micro marks
 * are not taste but **device px at their render size**. The first values were a
 * 1.03px micro stroke (the thickness antialiasing turns into grey mush) and a 1.34px
 * compact node-to-outer gap (the spacing at which the layers merge and the bottom
 * looks swollen). The floors below prevent that regression.
 */

/** Regular hexagon in the 512 coordinate system — flat-side distance = circumradius × cos30°. */
const COS30 = Math.cos(Math.PI / 6);

/** The plate/canvas this mark ships on — the same value as `appIconSvg`. */
const CANVAS = 1024;
const PLATE = 824;
const MARK_RATIO = 0.81;

/** How many device px one unit of the 512 coordinate system occupies in a `size` px icon. */
function unitPx(size: number, inkHeight: number): number {
  return ((PLATE * MARK_RATIO) / inkHeight) * (size / CANVAS);
}

/** Normalises the layers the component drew into {part: stroke width or radius}. */
function fromComponent(detail: BrandMarkDetail) {
  const { container } = render(createElement(BrandMark, { detail }));
  const out = new Map<string, number[]>();
  for (const el of container.querySelectorAll('[data-mark-part]')) {
    const part = el.getAttribute('data-mark-part')!;
    const value = Number(el.getAttribute('stroke-width') ?? el.getAttribute('r') ?? NaN);
    out.set(part, [...(out.get(part) ?? []), value]);
  }
  return out;
}

/** Normalises the SVG string the script emitted into the same shape. */
function fromScript(detail: BrandMarkDetail) {
  const svg = markBody(detail, { paint: 'currentColor' }) as string;
  const out = new Map<string, number[]>();
  const push = (part: string, v: number) => out.set(part, [...(out.get(part) ?? []), v]);
  for (const m of svg.matchAll(/<path d="M 256 (\d+)[^"]*"(?:[^>]*?stroke-width="(\d+)")?/g)) {
    // A path's first y coordinate identifies its layer — 256 − circumradius.
    const r = 256 - Number(m[1]);
    const width = m[2] ? Number(m[2]) : NaN;
    if (r === BRAND_RADII.outer) push('hexagon', width);
    else if (r === BRAND_RADII.dashed) push('path-layer', width);
    else if (r === BRAND_RADII.mid) push('mid', width);
    else if (r === BRAND_RADII.core) push('core', width);
    else if (r === BRAND_RADII.microCore) push('core', NaN); // Filled — no stroke width
    else throw new Error(`스크립트가 알 수 없는 반지름의 층을 그렸다: ${r}`);
  }
  for (const m of svg.matchAll(/<line[^>]*stroke-width="(\d+)"/g)) push('spoke', Number(m[1]));
  for (const m of svg.matchAll(/<circle[^>]*r="(\d+)"/g)) push('node', Number(m[1]));
  return out;
}

const DETAILS: BrandMarkDetail[] = ['full', 'compact', 'micro'];

describe('브랜드 마크 — 컴포넌트와 자산 스크립트가 같은 그림을 그린다', () => {
  it('굵기 표가 두 쪽에서 같다', () => {
    expect(STROKES).toEqual({ ...BRAND_STROKES });
  });

  it.each(DETAILS)('%s — 층 구성과 굵기가 일치한다', (detail) => {
    const component = fromComponent(detail);
    const script = fromScript(detail);
    expect(
      [...script.keys()].sort(),
      `${detail}: 스크립트와 컴포넌트의 층 목록이 다르다`,
    ).toEqual([...component.keys()].sort());
    for (const [part, widths] of component) {
      expect(script.get(part), `${detail}/${part} 의 굵기가 다르다`).toEqual(widths);
    }
  });

  /**
   * The micro mark lives at 16px. Below a 1px stroke, antialiasing makes grey mush;
   * below a 1px ring-to-core gap, the background is invisible and the two layers merge
   * into one.
   */
  it('미형 @16px — 획과 간격이 1 device px 아래로 내려가지 않는다', () => {
    const u = unitPx(16, 400 + BRAND_STROKES.microOuter);
    const stroke = BRAND_STROKES.microOuter * u;
    const gap =
      (BRAND_RADII.outer * COS30 - BRAND_STROKES.microOuter / 2 - BRAND_RADII.microCore * COS30) *
      u;
    expect(stroke, `미형 획이 ${stroke.toFixed(2)}px 로 너무 얇다`).toBeGreaterThanOrEqual(1.2);
    expect(gap, `링↔핵 간격이 ${gap.toFixed(2)}px 로 붙는다`).toBeGreaterThanOrEqual(1);
  });

  /**
   * The compact mark lives at 32px. When the node touches the outer hexagon the bottom
   * looks swollen — the first value (node r=42) measured 1.34px, and that was what
   * "looks merged" actually was.
   */
  it('축약형 @32px — 겹끼리도, 노드와 바깥도 1.5 device px 이상 떨어진다', () => {
    const u = unitPx(32, 400 + BRAND_STROKES.compactOuter);
    const rings =
      (BRAND_RADII.outer * COS30 -
        BRAND_STROKES.compactOuter / 2 -
        (BRAND_RADII.mid * COS30 + BRAND_STROKES.compactMid / 2)) *
      u;
    const nodeToOuter =
      (BRAND_RADII.outer - BRAND_STROKES.compactOuter / 2 - BRAND_RADII.mid - BRAND_STROKES.compactNode) * u;
    expect(rings, `겹 간격이 ${rings.toFixed(2)}px`).toBeGreaterThanOrEqual(1.5);
    expect(nodeToOuter, `노드↔바깥이 ${nodeToOuter.toFixed(2)}px`).toBeGreaterThanOrEqual(1.5);
    // The middle stroke must not disappear either.
    expect(BRAND_STROKES.compactMid * u).toBeGreaterThanOrEqual(1);
  });

  /**
   * The nodes must sit **on the middle hexagon's vertices**. Once their radius drops
   * below half the middle stroke they submerge inside it and vanish, and the mark loses
   * its meaning of "layers and connections".
   */
  it('축약형 노드는 중간 획에 잠기지 않는다', () => {
    expect(BRAND_STROKES.compactNode).toBeGreaterThan(BRAND_STROKES.compactMid);
  });
});
