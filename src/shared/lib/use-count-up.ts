import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { usePrefersReducedMotion } from "./use-prefers-reduced-motion";

const noopSubscribe = () => () => {};

/**
 * ⚠️ **Below this a count-up is not a count, it is a wrong number with a curve on it.**
 *
 * `easeOutCubic` crosses the first rounding boundary at p = 0.2063, so at the 400ms default a
 * target of **1 displays `0` for 82.5ms** — long enough to be read as the answer — a target of 2
 * for 37ms and a target of 3 for 23.8ms. On the Harness coverage cards the numeral's tone is the
 * amber this product reserves for *nothing is here*, so counting up to 1 painted "nothing" over a
 * value that means the opposite, on the one screen whose whole repair was deleting marks that said
 * nothing (design-motion, 2026-09-13). The two lower cases are below reading; the case at 1 is not.
 *
 * The gate reads the **mount-captured** target rather than the live one, so the hook's documented
 * contract — a later `target` change snaps rather than counting again — is untouched, and the
 * 2026-08-12 regression where the intro raced an arriving vault cannot return through this door.
 */
const MIN_COUNTABLE_TARGET = 3;

/**
 * Counts 0 → target once on mount.
 *
 * The intro runs once per mount; a later `target` change snaps rather than
 * counting again. Consumers must render with `tabular-nums` so a changing digit
 * count does not shake the layout. Under reduced motion the final value appears
 * immediately.
 */
export function useCountUp(target: number, durationMs = 400): number {
  const reduce = usePrefersReducedMotion();
  // useSyncExternalStore keeps the server and the hydration render on the exact
  // target, then flips once React owns the client. The animated 0 therefore never
  // disagrees with server HTML, and no synchronous setState effect is needed.
  const hydrated = useSyncExternalStore(noopSubscribe, () => true, () => false);
  const [introTarget] = useState(target);
  const canAnimate =
    hydrated &&
    !reduce &&
    typeof requestAnimationFrame === "function" &&
    Math.abs(introTarget) >= MIN_COUNTABLE_TARGET;
  const [value, setValue] = useState(0);
  const introDone = useRef(false);
  const synced = useRef(false);
  /**
   * The intro loop reads the target **through this ref** (regression measured
   * 2026-08-12). It used to run toward the target captured in the mount closure.
   * The insights screen first renders the built-in sample (125 nodes) and the
   * user's vault (5 nodes) arrives *within* the 400 ms intro: the sync effect
   * below snapped to 5, the next frame overwrote it on its way to 125, and once
   * settled at 125 the target never changed again — so the screen said 125
   * forever while the kind breakdown beside it said 5.
   */
  const targetRef = useRef(target);
  // Writing a ref during render is blocked by lint, and an effect is not too
  // late: it runs right after commit, before the next rAF frame, so the intro
  // loop always sees the current value.
  useEffect(() => {
    targetRef.current = target;
  }, [target]);

  useEffect(() => {
    if (!canAnimate || introDone.current) return;
    introDone.current = true;
    let raf = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / durationMs);
      const eased = 1 - Math.pow(1 - t, 3); // easeOutCubic — quick then settle
      setValue(Math.round(targetRef.current * eased));
      if (t < 1) raf = requestAnimationFrame(tick);
      else setValue(targetRef.current);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
    // Intro runs exactly once (guarded by introDone); the live target arrives
    // through targetRef. `canAnimate` turns true only after hydration.
  }, [canAnimate, durationMs]);

  // After mount, keep the displayed value synced to later target changes (skip
  // the initial run so it never clobbers the intro animation).
  useEffect(() => {
    if (!synced.current) {
      synced.current = true;
      return;
    }
    setValue(target);
  }, [target]);

  return canAnimate ? value : target;
}
