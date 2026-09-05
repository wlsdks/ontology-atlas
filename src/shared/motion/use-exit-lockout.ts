'use client';

import { useCallback, useRef } from 'react';
import type { RefObject } from 'react';
import type { TargetAndTransition, VariantLabels } from 'framer-motion';

import { EXIT_TRANSITION } from './tokens';

/**
 * **The input lockout lives outside framer's value system.**
 *
 * Every framer `exit` target needs to stop taking pointer input from its first exit
 * frame (`framer-exit-asymmetry.contract.test.ts`). The first attempt put that inside
 * the animated value set itself — `pointerEvents: "none"` in the `exit` object, tweened
 * with a per-value `{ duration: 0 }` transition so it snaps instead of interpolating.
 *
 * **That broke CI.** Measured 2026-09-05: two
 * `FirstRunStarterModule.test.tsx` cases that wait for the `Dialog` (a portal +
 * `AnimatePresence`) to leave the DOM hung for 5 s on GitHub's Linux runner (jsdom,
 * vitest) — passing locally every time. Bisection showed removing `pointerEvents` from
 * the two Dialog exits made the job pass; giving it its own zero-duration transition did
 * not. A **string value** in the framer exit set — even one whose own transition is
 * zero-duration — stops the exit's completion promise from ever resolving under jsdom.
 *
 * **The fix moves the lockout to an imperative side effect.** `onAnimationStart` fires
 * with the literal definition object being animated — for a leave, that is the `exit`
 * object itself, transition included, identity intact (confirmed empirically: the
 * `transition` field received here is `===` the `EXIT_TRANSITION` constant, not a
 * clone). So this hook does not need a new prop or a new name at every call site: it
 * recognizes an exit by that identity and sets `pointerEvents` on the DOM node directly
 * — the same synchronous instant a zero-duration tween would have applied it — without
 * asking framer's animation engine to carry a string value through jsdom's WAAPI shim.
 *
 * **Usage.** Attach `ref` to the `motion.*` element (through
 * {@link import('@/shared/lib/merge-refs').mergeRefs} when the element already owns a
 * ref) and spread `onAnimationStart` onto it. The `exit` object keeps
 * `transition: EXIT_TRANSITION` — that is the only thing this hook keys on — and drops
 * `pointerEvents` entirely; entry and any mid-life `animate` calls are untouched because
 * their transition is never `EXIT_TRANSITION`.
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

  const onAnimationStart = useCallback((definition: TargetAndTransition | VariantLabels) => {
    if (
      typeof definition !== 'object' ||
      definition === null ||
      (definition as TargetAndTransition).transition !== EXIT_TRANSITION
    ) {
      return;
    }
    const el = ref.current;
    if (el) el.style.pointerEvents = 'none';
  }, []);

  return { ref, onAnimationStart };
}
