"use client";

import { useLayoutEffect, useRef } from "react";

import { BandMotion } from "./band-motion";

/**
 * Drives `draw` with values moving toward `targets`: from zero over `--motion-expressive` when
 * `intro` is set when the values first exist, then following each change on `SPRING.surface`. While
 * `hold` is set nothing is drawn, so an intro can wait for its first settled numbers. Reduced motion,
 * and a change in how many values there are, draw the targets at once. Frames run only while a value
 * moves.
 */
export function useBandMotion(
  targets: readonly number[],
  { intro, reduced, hold = false }: { intro: boolean; reduced: boolean; hold?: boolean },
  draw: (positions: readonly number[], settled: boolean) => void,
): void {
  const motionRef = useRef<BandMotion | null>(null);
  const frameRef = useRef(0);
  const drawRef = useRef(draw);
  useLayoutEffect(() => {
    drawRef.current = draw;
  });
  const key = targets.join(",");

  useLayoutEffect(() => {
    if (hold) return;
    const values = key === "" ? [] : key.split(",").map(Number);
    let motion = motionRef.current;
    if (!motion || motion.size !== values.length) {
      motion = new BandMotion(values.length);
      motionRef.current = motion;
      motion.set(values, intro && !reduced ? "intro" : "instant");
    } else {
      motion.set(values, reduced ? "instant" : "follow");
    }
    const current = motion;
    cancelAnimationFrame(frameRef.current);
    let last: number | null = null;
    const tick = (now: number) => {
      const moving = current.advance(last === null ? 0 : (now - last) / 1000);
      last = now;
      drawRef.current(current.positions, !moving);
      if (moving) frameRef.current = requestAnimationFrame(tick);
    };
    const moving = current.advance(0);
    drawRef.current(current.positions, !moving);
    if (moving) frameRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frameRef.current);
    // `intro` is read once, when the values first exist.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hold, key, reduced]);
}
