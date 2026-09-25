'use client';

import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { InfoHint } from '@/shared/ui';
import { cn } from '@/shared/lib/cn';

type HintAlign = 'left' | 'center' | 'right';

/** The panel's distance from a field edge, the same 8px it keeps from its own trigger. */
const EDGE_CLEARANCE = 8;
/** The gap between the button and the panel (the old `mt-2`). */
const TRIGGER_GAP = 8;

/** The translation part of a computed `transform` (`none`, `matrix(…)` or `matrix3d(…)`). */
function translation(transform: string): { x: number; y: number } {
  const values = /matrix(3d)?\(([^)]+)\)/.exec(transform)?.[2]?.split(',').map(Number);
  if (!values) return { x: 0, y: 0 };
  return values.length === 16 ? { x: values[12], y: values[13] } : { x: values[4] ?? 0, y: values[5] ?? 0 };
}

/**
 * Whether an ancestor scrolls its content on one axis, and so hides what passes its edge there.
 *
 * Only a scroller that actually scrolls counts. A fixed panel escapes every clip, so an
 * `overflow-hidden` card around a hint must not shrink it to the card; and the Guides table's
 * `overflow-x-auto` scroller computes `overflow-y: auto` too, where bounding a header hint by a
 * short table's height would push it off for nothing.
 */
function clipsAxis(overflow: string, scrollSize: number, clientSize: number): boolean {
  return (overflow === 'auto' || overflow === 'scroll') && scrollSize > clientSize + 1;
}

/**
 * The rect a hint panel may occupy: the window, cut by every ancestor scroller.
 *
 * What lies outside the page scroller is chrome — at 768×1024 the Structure scroller ended at
 * y=928 with the bottom tab bar under it, and the panel ran 39px past that edge (2026-09-25).
 */
function hintField(from: HTMLElement): { top: number; right: number; bottom: number; left: number } {
  let top = 0;
  let left = 0;
  let right = document.documentElement.clientWidth;
  let bottom = window.innerHeight;
  for (let node = from.parentElement; node && node !== document.body; node = node.parentElement) {
    const style = getComputedStyle(node);
    const rect = node.getBoundingClientRect();
    if (clipsAxis(style.overflowY, node.scrollHeight, node.clientHeight)) {
      top = Math.max(top, rect.top);
      bottom = Math.min(bottom, rect.bottom);
    }
    if (clipsAxis(style.overflowX, node.scrollWidth, node.clientWidth)) {
      left = Math.max(left, rect.left);
      right = Math.min(right, rect.right);
    }
  }
  return { top, right, bottom, left };
}

