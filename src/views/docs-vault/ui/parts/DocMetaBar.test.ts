import { describe, expect, it } from "vitest";
import { estimateReadingMinutes } from "./DocMetaBar";

describe("estimateReadingMinutes", () => {
  it("1 분 미만 (단어 ≤ 200) 도 최소 1분", () => {
    expect(estimateReadingMinutes(0)).toBe(1);
    expect(estimateReadingMinutes(50)).toBe(1);
    expect(estimateReadingMinutes(200)).toBe(1);
  });

  it("200 단어 = 1 분, 400 단어 = 2 분, 1000 단어 = 5 분", () => {
    expect(estimateReadingMinutes(400)).toBe(2);
    expect(estimateReadingMinutes(1000)).toBe(5);
    expect(estimateReadingMinutes(3000)).toBe(15);
  });

  it("Math.round — 250 = 1 분, 300 = 2 분 (반올림 경계)", () => {
    // 250/200 = 1.25 → round → 1
    expect(estimateReadingMinutes(250)).toBe(1);
    // 300/200 = 1.5 → round → 2
    expect(estimateReadingMinutes(300)).toBe(2);
  });
});
