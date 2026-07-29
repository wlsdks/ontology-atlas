import { render } from '@testing-library/react';
import { createElement } from 'react';
import { describe, expect, it } from 'vitest';
import {
  BRAND_RADII,
  BRAND_STROKES,
  BrandMark,
  type BrandMarkDetail,
} from '@/shared/ui/brand-mark';
// 빌드 스크립트는 순수 .mjs 다 — tsc 가 JSDoc 으로 형을 읽는다.
import { markBody, STROKES } from '../../scripts/build-brand-assets.mjs';

/**
 * 브랜드 마크 2-way 계약 — 화면에 그리는 컴포넌트(`src/shared/ui/brand-mark.tsx`)와
 * OS 아이콘을 굽는 스크립트(`scripts/build-brand-assets.mjs`)가 **같은 그림**을
 * 그리는지 잠근다.
 *
 * ## 왜 값 비교가 아니라 출력 비교인가
 *
 * `.mjs` 는 `.tsx` 를 import 할 수 없어서 좌표와 굵기가 두 벌 존재한다. 스크립트
 * 헤더는 "컴포넌트에서 전부 파생한다" 고 주장하지만 실제로는 **복제**이고,
 * 복제본은 반드시 어긋난다 — 이 저장소가 파서 3-way·검증기 2-way 계약 테스트를
 * 두고 있는 것과 같은 이유다.
 *
 * 값만 비교하면 "표는 맞췄는데 그리는 자리에서 다른 값을 쓰는" 경우를 놓친다.
 * 그래서 양쪽이 **실제로 뱉은 SVG** 를 파싱해 층별로 맞춘다. 실제로 이 함정이
 * 있었다: 굵기를 고치고도 `INK_HEIGHT` 가 옛 값을 들고 있어 아이콘 배율이
 * 틀어졌다.
 *
 * ## 잉크 사이 간격의 바닥
 *
 * 축약형·미형의 굵기는 취향이 아니라 **렌더 크기에서의 device px** 다. 1차 값은
 * 미형 획 1.03px(안티에일리어싱이 회색 죽으로 만드는 두께), 축약형 노드↔바깥
 * 1.34px(겹이 붙어 아래쪽이 부어 보이는 간격)이었다. 아래 바닥이 그 회귀를 막는다.
 */

/** 512 좌표계 정육각형 — 평면(변) 방향 거리 = 외접 반지름 × cos30°. */
const COS30 = Math.cos(Math.PI / 6);

/** 이 마크가 실려 나가는 판/캔버스 — `appIconSvg` 와 같은 값. */
const CANVAS = 1024;
const PLATE = 824;
const MARK_RATIO = 0.81;

/** 512 좌표계의 1 단위가 `size` px 아이콘에서 차지하는 device px. */
function unitPx(size: number, inkHeight: number): number {
  return ((PLATE * MARK_RATIO) / inkHeight) * (size / CANVAS);
}

/** 컴포넌트가 그린 층 → {부위: 굵기·반지름} 로 정규화. */
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

/** 스크립트가 뱉은 SVG 문자열 → 같은 모양으로 정규화. */
function fromScript(detail: BrandMarkDetail) {
  const svg = markBody(detail, { paint: 'currentColor' }) as string;
  const out = new Map<string, number[]>();
  const push = (part: string, v: number) => out.set(part, [...(out.get(part) ?? []), v]);
  for (const m of svg.matchAll(/<path d="M 256 (\d+)[^"]*"(?:[^>]*?stroke-width="(\d+)")?/g)) {
    // 경로의 첫 y 좌표가 층을 식별한다 — 256 − 외접반지름.
    const r = 256 - Number(m[1]);
    const width = m[2] ? Number(m[2]) : NaN;
    if (r === BRAND_RADII.outer) push('hexagon', width);
    else if (r === BRAND_RADII.dashed) push('path-layer', width);
    else if (r === BRAND_RADII.mid) push('mid', width);
    else if (r === BRAND_RADII.core) push('core', width);
    else if (r === BRAND_RADII.microCore) push('core', NaN); // 채움 — 굵기 없음
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
   * 미형은 16px 에서 산다. 획이 1px 아래면 안티에일리어싱이 회색 죽을 만들고,
   * 링↔핵 간격이 1px 아래면 배경이 안 보여 두 겹이 하나로 뭉친다.
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
   * 축약형은 32px 에서 산다. 노드가 바깥 육각형에 붙으면 아래쪽이 부어 보인다 —
   * 1차 값(노드 r=42)의 실측이 1.34px 였고, 그것이 "뭉쳐 보인다" 의 정체였다.
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
    // 중간 획도 사라지면 안 된다.
    expect(BRAND_STROKES.compactMid * u).toBeGreaterThanOrEqual(1);
  });

  /**
   * 노드는 중간 육각형 **꼭짓점 위에 박혀** 있어야 한다 — 반지름이 중간 획의
   * 절반보다 작아지면 획 안에 잠겨 사라지고, 그러면 "겹과 연결" 이라는 이 형태의
   * 뜻이 없어진다.
   */
  it('축약형 노드는 중간 획에 잠기지 않는다', () => {
    expect(BRAND_STROKES.compactNode).toBeGreaterThan(BRAND_STROKES.compactMid);
  });
});
