import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { BRAND_MARK_NODES, BRAND_STROKES, BrandMark } from './brand-mark';

/**
 * The brand mark — nested hexagons (owner decision, 2026-07-29).
 *
 * The identity of this mark is **the weighting of its strokes**. When the first
 * implementation drew that hierarchy inverted, the owner said it looked wrong, and this was
 * exactly why. So the tests lock not just the structure but **the order of the widths**.
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
   * **The core is thickest and the middle thinnest.** Invert that order and the rhythm of the
   * nesting collapses into a different picture. The contract is the **ordering**, not the
   * values.
   */
  it('획의 강약이 원본 위계를 지킨다 — 핵 > 바깥 > 중간', () => {
    expect(BRAND_STROKES.core).toBeGreaterThan(BRAND_STROKES.outer);
    expect(BRAND_STROKES.outer).toBeGreaterThan(BRAND_STROKES.mid);
    // Spokes share the middle hexagon's weight — they must not inherit the outer width.
    expect(BRAND_STROKES.spoke).toBe(BRAND_STROKES.mid);
  });

  /**
   * In the compact form the nodes are **pinned to the middle hexagon's vertices**. Three
   * floating dots read as the common molecule icon, which is what sank the discarded first
   * compact form.
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

  /** At 16px, two nested outlines blot together and it no longer reads as a hexagon. */
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
