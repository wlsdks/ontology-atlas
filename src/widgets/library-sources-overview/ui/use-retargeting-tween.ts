"use client";

import { useLayoutEffect, useRef } from "react";

import { easeMotion } from "@/shared/motion/ease";
import { MOTION } from "@/shared/motion/tokens";

/** The bar fill and its share travel over `--motion-slow`. */
export const BAR_FILL_MS = MOTION.slow.duration * 1000;

/**
 * Moves drawn values toward `targets` over `BAR_FILL_MS` on the entry ease, writing each frame
 * through `apply` with no React render. A new target mid-way starts from the values last drawn, so
 * the motion never jumps or restarts; reduced motion draws the targets at once.
 */
export function useRetargetingTween(
  targets: readonly number[],
  { reduced, from }: { reduced: boolean; from?: readonly number[] },
  apply: (drawn: readonly number[], settled: boolean) => void,
): void {
  const drawnRef = useRef<number[] | null>(null);
  const frameRef = useRef(0);
  const applyRef = useRef(apply);
  useLayoutEffect(() => {
    applyRef.current = apply;
  });
  const key = targets.join(",");

  useLayoutEffect(() => {
    const to = key === "" ? [] : key.split(",").map(Number);
    const start = drawnRef.current ?? (from ? [...from] : null);
    cancelAnimationFrame(frameRef.current);
    if (reduced || start === null || start.length !== to.length || start.every((value, i) => value === to[i])) {
      drawnRef.current = to;
      applyRef.current(to, true);
      return undefined;
    }
    const began = performance.now();
    const drawn = [...start];
    drawnRef.current = drawn;
    applyRef.current(drawn, false);
    const tick = (now: number) => {
      const progress = Math.min(1, (now - began) / BAR_FILL_MS);
      const eased = easeMotion(progress);
      for (let i = 0; i < to.length; i += 1) drawn[i] = start[i]! + (to[i]! - start[i]!) * eased;
      applyRef.current(drawn, progress >= 1);
      if (progress < 1) frameRef.current = requestAnimationFrame(tick);
    };
    frameRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frameRef.current);
    // `from` seeds only the first draw; later values move on from what is drawn.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, reduced]);
}
