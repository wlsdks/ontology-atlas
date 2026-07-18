import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import { BrandMarkFallback } from './brand-mark-fallback';

describe('BrandMarkFallback', () => {
  it('renders a hexagon stroke + center amber dot (candidate A compact — no bare outline)', () => {
    const { container } = render(<BrandMarkFallback size={20} />);
    const svg = container.querySelector('svg');
    expect(svg).toHaveAttribute('width', '20');
    expect(svg).toHaveAttribute('height', '20');
    const path = container.querySelector('path');
    expect(path).toHaveAttribute('d', 'M24 7 L38.7 15.5 L38.7 32.5 L24 41 L9.3 32.5 L9.3 15.5 Z');
    // 중심 앰버 도트 — 구 단순 헥사곤(외곽선만)과 구분되는 핵심 요소.
    const dot = container.querySelector('circle');
    expect(dot).toHaveAttribute('fill', 'var(--topology-v2-amber-hub)');
  });

  it('defaults to 20px when size is omitted', () => {
    const { container } = render(<BrandMarkFallback />);
    expect(container.querySelector('svg')).toHaveAttribute('width', '20');
  });
});
