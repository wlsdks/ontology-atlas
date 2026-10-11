import { describe, expect, it } from "vitest";
import { computeEditAge } from "./edit-age";

describe("computeEditAge", () => {
  const now = Date.parse("2026-07-24T12:00:00.000Z");

  it("returns justNow under a minute", () => {
    expect(computeEditAge(now - 30_000, now)).toEqual({ key: "justNow", count: 0 });
  });

  it("returns minutesAgo under an hour", () => {
    expect(computeEditAge(now - 3 * 60_000, now)).toEqual({ key: "minutesAgo", count: 3 });
    expect(computeEditAge(now - 59 * 60_000, now)).toEqual({ key: "minutesAgo", count: 59 });
  });

  it("returns hoursAgo under a day", () => {
    expect(computeEditAge(now - 2 * 3_600_000, now)).toEqual({ key: "hoursAgo", count: 2 });
    expect(computeEditAge(now - 23 * 3_600_000, now)).toEqual({ key: "hoursAgo", count: 23 });
  });

  it("returns yesterday at exactly one day", () => {
    expect(computeEditAge(now - 24 * 3_600_000, now)).toEqual({ key: "yesterday", count: 1 });
  });

  it("returns daysAgo under a week", () => {
    expect(computeEditAge(now - 3 * 24 * 3_600_000, now)).toEqual({ key: "daysAgo", count: 3 });
  });

  it("returns weeksAgo under a month", () => {
    expect(computeEditAge(now - 14 * 24 * 3_600_000, now)).toEqual({ key: "weeksAgo", count: 2 });
  });

  it("returns monthsAgo past a month", () => {
    expect(computeEditAge(now - 90 * 24 * 3_600_000, now)).toEqual({ key: "monthsAgo", count: 3 });
  });

  it("clamps future timestamps to justNow instead of negative counts", () => {
    expect(computeEditAge(now + 60_000, now)).toEqual({ key: "justNow", count: 0 });
  });
});
