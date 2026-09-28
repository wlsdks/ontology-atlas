import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { easeMotion } from "@/shared/motion/ease";
import { MOTION } from "@/shared/motion/tokens";
import { usePrefersReducedMotion } from "./use-prefers-reduced-motion";

const noopSubscribe = () => () => {};

/**
 * Below this, the first frames paint a rounded-down number that reads as the answer (a target of
 * 1 shows `0`), so small targets render themselves.
 */
const MIN_COUNTABLE_TARGET = 3;

/**
 * Counts 0 → target once on mount on the settle clock. A later `target` change snaps unless
 * `animateChanges` is set, which only a change answering the reader's action should use.
 * Render with `tabular-nums`; reduced motion shows the final value immediately.
 */
export function useCountUp(
  target: number,
  durationMs = MOTION.settle.duration * 1000,
  options: { animateChanges?: boolean } = {},
): number {
  const reduce = usePrefersReducedMotion();
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
  /** The intro reads the live target, so a vault arriving mid-intro is where it lands. */
  const targetRef = useRef(target);
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
      setValue(Math.round(targetRef.current * easeMotion(t)));
      if (t < 1) raf = requestAnimationFrame(tick);
      else setValue(targetRef.current);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [canAnimate, durationMs]);

  const valueRef = useRef(0);
  useEffect(() => {
    valueRef.current = value;
  }, [value]);
  const animateChanges = options.animateChanges === true;

  useEffect(() => {
    if (!synced.current) {
      synced.current = true;
      return;
    }
    if (!animateChanges || !canAnimate || !introDone.current) {
      setValue(target);
      return;
    }
    const from = valueRef.current;
    if (from === target) return;
    let raf = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / durationMs);
      setValue(Math.round(from + (target - from) * easeMotion(t)));
      if (t < 1) raf = requestAnimationFrame(tick);
      else setValue(target);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, animateChanges, canAnimate, durationMs]);

  return canAnimate ? value : target;
}
