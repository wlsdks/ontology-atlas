import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { BRAND_MARK_NODES, BRAND_STROKES, BrandMark } from './brand-mark';

/**
 * 브랜드 마크 — "겹 육각형"(소유자 확정 2026-07-29).
 *
 * 이 마크의 정체는 **획의 강약**이다. 1차 구현이 위계를 뒤집어 그렸을 때
 * 소유자가 "이상한데" 라고 했고, 원인이 정확히 그것이었다. 그래서 테스트가
 * 구조뿐 아니라 **굵기의 순서**를 잠근다.
 */
describe('BrandMark', () => {
  const parts = (label: string) =>
    Array.from(screen.getByLabelText(label).querySelectorAll('[data-mark-part]'));
  const names = (label: string) => parts(label).map((el) => el.getAttribute('data-mark-part'));

  it('full 은 네 겹 + 점선 + 스포크 + 노드 셋을 그린다', () => {
    render(<BrandMark detail="full" aria-label="full" />);
    const got = names('full');
    for (const part of ['hexagon', 'path-layer', 'mid', 'core', 'spoke', 'node']) {
      expect(got, `${part} 가 없다`).toContain(part);
    }
    expect(got.filter((p) => p === 'node')).toHaveLength(3);
    expect(got.filter((p) => p === 'spoke')).toHaveLength(3);
  });

  /**
   * **핵이 가장 굵고 중간이 가장 얇다.** 이 순서가 뒤집히면 겹의 리듬이 무너져
   * 원본과 다른 그림이 된다 — 값이 아니라 **순서**가 계약이다.
   */
  it('획의 강약이 원본 위계를 지킨다 — 핵 > 바깥 > 중간', () => {
    expect(BRAND_STROKES.core).toBeGreaterThan(BRAND_STROKES.outer);
    expect(BRAND_STROKES.outer).toBeGreaterThan(BRAND_STROKES.mid);
    // 스포크는 중간 육각형과 같은 계조다(바깥 굵기를 상속하면 안 된다).
    expect(BRAND_STROKES.spoke).toBe(BRAND_STROKES.mid);
  });

  /**
   * 축약형의 노드는 중간 육각형 **꼭짓점 위에 박혀** 있다. 떠 있는 점 3개는
   * 흔한 분자 아이콘이 되고, 그게 폐기된 1차 축약형의 실패였다.
   */
  it('compact 는 겹을 남긴다 — 바깥 + 중간 + 꼭짓점 위 노드', () => {
    render(<BrandMark detail="compact" aria-label="compact" />);
    const got = names('compact');
    expect(got).toContain('hexagon');
    expect(got).toContain('mid');
    expect(got.filter((p) => p === 'node')).toHaveLength(3);
    for (const dropped of ['path-layer', 'core', 'spoke']) {
      expect(got, `${dropped} 가 축약형에 남아 있다`).not.toContain(dropped);
    }
    const nodes = parts('compact').filter((el) => el.getAttribute('data-mark-part') === 'node');
    nodes.forEach((el, i) => {
      expect(Number(el.getAttribute('cx'))).toBe(BRAND_MARK_NODES[i][0]);
      expect(Number(el.getAttribute('cy'))).toBe(BRAND_MARK_NODES[i][1]);
    });
  });

  /** 16px 에서 겹 윤곽 둘을 그리면 잉크가 뭉쳐 육각형인지도 안 읽힌다. */
  it('micro 는 바깥 육각형 + 속 채운 핵만 남긴다', () => {
    render(<BrandMark detail="micro" aria-label="micro" />);
    const got = names('micro');
    expect(got).toEqual(['hexagon', 'core']);
    const core = parts('micro')[1];
    expect(core).toHaveAttribute('fill', 'currentColor');
  });

  it('앱 안에서는 currentColor 를 상속한다 — 그라디언트는 브랜드 자산에만', () => {
    render(<BrandMark detail="full" aria-label="tone" />);
    const svg = screen.getByLabelText('tone');
    expect(svg.querySelector('linearGradient')).toBeNull();
    expect(svg.querySelector('[data-mark-part="hexagon"]')?.closest('g')).toHaveAttribute(
      'stroke',
      'currentColor',
    );
  });
});
