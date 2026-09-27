'use client';

import { cn } from '@/shared/lib/cn';

/**
 * Only bundled mark paths pass: the value goes inside a CSS `url()`, where a stray quotation
 * mark could inject style.
 */
const BUNDLED_MARK = /^\/acp-icons\/[a-z0-9-]+\.svg$/;

/**
 * One other product's mark, shared by the agent settings list and the start checklist. Drawn as
 * a mask because the registry SVGs are `fill="currentColor"`, which renders black
 * through `<img>`; masking also runs nothing from the file. We paint the vendor's brand colour
 * or neutral, on a light plate because most marks are drawn for light backgrounds.
 */
export function VendorMark({ src, ink }: { src: string | null; ink: string | null }) {
  const safe = src && BUNDLED_MARK.test(src) ? src : null;
  return (
    <span
      data-vendor-mark={safe ? 'true' : 'empty'}
      className={cn(
        'flex size-8 shrink-0 items-center justify-center rounded-chip border',
        safe
          ? 'border-[color:var(--color-vendor-plate-edge)] bg-[color:var(--color-vendor-plate)]'
          : // No drawing, no plate: an empty white square draws more attention than the name.
            'border-[color:var(--color-border-soft)] bg-[color:var(--color-overlay-1)]',
      )}
    >
      {safe ? (
        <span
          aria-hidden
          data-vendor-mark-ink={ink ? 'brand' : 'neutral'}
          className="size-5"
          style={{
            backgroundColor: ink ?? 'var(--color-vendor-mark-ink)',
            maskImage: `url("${safe}")`,
            WebkitMaskImage: `url("${safe}")`,
            maskRepeat: 'no-repeat',
            WebkitMaskRepeat: 'no-repeat',
            maskPosition: 'center',
            WebkitMaskPosition: 'center',
            maskSize: 'contain',
            WebkitMaskSize: 'contain',
          }}
        />
      ) : null}
    </span>
  );
}

