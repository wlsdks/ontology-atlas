import { describe, expect, it } from "vitest";

import { computeUpdatedAgo } from "./format-updated-ago";

const NOW = Date.parse("2026-07-20T12:00:00Z");
const daysBefore = (n: number) => new Date(NOW - n * 24 * 60 * 60 * 1000).toISOString();

describe("computeUpdatedAgo", () => {
  it("같은 날은 today, 하루 전은 yesterday", () => {
    expect(computeUpdatedAgo(daysBefore(0), NOW)).toEqual({ key: "today", count: 0 });
    expect(computeUpdatedAgo(daysBefore(1), NOW)).toEqual({ key: "yesterday", count: 1 });
  });

  it("7일 미만은 일 단위, 그 위는 주/월 단위로 뭉갠다", () => {
    expect(computeUpdatedAgo(daysBefore(3), NOW)).toEqual({ key: "daysAgo", count: 3 });
    expect(computeUpdatedAgo(daysBefore(13), NOW)).toEqual({ key: "weeksAgo", count: 1 });
    expect(computeUpdatedAgo(daysBefore(29), NOW)).toEqual({ key: "weeksAgo", count: 4 });
    expect(computeUpdatedAgo(daysBefore(65), NOW)).toEqual({ key: "monthsAgo", count: 2 });
  });

  it("미래 시각(시계 스큐)은 today 로 방어한다", () => {
    expect(computeUpdatedAgo(daysBefore(-2), NOW)).toEqual({ key: "today", count: 0 });
  });

  it("파싱 불가 문자열은 null — 라벨을 숨긴다", () => {
    expect(computeUpdatedAgo("not-a-date", NOW)).toBeNull();
  });
});
