'use client';

import { useEffect, useRef, type CSSProperties, type MouseEventHandler, type ReactNode, type Ref } from 'react';

import { cn } from '@/shared/lib/cn';
import { usePanelPresence } from '@/shared/lib/use-presence';

/**
 * A conditionally rendered surface — **entrance and exit come with it by default.**
 *
 * **Why it exists.** Inventory 2026-08-03: **10 of the 20** conditionally
 * appearing surfaces were hard cuts, and those 10 were not random — every one was
 * an inline panel.
 *
 * | Family | Count | Enter/exit |
 * |---|---:|---|
 * | Modal (scrim + `aria-modal` + fixed) | 10 | mostly present |
 * | **Inline panel** (no scrim) | 10 | **none** |
 *
 * Modals could copy the `AnimatePresence` pattern from `AgentConnectSheet`; inline
 * panels had **no pattern to copy**. The gap was assets, not discipline — the same
 * shape of hole as 1 of 419 controls fitting the button primitive. The grammar
 * itself already existed in `app/globals.css` (`topology-chrome-in`/`out`: opacity
 * 0→1 + translateY 3px→0 + scale 0.98→1, exit at two thirds of the entrance); what
 * was missing was a place that applies it automatically.
 *
 * **What `Surface` remembers so call sites need not.** All four were learned here
 * by measurement:
 *
 * 1. **The exit window** — unmounting on `open=false` destroys the surface in one
 *    frame. `usePanelPresence` holds the window open (`EXIT_WINDOW_MS`).
 * 2. **Exits play forward under their own name** — running the entrance keyframes
 *    with `reverse` **does not play at all** on the same element, because an
 *    unchanged `animation-name` never restarts. Hence the separate `-out` classes.
 * 3. **Exiting frames cannot be clicked** — `inert` + `pointer-events-none`.
 *    Without them a disappearing surface swallows the click.
 * 4. **reduced-motion** is already handled by the global base-layer rule that cuts
 *    duration to 0.01ms. Do not branch on it here: an `!important` override
 *    written outside that cascade layer loses to it (measured 2026-07-28).
 *
 * **What `Surface` is not: a modal.** No scrim, no focus trap, no `aria-modal` —
 * blocking what is behind is a separate decision, and `.claude/rules/design.md`
 * requires a modal to prove its modality. Stack that contract on top of this
 * surface when you need one.
 */
/**
 * **Two entrance/exit grammars.** The surface's size picks one, not taste.
 *
 * `app/globals.css` already carried both while this primitive shipped only one, so
 * large surfaces could not use it: full detail attached `map-overlay-in` **by
 * hand** (and nothing on the way out), while the docs drawer and the studio
 * preview modal got nothing at all. Assets, not discipline.
 *
 * | Value | Grammar | When |
 * |---|---|---|
 * | `chrome` (default) | `topology-chrome-in/out` — 3px move + scale 0.98 + brightness | Small chrome over the map: popovers, menus, chip panels |
 * | `overlay` | `map-overlay-in/out` — **brightness only** | Surfaces covering much of the screen: full detail, scrim modals, full-width drawers |
 *
 * ★ `globals.css` records why `overlay` drops move and scale: *"a surface covering
 * a large part of the screen that moves reads as the screen itself shaking."* So
 * `origin` does nothing under `overlay` — there is no transform axis to shorten.
 */
type SurfaceMotion = 'chrome' | 'overlay';

const MOTION_CLASS: Record<SurfaceMotion, { enter: string; exit: string }> = {
  chrome: { enter: 'topology-chrome-in', exit: 'topology-chrome-out' },
  overlay: { enter: 'map-overlay-in', exit: 'map-overlay-out' },
};

export interface SurfaceProps {
  /** When this flips to `false` the surface stays through the exit window, then unmounts. */
  open: boolean;
  children: ReactNode;
  className?: string;
  /** See the table above — the surface's **size** picks this, not taste. */
  motion?: SurfaceMotion;
  /**
   * Where the entrance grows from — `transform-origin`. Aim it at the trigger and
   * the surface **is born where the user pressed** (a popover born in the centre is
   * a rejection from the motion seat).
   *
   * ⚠️ **Do not pass this where the coordinates are injected through a CSS
   * variable** (`--topology-chrome-in-origin`). An inline `style` beats the
   * variable's default, so a popover that grew from the clicked node would start
   * being born at a fixed spot instead.
   */
  origin?: string;
  /** The wrapping tag. Use `section`/`aside` wherever it carries meaning. */
  as?: 'div' | 'section' | 'aside';
  /** Fires once **after** the exit finishes. For unmount-bound work such as focus restore. */
  onExited?: () => void;
  /**
   * **The surface owns its own identity.** A menu, dialog, or alert reaches
   * assistive technology only when the role sits on the root; pushing it down to an
   * inner child buys entrance/exit at the cost of the accessible name (9 of the 13
   * call sites to convert carried `role`/`aria-label` on the root).
   */
  id?: string;
  role?: string;
  tabIndex?: number;
  /**
   * Values known only at runtime, such as placement coordinates. Merged with
   * `origin` — a menu hanging off the cursor takes coordinates inline and its
   * origin through `origin`.
   */
  style?: CSSProperties;
  /**
   * Input the **surface itself** must receive, such as a modal that closes on scrim
   * click. Pushed onto a child, the card rather than the scrim swallows the close.
   */
  onClick?: MouseEventHandler<HTMLElement>;
  /** A ref that must stay alive through the exit window — outside-click detection reads it. */
  ref?: Ref<HTMLElement>;
  /**
   * `data-*` / `aria-*` pass-through — instruments and tests need to grab this
   * surface from outside, and assistive technology needs to read its name.
   *
   * ⚠️ Leave it out and **the type system passes it silently.** TypeScript does not
   * check hyphenated JSX attributes, so `data-testid` draws no complaint from `tsc`
   * and the value is simply dropped. Converting the edge panel on 2026-08-03 nearly
   * shipped exactly that.
   */
  [dataAttribute: `data-${string}`]: unknown;
  [ariaAttribute: `aria-${string}`]: unknown;
}

export function Surface({
  open,
  children,
  className,
  motion = 'chrome',
  origin,
  style,
  as: Tag = 'div',
  onExited,
  ref,
  ...rest
}: SurfaceProps) {
  const { mounted, exiting } = usePanelPresence(open);
  const wasMounted = useRef(mounted);

  useEffect(() => {
    if (wasMounted.current && !mounted) onExited?.();
    wasMounted.current = mounted;
  }, [mounted, onExited]);

  if (!mounted) return null;

  return (
    <Tag
      // ★ Exiting frames **cannot be clicked.** Without this a disappearing surface
      //   swallows the click and the user gets "I pressed it and something else
      //   happened". React 19 treats `inert` as a boolean attribute — an empty
      //   string reads as false and the attribute silently never appears.
      {...rest}
      // `as` is one of div|section|aside, so it cannot be narrowed to a single
      // element type. All three are `HTMLElement` and the DOM receives the same
      // node, so the narrowing happens here only.
      ref={ref as Ref<HTMLDivElement>}
      inert={exiting}
      data-surface-state={exiting ? 'exiting' : 'entered'}
      style={origin ? { ...style, transformOrigin: origin } : style}
      className={cn(
        exiting ? `${MOTION_CLASS[motion].exit} pointer-events-none` : MOTION_CLASS[motion].enter,
        className,
      )}
    >
      {children}
    </Tag>
  );
}
