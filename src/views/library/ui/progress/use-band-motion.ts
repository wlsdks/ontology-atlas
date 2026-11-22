"use client";

import { useLayoutEffect, useRef } from "react";

import { BandMotion } from "./band-motion";

/** An intro starts after this many frames in a row arrive within `CALM_FRAME_MS`, ... */
const CALM_FRAMES = 3;
const CALM_FRAME_MS = 25;
/** ... or after this long, whichever comes first. */
const CALM_WAIT_MS = 900;

interface IntroGate {
  since: number | null;
  calm: number;
  open: boolean;
}

/**
 * Drives `draw` with values moving toward `targets`: from zero when `intro` is set, then following each
 * change on `SPRING.surface`. Nothing is drawn while `hold` is set; reduced motion draws the targets at
 * once. An intro waits on zero until frames arrive steadily, and `onStart` says when it begins.
 */
export function useBandMotion(
  targets: readonly number[],
  {
    intro,
    reduced,
    hold = false,
    onStart,
  }: { intro: boolean; reduced: boolean; hold?: boolean; onStart?: () => void },
  draw: (positions: readonly number[], settled: boolean) => void,
): void {
  const motionRef = useRef<BandMotion | null>(null);
  const frameRef = useRef(0);
  const gateRef = useRef<IntroGate | null>(null);
  const drawRef = useRef(draw);
  const onStartRef = useRef(onStart);
  useLayoutEffect(() => {
    drawRef.current = draw;
    onStartRef.current = onStart;
  });
  const key = targets.join(",");

  useLayoutEffect(() => {
    if (hold) return;
    const values = key === "" ? [] : key.split(",").map(Number);
    let motion = motionRef.current;
    if (!motion || motion.size !== values.length) {
      motion = new BandMotion(values.length);
      motionRef.current = motion;
      const introducing = intro && !reduced;
      motion.set(values, introducing ? "intro" : "instant");
      gateRef.current = introducing ? { since: null, calm: 0, open: false } : null;
    } else {
      motion.set(values, reduced ? "instant" : "follow");
    }
    const current = motion;
    cancelAnimationFrame(frameRef.current);
    let last: number | null = null;
    const tick = (now: number) => {
      const gate = gateRef.current;
      if (gate && !gate.open) {
        if (gate.since === null) gate.since = now;
        else gate.calm = last !== null && now - last <= CALM_FRAME_MS ? gate.calm + 1 : 0;
        last = now;
        if (gate.calm >= CALM_FRAMES || now - gate.since >= CALM_WAIT_MS) {
          gate.open = true;
          onStartRef.current?.();
        }
        drawRef.current(current.positions, false);
        frameRef.current = requestAnimationFrame(tick);
        return;
      }
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
