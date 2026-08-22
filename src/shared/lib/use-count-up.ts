import { useEffect, useRef, useState } from "react";
import { usePrefersReducedMotion } from "./use-prefers-reduced-motion";

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
  // Start at the target when there's nothing to animate (reduced motion, or no
  // rAF as on the server) so no synchronous setState is needed in the effect.
  const canAnimate = !reduce && typeof requestAnimationFrame === "function";
  const [value, setValue] = useState(canAnimate ? 0 : target);
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
    if (introDone.current) return;
    introDone.current = true;
    if (!canAnimate) return; // already at target
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
    // Intro runs exactly once (guarded by introDone); duration read at mount and
    // the live target arrives through targetRef.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // After mount, keep the displayed value synced to later target changes (skip
  // the initial run so it never clobbers the intro animation).
  useEffect(() => {
    if (!synced.current) {
      synced.current = true;
      return;
    }
    setValue(target);
  }, [target]);

  return value;
}
