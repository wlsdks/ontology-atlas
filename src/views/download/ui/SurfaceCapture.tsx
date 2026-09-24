'use client';

import Image from 'next/image';

import { withBasePath } from '@/shared/lib/base-path';
import { cn } from '@/shared/lib/cn';

/** Where a captured screen's door leads — the app destination the picture was taken from. */
export type SurfaceHref =
  | '/topology'
  | '/architecture'
  | '/library'
  | '/automations'
  | '/ontology/insights'
  | '/projects'
  | '/git';

/**
 * A real screen, shown as a screen (2026-09-08). The app's destinations cannot be mounted on the
 * gateway — each is a route-level view and a view may not import another view — so the gateway
 * shows a **capture** of each, taken from the running static export by
 * `scripts/capture-gateway-screens.mjs`, with a caption that says exactly what folder was on
 * screen. A capture is honest when it says it is one; it is not a mockup.
 *
 * The frame is the product's own panel: one hairline, the panel surface, the panel radius. The
 * image is the whole card. The caption and the door are the stage's (2026-09-25): `ScreensStage`
 * stands them at the foot of its rail, where they frame the picture's bottom line instead of
 * trailing under it.
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
        {/* The export is static (`images.unoptimized`), so the element carries its intrinsic size
            and the layout does not move as it loads. */}
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
