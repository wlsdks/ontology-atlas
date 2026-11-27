import { MOTION } from '@/shared/motion';

/** How long a pulse's spark takes to run once round its room's frame, whatever the room's size. */
export const SPARK_ROUND_MS = MOTION.choreography.duration * 1.4 * 1000;

export type SparkEdge = 'top' | 'right' | 'bottom' | 'left';

/** One edge's run: its spark crosses from off one end to off the other by `transform`. */
export interface SparkRun {
  edge: SparkEdge;
  delayMs: number;
  durationMs: number;
  from: string;
  to: string;
}

/**
 * The spark's run round a frame `widthPx` by `heightPx`, clockwise from the top left. Every edge
 * moves at one speed, the frame's perimeter per round, and an edge starts as the spark's head
 * reaches its corner, so the head turns each corner without a pause; an edge runs on past its end
 * by the spark's length, so its tail leaves too. O(1).
 */
export function sparkRuns(widthPx: number, heightPx: number, sparkPx: number, roundMs = SPARK_ROUND_MS): SparkRun[] {
  const perimeter = 2 * (widthPx + heightPx);
  if (perimeter <= 0) return [];
  const msPerPx = roundMs / perimeter;
  const edges: { edge: SparkEdge; length: number; from: string; to: string }[] = [
    { edge: 'top', length: widthPx, from: 'translateX(-100%)', to: `translateX(${widthPx}px)` },
    { edge: 'right', length: heightPx, from: 'translateY(-100%)', to: `translateY(${heightPx}px)` },
    { edge: 'bottom', length: widthPx, from: 'translateX(100%)', to: `translateX(${-widthPx}px)` },
    { edge: 'left', length: heightPx, from: 'translateY(100%)', to: `translateY(${-heightPx}px)` },
  ];
  let startPx = 0;
  return edges.map(({ edge, length, from, to }) => {
    const run = { edge, delayMs: startPx * msPerPx, durationMs: (length + sparkPx) * msPerPx, from, to };
    startPx += length;
    return run;
  });
}
