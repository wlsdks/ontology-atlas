'use client';

import Image from 'next/image';

import { Link } from '@/i18n/navigation';
import { withBasePath } from '@/shared/lib/base-path';
import { cn } from '@/shared/lib/cn';
import { controlClass } from '@/shared/ui/control-class';

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
 * image is the whole card; the caption and the door sit under it on the page ground.
 */
export function SurfaceCapture({
  src,
  width,
  height,
  alt,
  caption,
  href,
  door,
  testId,
  className,
}: {
  src: string;
  width: number;
  height: number;
  alt: string;
  caption: string;
  href: SurfaceHref;
  door: string;
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
      <figcaption className="mt-3 flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1">
        <span className="font-mono text-label leading-label text-[color:var(--color-text-quaternary)]">{caption}</span>
        <Link
          href={href}
          className={cn(
            controlClass({ shape: 'link', size: 'md' }),
            // `touch-hit-expand`: a link's own box is 24px tall, and a coarse pointer needs 44
            // (`touch-target-contract.spec.ts`). The class buys the finger target without moving
            // a pixel of layout — the same idiom the specimen's own link uses.
            'touch-hit-expand font-mono text-[color:var(--color-indigo-text-soft)] underline decoration-[color:var(--color-indigo-a40)] underline-offset-4 hover:decoration-[color:var(--color-indigo-accent)]',
          )}
        >
          {door}
        </Link>
      </figcaption>
    </figure>
  );
}
