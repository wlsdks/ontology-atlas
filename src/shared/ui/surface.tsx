'use client';

import { useEffect, useRef, type CSSProperties, type MouseEventHandler, type ReactNode, type Ref } from 'react';

import { cn } from '@/shared/lib/cn';
import { usePanelPresence } from '@/shared/lib/use-presence';

/**
 * A conditionally rendered inline surface with entrance and exit built in. It holds the exit
 * window (`usePanelPresence`), exits with its own `-out` class because a reversed entrance
 * never restarts an unchanged `animation-name`, and makes exiting frames inert. Reduced motion
 * comes from the base layer; do not branch here. Not a modal: no scrim, focus trap
 * or `aria-modal` (`.claude/rules/design.md`).
 */
/**
 * The surface's size picks the grammar. `chrome` (move, scale and brightness) is for small
 * chrome over the map; `overlay` is brightness only, because a large surface that moves reads
 * as the screen shaking, so `origin` does nothing under it.
 */
type SurfaceMotion = 'chrome' | 'overlay';

const MOTION_CLASS: Record<SurfaceMotion, { enter: string; exit: string }> = {
  chrome: { enter: 'topology-chrome-in', exit: 'topology-chrome-out' },
  overlay: { enter: 'map-overlay-in', exit: 'map-overlay-out' },
};

export interface SurfaceProps {
  /** On `false` the surface stays through the exit window, then unmounts. */
  open: boolean;
  children: ReactNode;
  className?: string;
  motion?: SurfaceMotion;
  /**
   * The `transform-origin` of the entrance; aim it at the trigger. Do not pass it where the
   * origin comes from `--topology-chrome-in-origin`: the inline style would win.
   */
  origin?: string;
  as?: 'div' | 'section' | 'aside';
  /** Fires once after the exit finishes, for unmount-bound work such as focus restore. */
  onExited?: () => void;
  /** Role and name must sit on the root to reach assistive technology. */
  id?: string;
  role?: string;
  tabIndex?: number;
  /** Runtime values such as coordinates, merged with `origin`. */
  style?: CSSProperties;
  /** For input the surface itself must receive, such as a scrim click that closes a modal. */
  onClick?: MouseEventHandler<HTMLElement>;
  /** Stays alive through the exit window, because outside-click detection reads it. */
  ref?: Ref<HTMLElement>;
  /**
   * TypeScript does not check hyphenated JSX attributes, so without this a
   * dropped `data-testid` would pass `tsc` silently.
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
      // Exiting frames cannot be clicked. React 19 treats `inert` as a boolean: an empty string
      // reads as false and the attribute never appears.
      {...rest}
      // `as` cannot narrow to one element type; all three are `HTMLElement`.
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
