'use client';

import { cn } from '@/shared/lib/cn';

/**
 * Only bundled mark paths pass. This value goes inside a CSS `url()`, so a
 * quotation mark mixed in could invent style there. Today the only values that
 * arrive are the `/acp-icons/<id>.svg` paths our build script produces, so
 * **locking it by shape is free** — and the hole stays shut even if another source
 * is wired in here later.
 */
const BUNDLED_MARK = /^\/acp-icons\/[a-z0-9-]+\.svg$/;

/**
 * One other product's mark.
 *
 * ⚠️ Lives in `shared/ui` because two surfaces show it: the agent settings list and the start
 * checklist (owner, 2026-08-25: *"can it show the Claude mark too, like in the agent tab?"*). A
 * second copy would have been the moment the two drifted — one painting the vendor colour and the
 * other not, on the same drawing.
 *
 * ## Why not `<img>` (2026-08-16, found from an owner report)
 *
 * All 38 registry icons are **`fill="currentColor"`** (the registration rule
 * rejects an SVG with baked-in colour). Drawn through `<img>` there is no text
 * colour for that instruction to reach, so it falls back to the initial value —
 * **black** — and on a dark panel that is a black drawing on a black plate. The
 * icon was on screen and invisible, and nothing in the code looked wrong.
 *
 * So the drawing is used as a **mask** and we paint the colour: the vendor's
 * published brand colour where there is one, neutral where there is not. As a
 * bonus nothing inside the SVG is rendered, so someone else's file can do nothing
 * on our screen.
 *
 * ## Why the plate is light
 *
 * This app has one dark screen, but what sits here belongs to the vendor rather
 * than to us, and most of these are drawn for a light background (6 of the 11
 * whose colour was checked are black to #2D2D2D). The reference product (Buzz)
 * also lays a white plate under dark marks.
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
          : // With no drawing there is no plate either — an empty white square draws more attention than the name.
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

