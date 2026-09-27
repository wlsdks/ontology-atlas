import { describe, expect, it } from "vitest";

import { computeUpdatedAgo } from "./format-updated-ago";

const NOW = Date.parse("2026-07-20T12:00:00Z");
const daysBefore = (n: number) => new Date(NOW - n * 24 * 60 * 60 * 1000).toISOString();

describe("computeUpdatedAgo", () => {
  it("same day is today and one day earlier is yesterday", () => {
    expect(computeUpdatedAgo(daysBefore(0), NOW)).toEqual({ key: "today", count: 0 });
    expect(computeUpdatedAgo(daysBefore(1), NOW)).toEqual({ key: "yesterday", count: 1 });
  });

  it("under seven days counts days, beyond that rounds to weeks or months", () => {
    expect(computeUpdatedAgo(daysBefore(3), NOW)).toEqual({ key: "daysAgo", count: 3 });
    expect(computeUpdatedAgo(daysBefore(13), NOW)).toEqual({ key: "weeksAgo", count: 1 });
    expect(computeUpdatedAgo(daysBefore(29), NOW)).toEqual({ key: "weeksAgo", count: 4 });
    expect(computeUpdatedAgo(daysBefore(65), NOW)).toEqual({ key: "monthsAgo", count: 2 });
  });

  it("a future time from clock skew falls back to today", () => {
    expect(computeUpdatedAgo(daysBefore(-2), NOW)).toEqual({ key: "today", count: 0 });
  });

  it("an unparseable string returns null so the label hides", () => {
    expect(computeUpdatedAgo("not-a-date", NOW)).toBeNull();
  });
});
