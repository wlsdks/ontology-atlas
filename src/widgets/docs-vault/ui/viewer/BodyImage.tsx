import Image from 'next/image';
import { PROSE_MEASURE_REM, PROSE_MEASURE_WIDE_REM, WIDE_READING_MIN_VIEWPORT_PX } from '@/shared/ui/tokens/reading-measure';

/**
 * Next `sizes` hint for body images, in rem so it follows the root font size like the prose measure
 * (`app/globals.css`); unparsable units fall back to 100vw.
 */
const IMAGE_SIZES = `(max-width: 768px) 100vw, (min-width: ${WIDE_READING_MIN_VIEWPORT_PX}px) ${PROSE_MEASURE_WIDE_REM.toFixed(4)}rem, ${PROSE_MEASURE_REM.toFixed(4)}rem`;

export function BodyImage({ src, alt, title }: { src: string; alt: string; title?: string }) {
  return (
    <Image
      src={src}
      alt={alt}
      width={1200}
      height={800}
      sizes={IMAGE_SIZES}
      unoptimized
      className="my-4 max-w-full rounded-chip border border-[color:var(--color-border-soft)]"
      style={{ height: 'auto' }}
      title={title}
    />
  );
}
