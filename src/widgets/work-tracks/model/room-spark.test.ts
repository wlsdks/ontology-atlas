import { describe, expect, it } from 'vitest';
import { sparkRuns } from './room-spark';

describe('sparkRuns', () => {
  it('runs the head round a 900 by 300 frame at one speed, turning each corner as the next edge starts', () => {
    // A round as long in milliseconds as the frame is in pixels: one pixel per millisecond.
    const sparkPx = 160;
    const runs = sparkRuns(900, 300, sparkPx, 2400);
    expect(runs.map(run => run.edge)).toEqual(['top', 'right', 'bottom', 'left']);
    expect(runs.map(run => run.delayMs)).toEqual([0, 900, 1200, 2100]);
    // Each edge runs past its end by the spark's length, so its tail leaves too.
    expect(runs.map(run => run.durationMs)).toEqual([1060, 460, 1060, 460]);
    // At every moment of the round one edge's head is on its edge, as far round as the time says.
    const edgePx = runs.map(run => run.durationMs - sparkPx);
    for (let atMs = 0; atMs < 2400; atMs += 50) {
      const holding = runs.flatMap((run, index) => (atMs >= run.delayMs && atMs - run.delayMs < edgePx[index] ? [index] : []));
      expect(holding, `edges holding the head at ${atMs} ms`).toHaveLength(1);
      const [index] = holding;
      const roundPx = edgePx.slice(0, index).reduce((sum, length) => sum + length, 0) + (atMs - runs[index].delayMs);
      expect(roundPx).toBe(atMs);
    }
  });

  it('ends each edge off its far end, so nothing is left on the frame once the spark has run', () => {
    const [top, right, bottom, left] = sparkRuns(400, 120, 160);
    expect([top.to, right.to, bottom.to, left.to]).toEqual(['translateX(400px)', 'translateY(120px)', 'translateX(-400px)', 'translateY(-120px)']);
  });

  it('draws nothing for a frame with no size', () => {
    expect(sparkRuns(0, 0, 160)).toEqual([]);
  });
});
