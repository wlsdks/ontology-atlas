import { describe, expect, it } from "vitest";

import { wikiViewValues, type WikiViewValueInput } from "./wiki-view-values";

const base: WikiViewValueInput = {
  lastCompileAt: undefined,
  lastCheckAt: undefined,
  reportCount: 0,
  formatDay: (ms) => `day:${new Date(ms).toISOString().slice(0, 10)}`,
  formatCount: (count) => `n:${count}`,
  checkNever: "never",
  logNone: "none",
};

describe("wikiViewValues", () => {
  it("says never and none before anything was recorded", () => {
    expect(wikiViewValues(base)).toEqual({ checkValue: "never", logValue: "none" });
  });

  it("shows the findings count while a report holds findings, else the day of the last check", () => {
    const checked = { ...base, lastCheckAt: "2026-03-02T10:00:00Z" };
    expect(wikiViewValues({ ...checked, reportCount: 3 }).checkValue).toBe("n:3");
    expect(wikiViewValues(checked).checkValue).toBe("day:2026-03-02");
  });

  it("shows the later of the last compile and the last check in the log", () => {
    const later = wikiViewValues({ ...base, lastCompileAt: "2026-03-05T10:00:00Z", lastCheckAt: "2026-03-02T10:00:00Z" });
    expect(later.logValue).toBe("day:2026-03-05");
    const check = wikiViewValues({ ...base, lastCompileAt: "2026-03-01T10:00:00Z", lastCheckAt: "2026-03-02T10:00:00Z" });
    expect(check.logValue).toBe("day:2026-03-02");
  });

  it("treats an unparsable stamp as absent", () => {
    expect(wikiViewValues({ ...base, lastCompileAt: "garbage", lastCheckAt: "also garbage" })).toEqual({
      checkValue: "never",
      logValue: "none",
    });
  });
});
