'use client';

import {
  Children,
  cloneElement,
  isValidElement,
  useEffect,
  useState,
  type CSSProperties,
  type ReactNode,
} from 'react';
import { cn } from '@/shared/lib/cn';
import { MOTION, MOTION_EASE, OVERLAY_RISE, STAGGER } from '@/shared/motion';

const EASE = `cubic-bezier(${MOTION_EASE.join(', ')})`;
const KEY_SEPARATOR = '\u0000';

interface StaggeredFadeInProps {
  children: ReactNode;
  stagger?: number;
  maxStaggerSteps?: number;
  duration?: number;
  as?: 'div' | 'ul' | 'ol' | 'section';
  className?: string;
  translateY?: number;
  ariaLabel?: string;
}

function arrivalSteps(
  keys: readonly string[],
  revealed: ReadonlyMap<string, number>,
  maxStaggerSteps: number,
): number[] {
  let arriving = 0;
  return keys.map((key) => revealed.get(key) ?? Math.min(arriving++, maxStaggerSteps));
}

export function StaggeredFadeIn({
  children,
  stagger = STAGGER * 1000,
  duration = MOTION.base.duration * 1000,
  as: Tag = 'div',
  className,
  translateY = OVERLAY_RISE.y,
  ariaLabel,
  maxStaggerSteps = 8,
}: StaggeredFadeInProps) {
  const items = Children.toArray(children);
  const keys = items.map((child, index) => String(isValidElement(child) && child.key !== null ? child.key : index));
  const signature = keys.join(KEY_SEPARATOR);
  const [revealed, setRevealed] = useState<ReadonlyMap<string, number>>(() => new Map());

  useEffect(() => {
    const handle = window.requestAnimationFrame(() =>
      setRevealed((previous) => {
        const current = signature ? signature.split(KEY_SEPARATOR) : [];
        const steps = arrivalSteps(current, previous, maxStaggerSteps);
        return new Map(current.map((key, index) => [key, previous.has(key) ? 0 : steps[index]]));
      }),
    );
    return () => window.cancelAnimationFrame(handle);
  }, [signature, maxStaggerSteps]);

  const steps = arrivalSteps(keys, revealed, maxStaggerSteps);

  return (
    <Tag className={className} aria-label={ariaLabel}>
      {items.map((child, index) =>
        applyTransitionStyle(child, {
          visible: revealed.has(keys[index]),
          duration,
          delay: steps[index] * stagger,
          translateY,
        }),
      )}
    </Tag>
  );
}

interface ApplyOptions {
  visible: boolean;
  duration: number;
  delay: number;
  translateY: number;
}

function applyTransitionStyle(
  child: ReactNode,
  { visible, duration, delay, translateY }: ApplyOptions,
): ReactNode {
  if (!isValidElement<{ style?: CSSProperties; className?: string }>(child)) {
    return child;
  }
  const existing = child.props.style ?? {};
  const inlineTransition: CSSProperties = {
    opacity: visible ? 1 : 0,
    transform: visible ? 'translateY(0)' : `translateY(${translateY}px)`,
    transition: `opacity ${duration}ms ${EASE} ${delay}ms, transform ${duration}ms ${EASE} ${delay}ms`,
    willChange: visible ? undefined : 'opacity, transform',
  };
  return cloneElement(child, {
    style: { ...existing, ...inlineTransition },
    className: cn(
      child.props.className,
      'motion-reduce:!transform-none motion-reduce:!opacity-100 motion-reduce:!transition-none',
    ),
  });
}
