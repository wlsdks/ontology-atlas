import type { CSSProperties, ImgHTMLAttributes } from 'react';
import { withBasePath } from '@/shared/lib/base-path';

/**
 * Each tier is a separately authored RGBA master; never redraw it as SVG or scale the full
 * figure down to the favicon form.
 */
export type BrandMarkDetail = 'full' | 'compact' | 'micro';

export const BRAND_MARK_NATIVE_SIZE: Readonly<Record<BrandMarkDetail, number>> = {
  full: 64,
  compact: 32,
  micro: 16,
};

export const BRAND_MARK_ASSET: Readonly<Record<BrandMarkDetail, string>> = {
  full: '/brand/mascot-full.png',
  compact: '/brand/mascot-compact.png',
  micro: '/brand/mascot-micro.png',
};

export interface BrandMarkProps
  extends Omit<
    ImgHTMLAttributes<HTMLImageElement>,
    'src' | 'width' | 'height' | 'children'
  > {
  /** Square, in CSS pixels; prefer an integer multiple of the native tier. */
  size?: number;
  /** full=64px raised-hand mascot · compact=32px body · micro=16px helmet. */
  detail?: BrandMarkDetail;
}

export function BrandMark({
  size,
  detail = 'compact',
  alt = 'Ontology Atlas',
  draggable = false,
  className,
  style,
  ...rest
}: BrandMarkProps) {
  const nativeSize = BRAND_MARK_NATIVE_SIZE[detail];
  const renderedSize = size ?? nativeSize;
  const pixelStyle: CSSProperties = {
    imageRendering: 'pixelated',
    ...style,
  };

  return (
    // Native pixel grids must skip Next image optimization, whose resampling would make equal
    // pixels unequal.
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={withBasePath(BRAND_MARK_ASSET[detail])}
      width={renderedSize}
      height={renderedSize}
      alt={alt}
      role="img"
      draggable={draggable}
      decoding="async"
      data-brand-detail={detail}
      data-brand-native-size={nativeSize}
      className={className}
      style={pixelStyle}
      {...rest}
    />
  );
}
