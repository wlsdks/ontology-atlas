import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import { BrandMark, BRAND_MARK_AMBER } from './brand-mark';

describe('BrandMark', () => {
  it('renders an accessible svg mark', () => {
    const { container } = render(<BrandMark />);
    const svg = container.querySelector('svg');
    expect(svg).toBeInTheDocument();
    expect(svg).toHaveAttribute('role', 'img');
    expect(svg?.getAttribute('aria-label')).toBe('ontology-atlas');
  });

  it('defaults to 24px square', () => {
    const { container } = render(<BrandMark />);
    const svg = container.querySelector('svg');
    expect(svg).toHaveAttribute('width', '24');
    expect(svg).toHaveAttribute('height', '24');
  });

  it('applies a custom size to both dimensions', () => {
    const { container } = render(<BrandMark size={40} />);
    const svg = container.querySelector('svg');
    expect(svg).toHaveAttribute('width', '40');
    expect(svg).toHaveAttribute('height', '40');
  });

  it('always draws the hexagon outline', () => {
    const { container } = render(<BrandMark />);
    expect(container.querySelector('[data-mark-part="hexagon"]')).toBeInTheDocument();
  });

  it('full detail (default) draws six vertex nodes and six spokes', () => {
    const { container } = render(<BrandMark detail="full" />);
    expect(container.querySelectorAll('[data-mark-part="vertex"]')).toHaveLength(6);
    expect(container.querySelectorAll('[data-mark-part="spoke"]')).toHaveLength(6);
  });

  it('compact detail omits vertices and spokes — hexagon + hub only', () => {
    const { container } = render(<BrandMark detail="compact" />);
    expect(container.querySelectorAll('[data-mark-part="vertex"]')).toHaveLength(0);
    expect(container.querySelectorAll('[data-mark-part="spoke"]')).toHaveLength(0);
    expect(container.querySelector('[data-mark-part="hexagon"]')).toBeInTheDocument();
    expect(container.querySelector('[data-mark-part="hub"]')).toBeInTheDocument();
  });

  it('the amber hub is present in both detail modes and uses the brand amber constant', () => {
    const full = render(<BrandMark detail="full" />);
    const compact = render(<BrandMark detail="compact" />);
    const fullHub = full.container.querySelector('[data-mark-part="hub"]');
    const compactHub = compact.container.querySelector('[data-mark-part="hub"]');
    expect(fullHub).toHaveAttribute('fill', BRAND_MARK_AMBER);
    expect(compactHub).toHaveAttribute('fill', BRAND_MARK_AMBER);
  });

  it('lines/vertices use currentColor so callers can theme the mark via CSS color', () => {
    const { container } = render(<BrandMark />);
    const hexagon = container.querySelector('[data-mark-part="hexagon"]');
    expect(hexagon).toHaveAttribute('stroke', 'currentColor');
  });

  it('forwards className and extra svg props', () => {
    const { container } = render(<BrandMark className="my-mark" data-testid="brand-mark" />);
    const svg = container.querySelector('svg');
    expect(svg).toHaveClass('my-mark');
    expect(svg).toHaveAttribute('data-testid', 'brand-mark');
  });
});
