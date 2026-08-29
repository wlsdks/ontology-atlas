import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import {
  BRAND_MARK_ASSET,
  BRAND_MARK_NATIVE_SIZE,
  BrandMark,
  type BrandMarkDetail,
} from './brand-mark';

const DETAILS: BrandMarkDetail[] = ['full', 'compact', 'micro'];

describe('BrandMark pixel mascot', () => {
  it.each(DETAILS)('%s uses its separately authored raster tier', (detail) => {
    render(<BrandMark detail={detail} alt={detail} />);
    const image = screen.getByAltText(detail);
    expect(image).toHaveAttribute('src', BRAND_MARK_ASSET[detail]);
    expect(image).toHaveAttribute('width', String(BRAND_MARK_NATIVE_SIZE[detail]));
    expect(image).toHaveAttribute('height', String(BRAND_MARK_NATIVE_SIZE[detail]));
    expect(image).toHaveAttribute('data-brand-native-size', String(BRAND_MARK_NATIVE_SIZE[detail]));
    expect(image).toHaveStyle({ imageRendering: 'pixelated' });
  });

  it('keeps the caller size while preserving the compact source identity', () => {
    render(<BrandMark detail="compact" size={64} alt="scaled" />);
    const image = screen.getByAltText('scaled');
    expect(image).toHaveAttribute('src', BRAND_MARK_ASSET.compact);
    expect(image).toHaveAttribute('width', '64');
    expect(image).toHaveAttribute('height', '64');
  });

  it('is a real image asset rather than an inline drawing', () => {
    const { container } = render(<BrandMark detail="micro" />);
    expect(container.querySelector('img')).not.toBeNull();
    expect(container.querySelector('svg, canvas')).toBeNull();
  });
});
