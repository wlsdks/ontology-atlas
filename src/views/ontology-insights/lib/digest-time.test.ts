import { describe, expect, it } from "vitest";

import { formatDigestTime } from "./digest-time";

const labels = {
  justNow: "just now",
  minutes: (value: number) => `${value}m ago`,
  hours: (value: number) => `${value}h ago`,
  days: (value: number) => `${value}d ago`,
};

const now = Date.parse("2026-08-31T12:00:00Z");

describe("digest time", () => {
  it("shortens to the largest unit that still says something", () => {
    expect(formatDigestTime("2026-08-31T11:59:30Z", labels, now)).toBe("just now");
    expect(formatDigestTime("2026-08-31T11:58:00Z", labels, now)).toBe("2m ago");
    expect(formatDigestTime("2026-08-31T09:00:00Z", labels, now)).toBe("3h ago");
    expect(formatDigestTime("2026-08-28T12:00:00Z", labels, now)).toBe("3d ago");
  });

  it("draws nothing rather than inventing a time", () => {
    // A wrong time on an audit row is worse than no time at all.
    expect(formatDigestTime("not a date", labels, now)).toBeNull();
    expect(formatDigestTime("", labels, now)).toBeNull();
  });

  it("treats a future stamp as a clock disagreement, not an event", () => {
    expect(formatDigestTime("2026-08-31T12:05:00Z", labels, now)).toBe("just now");
  });
});
