import { describe, expect, it } from "vitest";
import {
  countRecentEntries,
  parseAgentActivityLog,
  toSlugTarget,
} from "./agent-activity-log";

const NOW = Date.parse("2026-08-01T12:00:00.000Z");

describe("parseAgentActivityLog", () => {
  it("깨진 줄과 다른 버전을 건너뛰고 v1 감사 사실만 복원한다", () => {
    const raw = [
      '{"v":1,"at":"2026-08-01T11:59:00.000Z","tool":"add_concept","target":"capabilities/a","summary":"add a","agent":"claude-code","why":null}',
      "broken",
      '{"v":2,"at":"2026-08-01T12:00:00.000Z","summary":"future"}',
    ].join("\n");
    expect(parseAgentActivityLog(raw)).toEqual([
      {
        v: 1,
        at: "2026-08-01T11:59:00.000Z",
        tool: "add_concept",
        target: "capabilities/a",
        summary: "add a",
        agent: "claude-code",
        why: null,
      },
    ]);
  });

  it("limit은 가장 최근 tail에 적용한다", () => {
    const raw = [
      '{"v":1,"at":"2026-08-01T11:57:00.000Z","summary":"a"}',
      '{"v":1,"at":"2026-08-01T11:58:00.000Z","summary":"b"}',
      '{"v":1,"at":"2026-08-01T11:59:00.000Z","summary":"c"}',
    ].join("\n");
    expect(parseAgentActivityLog(raw, { limit: 2 }).map((entry) => entry.summary)).toEqual(["b", "c"]);
  });
});

describe("activity log facts", () => {
  it("24시간 안의 유효 시각만 센다", () => {
    const entries = parseAgentActivityLog([
      `{"v":1,"at":"${new Date(NOW - 1_000).toISOString()}","summary":"recent"}`,
      `{"v":1,"at":"${new Date(NOW - 25 * 60 * 60 * 1000).toISOString()}","summary":"old"}`,
    ].join("\n"));
    expect(countRecentEntries(entries, NOW)).toBe(1);
  });

  it("실재 노드 후보 모양만 slug로 통과시킨다", () => {
    expect(toSlugTarget("capabilities/checkout")).toBe("capabilities/checkout");
    expect(toSlugTarget("수납-정책")).toBe("수납-정책");
    expect(toSlugTarget("(batch)")).toBeNull();
    expect(toSlugTarget("docs/meeting.md")).toBeNull();
    expect(toSlugTarget("a b")).toBeNull();
  });
});