/**
 * **An `InfoHint` whose panel hangs from its own button, inside the page field, never clipped.**
 *
 * The Harness views used to reach for `className="static"` wherever a fixed anchor ran off a
 * narrow window. That made the panel's containing block the enclosing text block instead of the
 * button, and on a desktop window it opened up to 603px to the left of the `?` that opened it
 * (1512×949, 2026-09-25). `max-w-full` on the diagram's own hint then capped a relative panel at
 * the 24px button, and the loop card's explanation came out one syllable per line.
 *
 * ⚠️ **Fixed, measured and clamped** (re-review, 2026-09-25). Three fixed anchors and an
 * `absolute` panel were not enough: at 390 on Guides no anchor fit and the panel ran 8px past the
 * window into the table scroller's clip; at 768 on Structure the panel ran 39px under the page
 * scroller's bottom edge, cut mid-sentence, because it could only flip sideways. The panel is now
 * `position: fixed` — no scroller between it and the window clips it — placed below the button
 * when it fits, above when only that fits, and otherwise on the roomier side with its text
 * scrolling inside. Horizontally the caller's `preferred` edge wins when it fits, then the other
 * two, then a clamp to the field. It is re-placed on pointer or focus arrival, resize and scroll.
 *
 * ⚠️ **The panel resets the text it inherits.** In a table header it inherited `nowrap`, came out
 * 640px wide inside a 254px box, and the inner scroller cut it to one truncated line.
 *
 * It also closes the two gaps WCAG 1.4.13 names for content shown on hover or focus: a
 * transparent strip bridges the gap between button and panel so the pointer can travel into the
 * panel (hoverable), and Escape hides it without moving pointer or focus (dismissible). Escape is
 * taken in the capture phase and stopped, so one press closes only the innermost surface — the
 * hint — and not also a coverage detail that listens on the window. Arriving again, by pointer
 * or focus, brings a dismissed hint back.
 *
 * ⚠️ These belong in `shared/ui/info-hint.tsx` itself, whose doc-block already describes the
 * self-placing panel. Move the measurement there and delete this wrapper once that file is free.
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
  const [engaged, setEngaged] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  const place = useCallback(() => {
    const root = rootRef.current;
    const button = root?.querySelector('button');
    const panel = root?.querySelector<HTMLElement>('[role="tooltip"]');
    const body = panel?.querySelector<HTMLElement>('[data-hint-body]');
    if (!root || !button || !panel || !body) return;
    const field = hintField(root);
    const box = button.getBoundingClientRect();

    panel.style.maxWidth = `${Math.max(160, Math.min(288, field.right - field.left - 2 * EDGE_CLEARANCE))}px`;
    body.style.maxHeight = `${Math.round(window.innerHeight * 0.35)}px`;
    const width = panel.offsetWidth;
    const chrome = panel.offsetHeight - body.offsetHeight;

    // Vertical: below when it fits, above when only that fits, else the roomier side, scrolled.
    const below = field.bottom - EDGE_CLEARANCE - (box.bottom + TRIGGER_GAP);
    const above = box.top - TRIGGER_GAP - (field.top + EDGE_CLEARANCE);
    const natural = panel.offsetHeight;
    const side = natural <= below || below >= above ? 'below' : 'above';
    const room = side === 'below' ? below : above;
    if (natural > room) body.style.maxHeight = `${Math.max(48, Math.floor(room - chrome))}px`;
    const height = panel.offsetHeight;
    const top = side === 'below' ? box.bottom + TRIGGER_GAP : box.top - TRIGGER_GAP - height;

    // Horizontal: the preferred edge, then the other two, then a clamp inside the field.
    const centre = box.left + box.width / 2;
    const starts: Record<HintAlign, number> = {
      right: box.right - width,
      left: box.left,
      center: centre - width / 2,
    };
    const min = field.left + EDGE_CLEARANCE;
    const max = field.right - EDGE_CLEARANCE - width;
    const fits = (start: number) => start >= min && start <= max;
    const order: HintAlign[] = [preferred, 'center', 'right', 'left'];
    const align = order.find((candidate) => fits(starts[candidate]));
    const left = align ? starts[align] : Math.min(Math.max(starts.center, min), Math.max(min, max));

    // A transformed ancestor makes itself the containing block of a fixed box; measure the
    // origin the panel actually resolves against and correct for it.
    panel.style.left = '0px';
    panel.style.top = '0px';
    const origin = panel.getBoundingClientRect();
    const shift = translation(getComputedStyle(panel).transform);
    panel.style.left = `${Math.round(left - (origin.left - shift.x))}px`;
    panel.style.top = `${Math.round(top - (origin.top - shift.y))}px`;
    panel.dataset.side = side;
    root.dataset.hintAlign = align ?? 'clamped';
  }, [preferred]);

  useLayoutEffect(() => {
    place();
  }, [place]);

  useEffect(() => {
    if (!engaged) return;
    const onMove = () => place();
    window.addEventListener('resize', onMove);
    window.addEventListener('scroll', onMove, true);
    return () => {
      window.removeEventListener('resize', onMove);
      window.removeEventListener('scroll', onMove, true);
    };
  }, [engaged, place]);

  useEffect(() => {
    if (!engaged || dismissed) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      // Innermost first: the hint is on top of whatever surface opened under it.
      event.stopPropagation();
      setDismissed(true);
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [engaged, dismissed]);

  const engage = () => {
    place();
    setEngaged(true);
    setDismissed(false);
  };
  const release = () => {
    setEngaged(false);
    setDismissed(false);
  };

  return (
    <div
      ref={rootRef}
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
        align="left"
        panelClassName={cn(
          'fixed mt-0 z-[var(--z-tooltip)]',
          // Inherited text would otherwise follow the host: a header's `nowrap`, caps or weight.
          'whitespace-normal font-normal normal-case tracking-normal text-label text-[color:var(--color-text-secondary)]',
          // The hit strip over the gap: part of the panel, so crossing it keeps the hover. It sits
          // on whichever side faces the button.
          "before:absolute before:inset-x-0 before:bottom-full before:h-2 before:content-['']",
          'data-[side=above]:before:top-full data-[side=above]:before:bottom-auto',
          // A surface arriving and leaving is the ramp's move step, not the 120ms feedback step.
          'duration-[var(--motion-base)]',
          dismissed && '!pointer-events-none !opacity-0',
          panelClassName,
        )}
      >
        {/* The scroll lives inside the panel, not on it: an `overflow` panel would clip the hit
            strip, which sits outside its padding box. */}
        <div data-hint-body className="overflow-y-auto overscroll-contain">{children}</div>
      </InfoHint>
    </div>
  );
}
