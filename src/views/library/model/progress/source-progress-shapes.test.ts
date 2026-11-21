import { describe, expect, it } from "vitest";

import { SOURCE_STATE_ORDER } from "@/widgets/library-sources-overview";

import { nextBatchEnd, recordedDays, showsProgressChart, stateBoundaries } from "./source-progress-shapes";

const counts = (over: Record<string, number>) =>
  Object.fromEntries(SOURCE_STATE_ORDER.map((state) => [state, over[state] ?? 0])) as Parameters<typeof stateBoundaries>[0];
const series = (...counts: number[]) => counts.map((count) => ({ count }));

describe("recordedDays", () => {
  it("counts the buckets where the page count rose, not the buckets that held pages", () => {
    expect(recordedDays(series(0, 2, 2, 5, 5, 6))).toBe(3);
    expect(recordedDays(series(4, 4, 4))).toBe(1);
    expect(recordedDays([])).toBe(0);
  });
});

describe("showsProgressChart", () => {
  it("waits for three recorded days, because fewer is a step and not a history", () => {
    expect(showsProgressChart(series(0, 1, 2))).toBe(false);
    expect(showsProgressChart(series(0, 1, 2, 3))).toBe(true);
  });
});

describe("stateBoundaries", () => {
  it("accumulates each state's share in the bar's order and ends at the whole", () => {
    const ends = stateBoundaries(counts({ compiled: 1, "not-compiled": 3 }), 4);
    expect(ends[0]).toBe(0.25);
    expect([...ends].sort((a, b) => a - b)).toEqual(ends);
    expect(ends[ends.length - 1]).toBe(1);
  });

  it("draws an empty folder as zero-width segments rather than dividing by zero", () => {
    expect(stateBoundaries(counts({}), 0).every((end) => end === 0)).toBe(true);
  });
});

describe("nextBatchEnd", () => {
  it("adds the batch's share to the written share, up to the whole bar", () => {
    expect(nextBatchEnd(0.25, 1, 4)).toBe(0.5);
    expect(nextBatchEnd(0.75, 10, 4)).toBe(1);
    expect(nextBatchEnd(0, 3, 0)).toBe(1);
  });
});
