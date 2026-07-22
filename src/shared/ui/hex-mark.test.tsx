import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import { HexMark } from './hex-mark';

describe('HexMark', () => {
  it('renders an svg with a single hexagon outline', () => {
    const { container } = render(<HexMark />);
    const svg = container.querySelector('svg');
    expect(svg).toBeInTheDocument();
    expect(container.querySelectorAll('[data-mark-part="hexagon"]')).toHaveLength(1);
  });

  it('defaults to a 12px square', () => {
    const { container } = render(<HexMark />);
    const svg = container.querySelector('svg');
    expect(svg).toHaveAttribute('width', '12');
    expect(svg).toHaveAttribute('height', '12');
  });

  it('applies a custom size to both dimensions', () => {
    const { container } = render(<HexMark size={13} />);
    const svg = container.querySelector('svg');
    expect(svg).toHaveAttribute('width', '13');
    expect(svg).toHaveAttribute('height', '13');
  });

  it('is decorative — aria-hidden so it never double-announces the title it accents', () => {
    const { container } = render(<HexMark />);
    const svg = container.querySelector('svg');
    expect(svg).toHaveAttribute('aria-hidden', 'true');
  });

  it('is achromatic — strokes with currentColor and never fills (no amber spend)', () => {
    const { container } = render(<HexMark />);
    const hexagon = container.querySelector('[data-mark-part="hexagon"]');
    expect(hexagon).toHaveAttribute('stroke', 'currentColor');
    expect(hexagon).toHaveAttribute('fill', 'none');
  });

  it('forwards className and extra svg props', () => {
    const { container } = render(
      <HexMark className="text-[color:var(--color-text-tertiary)]" data-testid="hex-mark" />,
    );
    const svg = container.querySelector('svg');
    expect(svg).toHaveClass('text-[color:var(--color-text-tertiary)]');
    expect(svg).toHaveAttribute('data-testid', 'hex-mark');
  });
});
