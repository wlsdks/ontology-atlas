'use client';

import { cloneElement, isValidElement, useEffect, useState } from 'react';
import { cn } from '@/shared/lib/cn';
import { MOTION_EASE } from '@/shared/motion';

/** `--motion-ease`, read through its JS copy. */
const EASE = `cubic-bezier(${MOTION_EASE.join(', ')})`;

interface StaggeredFadeInProps {
  /** An array of `li` when `as` is a list element. */
  children: React.ReactNode;
  /** Interval between children in ms. */
  stagger?: number;
  /**
   * Children past this index share the capped delay, so a long list does not end in a cascade
   * whose last card arrives seconds late.
   */
  maxStaggerSteps?: number;
  duration?: number;
  as?: 'div' | 'ul' | 'ol' | 'section';
  className?: string;
  /** Vertical travel in px. */
  translateY?: number;
  /** For a wrapper that is a real region. */
  ariaLabel?: string;
}

/**
 * Fades and lifts the children in sequence. The hidden state must commit on the first paint,
 * so `mounted` flips on the next frame.
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
    // The children's `motion-reduce:!` classes override the inline style, so no JS branch.
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
 * Clones the child with the inline style instead of wrapping it, so an `<ol>` keeps its `<li>`
 * children and its list semantics. Non-element children pass through.
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
    transition: `opacity ${duration}ms ${EASE} ${delay}ms, transform ${duration}ms ${EASE} ${delay}ms`,
    willChange: mounted ? undefined : 'opacity, transform',
  };
  return cloneElement(child, {
    key: child.key ?? index,
    style: { ...existing, ...inlineTransition },
    className: cn(
      child.props.className,
      'motion-reduce:!transform-none motion-reduce:!opacity-100 motion-reduce:!transition-none',
    ),
  });
}
