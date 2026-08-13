import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AgentActivityEntry } from "@/shared/lib/agent-activity-log";
import { useAgentWritingFocusSlug } from "./use-agent-writing-focus";

const NOW = Date.parse("2026-08-13T12:00:00.000Z");

function entry(overrides: Partial<AgentActivityEntry> & { at: string }): AgentActivityEntry {
  return {
    v: 1,
    tool: "add_concept",
    target: "capabilities/pay",
    summary: "add_concept capability:capabilities/pay",
    agent: "claude-code",
    why: null,
    ...overrides,
  };
}

describe("useAgentWritingFocusSlug", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
  });
  afterEach(() => vi.useRealTimers());

  it("쓰는-중 창(2분) 안의 마지막 쓰기 대상 슬러그를 돌려준다", () => {
    const log = [entry({ at: new Date(NOW - 30_000).toISOString() })];
    const { result } = renderHook(() => useAgentWritingFocusSlug(log));
    expect(result.current).toBe("capabilities/pay");
  });

  it("시간이 흘러 창을 벗어나면 스스로 null 로 꺼진다 — 로그가 안 바뀌어도", () => {
    const log = [entry({ at: new Date(NOW - 30_000).toISOString() })];
    const { result } = renderHook(() => useAgentWritingFocusSlug(log));
    expect(result.current).toBe("capabilities/pay");
    act(() => {
      vi.advanceTimersByTime(3 * 60_000);
    });
    expect(result.current).toBeNull();
  });

  it("배치 표식 대상은 슬러그가 아니다 — 링을 지어내지 않는다", () => {
    const log = [entry({ at: new Date(NOW - 10_000).toISOString(), target: "(batch)" })];
    const { result } = renderHook(() => useAgentWritingFocusSlug(log));
    expect(result.current).toBeNull();
  });

  it("빈 로그는 null", () => {
    const { result } = renderHook(() => useAgentWritingFocusSlug(null));
    expect(result.current).toBeNull();
  });
});
