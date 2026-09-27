'use client';

import Image from 'next/image';

import { withBasePath } from '@/shared/lib/base-path';
import { cn } from '@/shared/lib/cn';

/** The destination the picture was taken from. */
export type SurfaceHref =
  | '/topology'
  | '/architecture'
  | '/library'
  | '/automations'
  | '/ontology/insights'
  | '/projects'
  | '/git';

/**
 * A capture of a real destination (`scripts/capture-gateway-screens.mjs`), since a view may not
 * import another view. The caption and door belong to `ScreensStage`.
 */
export function SurfaceCapture({
  src,
  width,
  height,
  alt,
  testId,
  className,
}: {
  src: string;
  width: number;
  height: number;
  alt: string;
  testId: string;
  className?: string;
}) {
  return (
    <figure data-testid={testId} className={cn('min-w-0', className)}>
      <div className="overflow-hidden rounded-[var(--radius-panel)] border border-[color:var(--color-border-soft)] bg-[color:var(--color-panel)]">
        {/* Unoptimized static images carry their intrinsic size, so layout does not shift on load. */}
        <Image
          src={withBasePath(src)}
          width={width}
          height={height}
          alt={alt}
          loading="lazy"
          unoptimized
          className="block h-auto w-full"
        />
      </div>
    </figure>
  );
}
