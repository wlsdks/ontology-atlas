import { describe, expect, it } from "vitest";
import { estimateReadingMinutes } from "./reading-minutes";

describe("estimateReadingMinutes", () => {
  it("returns at least 1 minute for 200 words or fewer", () => {
    expect(estimateReadingMinutes(0)).toBe(1);
    expect(estimateReadingMinutes(50)).toBe(1);
    expect(estimateReadingMinutes(200)).toBe(1);
  });

  it("returns 1, 2 and 5 minutes for 200, 400 and 1000 words", () => {
    expect(estimateReadingMinutes(400)).toBe(2);
    expect(estimateReadingMinutes(1000)).toBe(5);
    expect(estimateReadingMinutes(3000)).toBe(15);
  });

  it("rounds 250 words to 1 minute and 300 to 2", () => {
    // 250/200 = 1.25 → round → 1
    expect(estimateReadingMinutes(250)).toBe(1);
    // 300/200 = 1.5 → round → 2
    expect(estimateReadingMinutes(300)).toBe(2);
  });
});
