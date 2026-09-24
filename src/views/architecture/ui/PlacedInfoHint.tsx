'use client';

import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { InfoHint } from '@/shared/ui';
import { cn } from '@/shared/lib/cn';

type HintAlign = 'left' | 'center' | 'right';

/** The panel's distance from a window edge, the same 8px it keeps from its own trigger (`mt-2`). */
const EDGE_CLEARANCE = 8;

/**
 * **An `InfoHint` whose panel hangs from its own button and picks the edge that fits.**
 *
 * The Harness views used to reach for `className="static"` wherever a fixed anchor ran off a
 * narrow window. That made the panel's containing block the enclosing text block instead of the
 * button, and on a desktop window it opened up to 603px to the left of the `?` that opened it
 * (1512×949, 2026-09-25) — a panel that reads as belonging to another column. `max-w-full` on the
 * diagram's own hint then capped a relative panel at the 24px button, and the loop card's
 * explanation came out one syllable per line, 34px wide and 332px tall.
 *
 * This keeps the panel on the button and chooses `right`, `left` or `center` by measuring the
 * button and the panel against the window: on mount, on resize, and again whenever the pointer or
 * focus arrives, because a translated label can move the button without resizing anything. The
 * caller's `preferred` edge wins whenever it fits.
 *
 * It also closes the two gaps WCAG 1.4.13 names for content shown on hover or focus: a
 * transparent strip bridges the 8px between button and panel so the pointer can travel into the
 * panel (hoverable), and Escape hides it without moving pointer or focus (dismissible).
 *
 * ⚠️ These belong in `shared/ui/info-hint.tsx` itself, whose doc-block already describes the
 * self-placing panel. That file was owned by another change in flight when this was written; move
 * the measurement there and delete this wrapper once it lands.
 */
export function PlacedInfoHint({
  label,
  children,
  className,
  panelClassName,
  preferred = 'right',
}: {
  label: string;
  children: ReactNode;
  className?: string;
  panelClassName?: string;
  preferred?: HintAlign;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const [align, setAlign] = useState<HintAlign>(preferred);
  const [engaged, setEngaged] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  const place = useCallback(() => {
    const root = rootRef.current;
    const button = root?.querySelector('button');
    const panel = root?.querySelector<HTMLElement>('[role="tooltip"]');
    if (!button || !panel) return;
    const box = button.getBoundingClientRect();
    // `offsetWidth` ignores the panel's own translate, so a centred panel measures the same.
    const width = panel.offsetWidth;
    const windowWidth = document.documentElement.clientWidth;
    const centre = box.left + box.width / 2;
    const spans: Record<HintAlign, [number, number]> = {
      right: [box.right - width, box.right],
      left: [box.left, box.left + width],
      center: [centre - width / 2, centre + width / 2],
    };
    const overflow = ([start, end]: [number, number]) =>
      Math.max(0, EDGE_CLEARANCE - start) + Math.max(0, end - (windowWidth - EDGE_CLEARANCE));
    const order: HintAlign[] = [preferred, 'center', 'right', 'left'];
    const fitting = order.find((candidate) => overflow(spans[candidate]) === 0);
    const next = fitting ?? order.reduce((best, candidate) =>
      overflow(spans[candidate]) < overflow(spans[best]) ? candidate : best,
    );
    setAlign((current) => (current === next ? current : next));
  }, [preferred]);

  useLayoutEffect(() => {
    place();
    window.addEventListener('resize', place);
    return () => window.removeEventListener('resize', place);
  }, [place]);

  useEffect(() => {
    if (!engaged) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setDismissed(true);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [engaged]);

  const engage = () => {
    place();
    setEngaged(true);
  };
  const release = () => {
    setEngaged(false);
    setDismissed(false);
  };

  return (
    <div
      ref={rootRef}
      data-hint-align={align}
      className={cn('inline-flex', className)}
      onPointerEnter={engage}
      onPointerLeave={() => {
        if (!rootRef.current?.contains(document.activeElement)) release();
      }}
      onFocus={engage}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) release();
      }}
    >
      <InfoHint
        label={label}
        align={align}
        panelClassName={cn(
          // The hit strip over the `mt-2` gap: part of the panel, so crossing it keeps the hover.
          "before:absolute before:inset-x-0 before:bottom-full before:h-2 before:content-['']",
          // A surface arriving and leaving is the ramp's move step, not the 120ms feedback step.
          'duration-[var(--motion-base)]',
          dismissed && '!pointer-events-none !opacity-0',
          panelClassName,
        )}
      >
        {/* The scroll lives inside the panel, not on it: an `overflow` panel would clip the hit
            strip above, which sits outside its padding box. */}
        <div className="max-h-[35dvh] overflow-y-auto">{children}</div>
      </InfoHint>
    </div>
  );
}
