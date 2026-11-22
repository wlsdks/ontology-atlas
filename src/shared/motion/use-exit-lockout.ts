'use client';

import { useCallback, useRef } from 'react';
import type { RefObject } from 'react';
import type { TargetAndTransition, VariantLabels } from 'framer-motion';

import { EXIT_TRANSITION } from './tokens';

/**
 * Stops a framer `exit` target taking pointer input from its first exit frame, outside framer's value
 * system: a string `pointerEvents` in an exit set keeps `AnimatePresence` from completing under jsdom
 * on the Linux CI runner. `onAnimationStart` recognizes an exit by its `transition` being the
 * `EXIT_TRANSITION` object (identity, not a clone) and sets `pointerEvents` on the node directly. An
 * entry reversing an unfinished exit restores the previous policy.
 *
 * ```tsx
 * const { ref, onAnimationStart } = useExitLockout<HTMLDivElement>();
 * <motion.div ref={ref} onAnimationStart={onAnimationStart} exit={{ opacity: 0, transition: EXIT_TRANSITION }} />
 * ```
 */
export function useExitLockout<T extends HTMLElement>(): {
  ref: RefObject<T | null>;
  onAnimationStart: (definition: TargetAndTransition | VariantLabels) => void;
} {
  const ref = useRef<T | null>(null);
  const locked = useRef<{ element: T; pointerEvents: string } | null>(null);

  const onAnimationStart = useCallback((definition: TargetAndTransition | VariantLabels) => {
    const currentElement = ref.current;
    const exiting = typeof definition === 'object' && definition !== null
      && (definition as TargetAndTransition).transition === EXIT_TRANSITION;
    if (exiting && currentElement) {
      if (locked.current?.element !== currentElement) {
        locked.current = { element: currentElement, pointerEvents: currentElement.style.pointerEvents };
      }
      currentElement.style.pointerEvents = 'none';
    } else if (locked.current) {
      if (locked.current.element === currentElement) currentElement.style.pointerEvents = locked.current.pointerEvents;
      locked.current = null;
    }
  }, []);

  return { ref, onAnimationStart };
}
