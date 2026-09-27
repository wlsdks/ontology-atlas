'use client';

import { useCallback, useRef } from 'react';
import type { RefObject } from 'react';
import type { TargetAndTransition, VariantLabels } from 'framer-motion';

import { EXIT_TRANSITION } from './tokens';

/**
 * Stops a framer `exit` target taking pointer input from its first exit frame
 * (`framer-exit-asymmetry.contract.test.ts`), outside framer's value system: a string value
 * such as `pointerEvents` in an exit set keeps `AnimatePresence` from ever completing under
 * jsdom, even with a zero-duration transition.
 *
 * `onAnimationStart` receives the animated definition itself, so an exit is recognized by its
 * `transition` being the `EXIT_TRANSITION` object (identity, not a clone) and `pointerEvents`
 * is set on the node directly.
 *
 * Usage: attach `ref` to the `motion.*` element (through
 * {@link import('@/shared/lib/merge-refs').mergeRefs} when it already owns a ref), spread
 * `onAnimationStart` onto it, and keep `transition: EXIT_TRANSITION` in `exit` without
 * `pointerEvents`. An entry reversing an unfinished exit restores the previous pointer policy.
 *
 * ```tsx
 * const { ref, onAnimationStart } = useExitLockout<HTMLDivElement>();
 * <motion.div
 *   ref={ref}
 *   onAnimationStart={onAnimationStart}
 *   exit={{ opacity: 0, transition: EXIT_TRANSITION }}
 * />
 * ```
 */
export function useExitLockout<T extends HTMLElement>(): {
  ref: RefObject<T | null>;
  onAnimationStart: (definition: TargetAndTransition | VariantLabels) => void;
} {
  const ref = useRef<T | null>(null);
  const locked = useRef<{ element: T; pointerEvents: string } | null>(null);

  const onAnimationStart = useCallback((definition: TargetAndTransition | VariantLabels) => {
    const el = ref.current;
    const exiting = typeof definition === 'object' && definition !== null
      && (definition as TargetAndTransition).transition === EXIT_TRANSITION;
    if (exiting && el) {
      if (locked.current?.element !== el) {
        locked.current = { element: el, pointerEvents: el.style.pointerEvents };
      }
      el.style.pointerEvents = 'none';
    } else if (locked.current) {
      if (locked.current.element === el) el.style.pointerEvents = locked.current.pointerEvents;
      locked.current = null;
    }
  }, []);

  return { ref, onAnimationStart };
}
