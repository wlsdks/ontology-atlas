import { describe, expect, it } from "vitest";
import { formatActivityAge } from "./format-activity-age";

describe("formatActivityAge", () => {
  it("formats sub-minute ages in seconds", () => {
    expect(formatActivityAge(0)).toBe("0s");
    expect(formatActivityAge(45_000)).toBe("45s");
  });

  it("formats sub-hour ages in minutes", () => {
    expect(formatActivityAge(60_000)).toBe("1m");
    expect(formatActivityAge(59 * 60_000)).toBe("59m");
  });

  it("formats sub-2-day ages in hours", () => {
    expect(formatActivityAge(60 * 60_000)).toBe("1h");
    expect(formatActivityAge(47 * 60 * 60_000)).toBe("47h");
  });

  it("formats 2+ day ages in days", () => {
    expect(formatActivityAge(48 * 60 * 60_000)).toBe("2d");
    expect(formatActivityAge(72 * 60 * 60_000)).toBe("3d");
  });

  it("clamps negative ages to 0s (defensive, never throws)", () => {
    expect(formatActivityAge(-500)).toBe("0s");
  });
});
