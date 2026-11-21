"use client";

import { useRef, useState } from "react";

import { cn } from "@/shared/lib/cn";

import { SOURCE_STATE_COUNT, SOURCE_STATE_ORDER, sourceStateFill } from "../model/source-states";
import { useRetargetingTween } from "./use-retargeting-tween";

/** Left and right edges of each state's segment, as shares of the whole: `SOURCE_STATE_COUNT` ends. */
export function stateBoundaries(byState: ArrayLike<number>, total: number): number[] {
  const ends: number[] = [];
  let sum = 0;
  for (let i = 0; i < SOURCE_STATE_COUNT; i += 1) {
    sum += byState[i] ?? 0;
    ends.push(total > 0 ? Math.min(1, sum / total) : 0);
  }
  return ends;
}

/** The CSS clip that shows one segment between two drawn ends, with a 1px seam after the one before. */
export function segmentClip(start: number, end: number): string {
  const right = (100 - end * 100).toFixed(3);
  const left = (start * 100).toFixed(3);
  return `inset(0 ${right}% 0 calc(${left}% + ${start > 0 ? 1 : 0}px))`;
}

/**
 * One bar per row: a segment per state in `SOURCE_STATE_ORDER`, each a full-width layer clipped to
 * its share, so read in part keeps its hatching at any width. The share beside it is drawn with the
 * bar; `shareText` turns the drawn page share into its words.
 */
export function SourceStateBar({
  byState,
  total,
  reduced,
  fromZero,
  title,
  shareText,
  className,
}: {
  byState: ArrayLike<number>;
  total: number;
  reduced: boolean;
  /** Counts up from an empty bar, as on a first arrival. */
  fromZero: boolean;
  title: string;
  shareText: (drawnPageShare: number, settled: boolean) => string;
  className?: string;
}) {
  const complete = total > 0 && (byState[0] ?? 0) === total;
  const segmentRefs = useRef<(HTMLSpanElement | null)[]>([]);
  const shareRef = useRef<HTMLSpanElement | null>(null);
  const shownShare = useRef("");
  const ends = stateBoundaries(byState, total);
  // Written once; later frames are drawn by the tween, so a render never puts the final number over a moving one.
  const [firstShare] = useState(() => shareText(fromZero ? 0 : ends[0] ?? 0, !fromZero));

  useRetargetingTween(ends, { reduced, from: fromZero ? ends.map(() => 0) : undefined }, (drawn, settled) => {
    let start = 0;
    for (let i = 0; i < SOURCE_STATE_COUNT; i += 1) {
      const end = drawn[i] ?? 0;
      const segment = segmentRefs.current[i];
      if (segment) segment.style.clipPath = segmentClip(start, end);
      start = end;
    }
    const text = shareText(drawn[0] ?? 0, settled);
    if (shareRef.current && shownShare.current !== text) {
      shareRef.current.textContent = text;
      shownShare.current = text;
    }
  });

  return (
    <span className={cn("flex w-full min-w-0 items-center gap-3.5", className)} title={title}>
      <span aria-hidden data-testid="sources-row-bar" className="relative block h-1.5 min-w-0 flex-1 overflow-hidden rounded-full">
        {SOURCE_STATE_ORDER.map((state, i) => (
          <span
            key={state}
            ref={(node) => {
              segmentRefs.current[i] = node;
            }}
            data-state={state}
            className="motion-progress-segment absolute inset-0"
            style={{ background: sourceStateFill(state, complete), clipPath: segmentClip(0, 0) }}
          />
        ))}
      </span>
      <span ref={shareRef} data-testid="sources-row-share" className="w-11 flex-none text-right tabular-nums text-[color:var(--color-text-primary)]">
        {firstShare}
      </span>
    </span>
  );
}
