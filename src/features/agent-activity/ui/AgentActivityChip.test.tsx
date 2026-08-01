import { fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { beforeEach, describe, expect, it, vi } from "vitest";
import koMessages from "../../../../messages/ko.json";
import { AgentActivityChip } from "./AgentActivityChip";
import type { AgentActivityFeed } from "../model/use-agent-activity-feed";

const mocks = vi.hoisted(() => ({ feed: {} as AgentActivityFeed }));

vi.mock("../model/use-agent-activity-feed", () => ({
  useAgentActivityFeed: () => mocks.feed,
}));

const NOW = Date.parse("2026-08-01T12:00:00.000Z");

function feed(overrides: Partial<AgentActivityFeed> = {}): AgentActivityFeed {
  return {
    showStatus: true,
    nowMs: NOW,
    writing: false,
    lastAt: NOW - 5 * 60_000,
    lastNode: { slug: "capabilities/checkout", name: "주문서 작성", kind: "capability" },
    lastTargetUnnamed: false,
    notifications: [],
    unreadCount: 0,
    notificationsEnabled: true,
    markAllRead: vi.fn(),
    ...overrides,
  };
}

function renderChip(next: Partial<AgentActivityFeed> = {}) {
  mocks.feed = feed(next);
  return render(
    <NextIntlClientProvider locale="ko" messages={koMessages}>
      <AgentActivityChip />
    </NextIntlClientProvider>,
  );
}

describe("AgentActivityChip", () => {
  beforeEach(() => vi.clearAllMocks());

  it("쓰는 중이면 「작업 중」과 대상을 말한다", () => {
    renderChip({ writing: true });
    expect(screen.getByTestId("agent-activity-status")).toHaveTextContent("작업 중");
    expect(screen.getByTestId("agent-activity-target")).toHaveTextContent("주문서 작성");
  });

  it("조용하면 마지막 작업 시각을 말한다 — 「연결됨」이라고 쓰지 않는다", () => {
    renderChip({ writing: false });
    const status = screen.getByTestId("agent-activity-status");
    expect(status.textContent).toMatch(/마지막 작업/);
    expect(status.textContent).not.toMatch(/연결/);
  });

  it("대상이 지도에 없으면 링크를 만들지 않는다 — 대상 없이 상태만", () => {
    renderChip({ lastNode: null, lastTargetUnnamed: true });
    expect(screen.getByTestId("agent-activity-status")).toBeInTheDocument();
    expect(screen.queryByTestId("agent-activity-target")).toBeNull();
  });

  it("대상 링크는 지도 노드 딥링크다", () => {
    renderChip();
    expect(screen.getByTestId("agent-activity-target")).toHaveAttribute(
      "href",
      expect.stringContaining("node=capabilities%2Fcheckout"),
    );
  });

  it("안 읽은 알림 수를 벨에 단다", () => {
    renderChip({
      unreadCount: 2,
      notifications: [
        { id: "a", kind: "task-end", at: NOW - 1000, node: null, counts: { added: 34, edited: 2, removed: 4 } },
        { id: "b", kind: "task-start", at: NOW - 2000, node: null },
      ],
    });
    expect(screen.getByTestId("agent-activity-unread")).toHaveTextContent("2");
  });

  it("벨을 누르면 알림함이 열리고 요약이 보인다", () => {
    const markAllRead = vi.fn();
    renderChip({
      markAllRead,
      notifications: [
        { id: "a", kind: "task-end", at: NOW - 1000, node: null, counts: { added: 34, edited: 2, removed: 4 } },
      ],
    });
    fireEvent.click(screen.getByTestId("agent-activity-bell"));
    const row = screen.getByTestId("agent-activity-inbox-row");
    expect(row).toHaveAttribute("data-kind", "task-end");
    expect(row.textContent).toContain("추가 34");
    expect(row.textContent).toContain("삭제 4");
    // 0인 갈래는 그리지 않는다.
    expect(markAllRead).toHaveBeenCalledOnce();
  });

  it("설정에서 알림을 끄면 벨 자체가 없다", () => {
    renderChip({ notificationsEnabled: false });
    expect(screen.queryByTestId("agent-activity-bell")).toBeNull();
    expect(screen.getByTestId("agent-activity-status")).toBeInTheDocument();
  });

  it("표시도 끄고 알릴 것도 없으면 자리를 차지하지 않는다", () => {
    const { container } = renderChip({ showStatus: false, notifications: [] });
    expect(container).toBeEmptyDOMElement();
  });

  it("표시는 껐지만 알림이 있으면 벨만 남는다", () => {
    renderChip({
      showStatus: false,
      unreadCount: 1,
      notifications: [{ id: "a", kind: "task-start", at: NOW - 1000, node: null }],
    });
    expect(screen.queryByTestId("agent-activity-status")).toBeNull();
    expect(screen.getByTestId("agent-activity-bell")).toBeInTheDocument();
  });

  it("문제 알림만 신호 톤을 쓴다 — 나머지는 무채색", () => {
    renderChip({
      notifications: [
        { id: "p", kind: "vault-problem", at: NOW - 1000, node: null, problems: { unresolvedEdges: 3, dependencyCycles: 1 } },
      ],
    });
    fireEvent.click(screen.getByTestId("agent-activity-bell"));
    const row = screen.getByTestId("agent-activity-inbox-row");
    expect(row.textContent).toContain("허공 참조 3");
    expect(row.textContent).toContain("순환 1");
    expect(row.querySelector('[class*="--color-status-warning"]')).not.toBeNull();
  });
});
