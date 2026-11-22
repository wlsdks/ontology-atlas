import { describe, expect, it } from "vitest";

import { wikiDayText } from "./wiki-day-text";

const t = ((key: string, values?: { count?: number }) => (values ? `${key}:${values.count}` : key)) as unknown as Parameters<typeof wikiDayText>[3];
const DAY_MS = 24 * 60 * 60 * 1000;
const now = new Date(2026, 5, 20, 15, 0).getTime();

describe("wikiDayText", () => {
  it("names the last few minutes, today and yesterday in words", () => {
    expect(wikiDayText(now - 60_000, now, "en", t)).toBe("wikiIndex.day.now");
    expect(wikiDayText(new Date(2026, 5, 20, 8, 0).getTime(), now, "en", t)).toBe("wikiIndex.day.today");
    expect(wikiDayText(new Date(2026, 5, 19, 8, 0).getTime(), now, "en", t)).toBe("wikiIndex.day.yesterday");
  });

  it("counts the days of the recent week", () => {
    expect(wikiDayText(now - 3 * DAY_MS, now, "en", t)).toBe("wikiIndex.day.ago:3");
  });

  it("falls back to a short date, with the year only when it differs", () => {
    expect(wikiDayText(new Date(2026, 0, 5).getTime(), now, "en-US", t)).toBe("Jan 5");
    expect(wikiDayText(new Date(2025, 0, 5).getTime(), now, "en-US", t)).toBe("Jan 5, 2025");
  });

  it("says nothing for a page with no date", () => {
    expect(wikiDayText(Number.NaN, now, "en", t)).toBeNull();
  });
});
