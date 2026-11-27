import type { CSSProperties, ImgHTMLAttributes } from 'react';

type StaticImport = { src: string; width?: number; height?: number };

interface ImageProps extends Omit<ImgHTMLAttributes<HTMLImageElement>, 'src' | 'width' | 'height'> {
  src: string | StaticImport;
  alt: string;
  width?: number | `${number}`;
  height?: number | `${number}`;
  fill?: boolean;
  priority?: boolean;
  unoptimized?: boolean;
  quality?: number | `${number}`;
  placeholder?: string;
  blurDataURL?: string;
}

const FILL: CSSProperties = { position: 'absolute', height: '100%', width: '100%', inset: 0 };

export default function Image({
  src,
  alt,
  fill,
  priority,
  unoptimized: _unoptimized,
  quality: _quality,
  placeholder: _placeholder,
  blurDataURL: _blurDataURL,
  style,
  loading,
  ...rest
}: ImageProps) {
  return (
    // eslint-disable-next-line @next/next/no-img-element -- this is the element `next/image` becomes
    <img
      {...rest}
      alt={alt}
      src={typeof src === 'string' ? src : src.src}
      loading={priority ? 'eager' : (loading ?? 'lazy')}
      fetchPriority={priority ? 'high' : undefined}
      decoding="async"
      style={fill ? { ...FILL, ...style } : style}
    />
  );
}
