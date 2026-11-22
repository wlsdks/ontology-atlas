import type { LibrarySourceRow } from "@/entities/docs-vault";
import { SOURCE_STATE_ORDER } from "@/widgets/library-sources-overview";

type SourceState = LibrarySourceRow["state"];

/** A chart of fewer recorded days than this is a step, not a history. */
const CHART_MIN_DAYS = 3;

/** Buckets in which at least one page records its date: the days the chart can say something about. */
export function recordedDays(series: readonly { count: number }[]): number {
  let days = 0;
  let previous = 0;
  for (const point of series) {
    if (point.count > previous) days += 1;
    previous = point.count;
  }
  return days;
}

/** Whether the pages record enough days for the chart to tell a history. */
export function showsProgressChart(series: readonly { count: number }[]): boolean {
  return recordedDays(series) >= CHART_MIN_DAYS;
}

/** Where each state's segment of the bar ends, as a share of the whole, in the bar's order. */
export function stateBoundaries(byState: Record<SourceState, number>, total: number): number[] {
  return SOURCE_STATE_ORDER.reduce<number[]>((acc, state) => {
    acc.push(Math.min(1, (acc[acc.length - 1] ?? 0) + byState[state] / Math.max(1, total)));
    return acc;
  }, []);
}

/** Where the first segment would end if the next batch were written up: aiming at Continue shows it. */
export function nextBatchEnd(pageEnd: number, batchSize: number, total: number): number {
  return Math.min(1, pageEnd + batchSize / Math.max(1, total));
}
