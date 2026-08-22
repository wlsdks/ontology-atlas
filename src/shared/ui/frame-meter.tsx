'use client';

import { useEffect, useState } from 'react';

import { useFrameMeter } from '@/shared/lib/appearance-preferences';

/**
 * On-screen readout of the frames the map is actually delivering.
 *
 * **What it measures, and what it deliberately does not.** It measures frames
 * that reached the eye — the interval at which `requestAnimationFrame` was really
 * called — so stutter is caught whatever caused it: our script, GC, compositing,
 * a browser extension. It does **not** measure how many ms our code spent in a
 * frame; that needs instrumentation inside the loop, and measuring it here
 * mistakes the meter's own rAF for the app's. Measured wrong once on 2026-07-31:
 * an 8.3 ms rAF interval was read as "the app spends 8.3 ms", when it was simply
 * a 120 Hz display's refresh interval.
 *
 * **Why the worst gap matters more than fps.** Stutter is in the tail, not the
 * mean. Timestamped from an owner's screen recording: the median was a healthy
 * 16.7 ms (60 fps) while the worst gap was **150 ms**, and only 8 frames in 11
 * seconds (1.4%) exceeded 100 ms. An average would have reported "normal". So
 * this meter puts fps and the worst gap of the last second side by side.
 *
 * **Off means nothing runs** — no rAF, no render. A performance meter that costs
 * performance is a liar.
 */

/** Readout refresh (ms). A setState per frame would make the meter the load. */
const REPORT_MS = 250;
/** Window for the worst gap (ms), matched to how long the eye remembers a stutter. */
const WORST_WINDOW_MS = 1000;
/** Counted as a dropped frame above this — twice one 60 Hz frame (16.7 ms). */
const JANK_MS = 34;

interface Sample {
  fps: number;
  worst: number;
  jank: number;
}

/**
 * Reads the preference and, when off, does not mount the measuring half at all.
 *
 * Handling on/off by clearing state inside an effect instead would keep the
 * previous session's numbers on screen for 250 ms after re-enabling — a meter
 * presenting stale values as current is the worst failure a meter has. Splitting
 * on mount removes that, and the lint complaint about resetting state in the
 * render path, for free.
 */
export function FrameMeter({ className }: { className?: string }) {
  const enabled = useFrameMeter();
  if (!enabled) return null;
  return <FrameMeterLive className={className} />;
}

function FrameMeterLive({ className }: { className?: string }) {
  const [sample, setSample] = useState<Sample | null>(null);

  useEffect(() => {
    let raf = 0;
    let last = performance.now();
    let reportedAt = last;
    // Only the window's worth of [timestamp, gap] pairs, so this cannot grow.
    const gaps: Array<[number, number]> = [];

    const tick = (now: number) => {
      const gap = now - last;
      last = now;
      gaps.push([now, gap]);
      while (gaps.length > 0 && now - gaps[0][0] > WORST_WINDOW_MS) gaps.shift();

      if (now - reportedAt >= REPORT_MS && gaps.length > 1) {
        reportedAt = now;
        let worst = 0;
        let jank = 0;
        let total = 0;
        for (const [, g] of gaps) {
          if (g > worst) worst = g;
          if (g > JANK_MS) jank += 1;
          total += g;
        }
        const fps = total > 0 ? Math.round((gaps.length / total) * 1000) : 0;
        setSample({ fps, worst: Math.round(worst), jank });
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  // No gap exists before the second sample; draw nothing rather than a
  // plausible lie like 0 fps.
  if (sample === null) return null;

  // The numbers carry the state; colour only reinforces them, so the readout is
  // still decidable without colour (WCAG 1.4.1).
  const bad = sample.worst >= 100 || sample.jank >= 3;
  const warn = !bad && (sample.worst >= JANK_MS * 2 || sample.jank >= 1);
  // Only tokens actually declared in the ramp. The first draft used
  // `--color-error-text` / `--color-warning-text`, neither of which exists: a
  // `var()` on an undeclared token fails silently, so the meter would have said
  // nothing at the moment it needed to say "danger". Caught by the
  // `undeclared-token-ref` contract test.
  const tone = bad
    ? 'text-[color:var(--color-status-danger)]'
    : warn
      ? 'text-[color:var(--color-status-warning)]'
      : 'text-[color:var(--color-text-tertiary)]';

  return (
    <div
      className={className}
      // A diagnostic must not block the map or swallow clicks.
      style={{ pointerEvents: 'none' }}
      // A number changing every 250 ms only interrupts a screen reader.
      aria-hidden="true"
    >
      <div className="flex items-center gap-2 rounded-chip border border-[color:var(--color-border-soft)] bg-[color:var(--color-panel)] px-2 py-1 font-mono text-label tabular-nums">
        <span className={tone}>{sample.fps} fps</span>
        <span className="text-[color:var(--color-divider)]">·</span>
        <span className={tone}>최악 {sample.worst}ms</span>
        {sample.jank > 0 ? (
          <>
            <span className="text-[color:var(--color-divider)]">·</span>
            <span className={tone}>끊김 {sample.jank}</span>
          </>
        ) : null}
      </div>
    </div>
  );
}
