'use client';

import { cloneElement, isValidElement, useEffect, useState } from 'react';
import { cn } from '@/shared/lib/cn';

interface StaggeredFadeInProps {
  /** The children; an array of `li` when `as` is a list element. */
  children: React.ReactNode;
  /** Stagger interval between children, in ms. Default 60 — the design system's recommendation. */
  stagger?: number;
  /**
   * How many children receive an increasing delay. Everything past this index
   * appears together on the capped delay, so a large list (200 projects, say)
   * does not end with a limping cascade whose last card arrives seconds later.
   * Default 8, i.e. a maximum cascade of 8 × stagger (480ms at 60).
   */
  maxStaggerSteps?: number;
  /** Transition duration in ms. Default 200. */
  duration?: number;
  /** The container element; not always a div when the wrapper carries meaning. */
  as?: 'div' | 'ul' | 'ol' | 'section';
  /** Extra className, applied to the container. */
  className?: string;
  /** Vertical travel in px. Default 8. */
  translateY?: number;
  /** aria-label passed through to the container, for a wrapper that is a real region. */
  ariaLabel?: string;
}

/**
 * Staggered fade-in — applies `opacity 0 → 1` plus `translateY {y}px → 0` to the
 * children in sequence, so the design system's motion pattern lives in one
 * component.
 *
 * The hidden state must be committed on the first paint for the transition to
 * mean anything, so `mounted` flips on the next frame. Users with
 * `prefers-reduced-motion` see everything immediately.
 *
 * ```tsx
 * <StaggeredFadeIn as="ol" className="grid gap-3 md:grid-cols-3">
 *   <li>...</li>
 *   <li>...</li>
 *   <li>...</li>
 * </StaggeredFadeIn>
 * ```
 */
export function StaggeredFadeIn({
  children,
  stagger = 60,
  duration = 200,
  as: Tag = 'div',
  className,
  translateY = 8,
  ariaLabel,
  maxStaggerSteps = 8,
}: StaggeredFadeInProps) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    // No JS branch is needed for prefers-reduced-motion: the child's
    // `motion-reduce:!` classes override the inline style through !important.
    const handle = window.requestAnimationFrame(() => setMounted(true));
    return () => window.cancelAnimationFrame(handle);
  }, []);

  const items = Array.isArray(children) ? children : [children];

  return (
    <Tag className={className} aria-label={ariaLabel}>
      {items.map((child, i) =>
        applyTransitionStyle(child, i, {
          mounted,
          duration,
          // Cap the delay so the last child of a long list does not arrive
          // seconds late.
          delay: Math.min(i, maxStaggerSteps) * stagger,
          translateY,
        }),
      )}
    </Tag>
  );
}

interface ApplyOptions {
  mounted: boolean;
  duration: number;
  delay: number;
  translateY: number;
}

/**
 * Injects the inline transition style directly onto the child element.
 *
 * An earlier version wrapped each child in `<span style={display: contents}>`,
 * but with an `<ol>`/`<ul>` parent that put a `<span>` between the `<li>`s —
 * invalid HTML, and screen readers lost the list semantics. Cloning the child
 * keeps the tree as `<ol><li/><li/></ol>`.
 *
 * Non-element children (string, number, null) pass through unchanged.
 */
function applyTransitionStyle(
  child: React.ReactNode,
  index: number,
  { mounted, duration, delay, translateY }: ApplyOptions,
): React.ReactNode {
  if (!isValidElement<{ style?: React.CSSProperties; className?: string }>(child)) {
    return child;
  }
  const existing = child.props.style ?? {};
  const inlineTransition: React.CSSProperties = {
    opacity: mounted ? 1 : 0,
    transform: mounted ? 'translateY(0)' : `translateY(${translateY}px)`,
    transition: `opacity ${duration}ms ease-out ${delay}ms, transform ${duration}ms ease-out ${delay}ms`,
    willChange: mounted ? undefined : 'opacity, transform',
  };
  return cloneElement(child, {
    key: child.key ?? index,
    style: { ...existing, ...inlineTransition },
    // Keep the motion-reduce: classes so the prefers-reduced-motion CSS still applies.
    className: cn(
      child.props.className,
      'motion-reduce:!transform-none motion-reduce:!opacity-100 motion-reduce:!transition-none',
    ),
  });
}
