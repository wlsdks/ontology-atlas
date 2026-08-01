import { describe, expect, it } from "vitest";
import {
  AGENT_NOTIFICATION_KINDS,
  AGENT_NOTIFICATION_LIMIT,
  countUnread,
  deriveTaskNotifications,
  filterNotifications,
  mergeNotifications,
  type AgentNotification,
} from "./agent-notifications";
import type { AgentWorkSession } from "./agent-work-session";

function session(overrides: Partial<AgentWorkSession> = {}): AgentWorkSession {
  return {
    id: "task:1000",
    startAt: 1_000,
    endAt: 2_000,
    entryCount: 2,
    counts: { added: 3, edited: 0, removed: 1 },
    lastTarget: "capabilities/checkout",
    lastTool: "add_relation",
    done: true,
    ...overrides,
  };
}

describe("deriveTaskNotifications", () => {
  it("작업 하나 = 시작 + 끝, 딱 둘", () => {
    const out = deriveTaskNotifications([session()]);
    expect(out.map((n) => n.kind)).toEqual(["task-start", "task-end"]);
    expect(out[1].counts).toEqual({ added: 3, edited: 0, removed: 1 });
    expect(out[1].node?.slug).toBe("capabilities/checkout");
  });

  it("아직 안 끝난 작업엔 끝 알림이 없다", () => {
    const out = deriveTaskNotifications([session({ done: false })]);
    expect(out.map((n) => n.kind)).toEqual(["task-start"]);
  });

  it("아무것도 안 센 작업은 끝 요약을 내지 않는다", () => {
    const out = deriveTaskNotifications([
      session({ counts: { added: 0, edited: 0, removed: 0 } }),
    ]);
    expect(out.map((n) => n.kind)).toEqual(["task-start"]);
  });

  it("대상이 슬러그가 아니면 링크 없이 상태만", () => {
    const out = deriveTaskNotifications([session({ lastTarget: null })]);
    expect(out[1].node).toBeNull();
  });

  it("53줄짜리 로그가 작업 2개면 알림은 4개다 (줄 단위면 53개였다)", () => {
    const out = deriveTaskNotifications([
      session({ id: "task:1", startAt: 1, endAt: 2 }),
      session({ id: "task:2", startAt: 3, endAt: 4 }),
    ]);
    expect(out).toHaveLength(4);
  });
});

describe("mergeNotifications", () => {
  const make = (id: string, at: number): AgentNotification => ({
    id,
    kind: "task-start",
    at,
    node: null,
  });

  it("최신이 먼저, id 중복은 하나", () => {
    const merged = mergeNotifications([make("a", 1), make("b", 3)], [make("b", 3), make("c", 2)]);
    expect(merged.map((n) => n.id)).toEqual(["b", "c", "a"]);
  });

  it("상한을 넘지 않는다 — 알림함은 감사 로그의 대체물이 아니다", () => {
    const many = Array.from({ length: AGENT_NOTIFICATION_LIMIT + 20 }, (_, i) => make(`n${i}`, i));
    expect(mergeNotifications(many)).toHaveLength(AGENT_NOTIFICATION_LIMIT);
  });
});

describe("filterNotifications", () => {
  it("끈 갈래는 사라진다", () => {
    const items: AgentNotification[] = [
      { id: "a", kind: "task-start", at: 1, node: null },
      { id: "b", kind: "vault-problem", at: 2, node: null },
    ];
    expect(filterNotifications(items, new Set(["vault-problem"])).map((n) => n.id)).toEqual(["b"]);
  });
});

describe("countUnread", () => {
  it("읽은 시각 뒤의 것만 센다", () => {
    const items: AgentNotification[] = [
      { id: "a", kind: "task-start", at: 10, node: null },
      { id: "b", kind: "task-end", at: 30, node: null },
    ];
    expect(countUnread(items, 20)).toBe(1);
    expect(countUnread(items, 0)).toBe(2);
  });
});

describe("AGENT_NOTIFICATION_KINDS", () => {
  it("소유자와 합의한 다섯 갈래(끝/시작 분리로 여섯)만 있다 — 도구 호출은 없다", () => {
    expect([...AGENT_NOTIFICATION_KINDS]).toEqual([
      "task-start",
      "task-end",
      "domain-added",
      "domain-removed",
      "bridge-inserted",
      "vault-problem",
    ]);
  });
});
