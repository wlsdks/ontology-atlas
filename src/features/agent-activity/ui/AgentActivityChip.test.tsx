import { readFileSync } from 'node:fs';
import { join } from 'node:path';
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
    agentName: null,
    lastNode: { slug: "capabilities/checkout", name: "주문서 작성", kind: "capability" },
    lastTargetUnnamed: false,
    notifications: [],
    unreadCount: 0,
    notificationsEnabled: true,
    markAllRead: vi.fn(),
    ...overrides,
  };
}

/**
 * **한 줄이 한 곳에 산다** (2026-08-17, 자리를 가른 것을 되돌렸다). 상태 줄과
 * 종이 같은 칩에 있으므로 검사도 조각을 밝히지 않는다. `renderBell` 은 이름만
 * 남겨 둔다 — 종을 보려면 볼 알림이 있어야 한다는 조건을 그 이름이 나른다.
 */
function renderChip(next: Partial<AgentActivityFeed> = {}) {
  mocks.feed = feed(next);
  return render(
    <NextIntlClientProvider locale="ko" messages={koMessages}>
      <AgentActivityChip />
    </NextIntlClientProvider>,
  );
}

/** 종은 **볼 알림이 있을 때만** 그려진다 — 빈 알림함을 여는 버튼은 두지 않는다. */
function renderBell(next: Partial<AgentActivityFeed> = {}) {
  return renderChip({
    notifications: [
      { id: "seed", kind: "task-end", at: NOW - 1000, node: null, counts: { added: 1, edited: 0, removed: 0 } },
    ],
    ...next,
  });
}

describe("AgentActivityChip", () => {
  beforeEach(() => vi.clearAllMocks());

  it("쓰는 중이면 「작업 중」과 대상을 말한다", () => {
    renderChip({ writing: true });
    expect(screen.getByTestId("agent-activity-status")).toHaveTextContent("작업 중");
    expect(screen.getByTestId("agent-activity-target")).toHaveTextContent("주문서 작성");
  });

  it("이름을 아는 에이전트는 이름으로 말한다 — 「claude-code 작업 중」", () => {
    renderChip({ writing: true, agentName: "claude-code" });
    expect(screen.getByTestId("agent-activity-status")).toHaveTextContent("claude-code 작업 중");
  });

  it("조용해진 뒤에도 이름은 남는다 — 「codex · 마지막 작업 N분 전」", () => {
    renderChip({ writing: false, agentName: "codex" });
    const status = screen.getByTestId("agent-activity-status");
    expect(status.textContent).toMatch(/^codex · 마지막 작업/);
  });

  it("이름을 모르면 이름 없이 상태만 — 지어내지 않는다", () => {
    renderChip({ writing: true, agentName: null });
    expect(screen.getByTestId("agent-activity-status")).toHaveTextContent(/^작업 중$/);
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
    renderBell({
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
    renderBell({
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

  it("이름을 아는 작업 알림은 이름으로 말한다 — 「claude-code 작업 끝」", () => {
    renderBell({
      notifications: [
        { id: "a", kind: "task-end", at: NOW - 1000, node: null, agent: "claude-code", counts: { added: 2, edited: 0, removed: 0 } },
        { id: "b", kind: "task-start", at: NOW - 2000, node: null },
      ],
    });
    fireEvent.click(screen.getByTestId("agent-activity-bell"));
    const rows = screen.getAllByTestId("agent-activity-inbox-row");
    expect(rows[0].textContent).toContain("claude-code 작업 끝");
    // 이름 모르는 줄은 예전 문구 그대로 — 지어내지 않는다.
    expect(rows[1].textContent).toContain("작업 시작");
    expect(rows[1].textContent).not.toContain("claude-code");
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
    renderBell({
      showStatus: false,
      unreadCount: 1,
      notifications: [{ id: "a", kind: "task-start", at: NOW - 1000, node: null }],
    });
    expect(screen.queryByTestId("agent-activity-status")).toBeNull();
    expect(screen.getByTestId("agent-activity-bell")).toBeInTheDocument();
  });

  it("문제 알림만 신호 톤을 쓴다 — 나머지는 무채색", () => {
    renderBell({
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

/**
 * 대상 노드 링크가 이웃 글자보다 **위로 뜨지 않는다** (2026-08-17 소유자 지적).
 * 원인과 실측은 `tests/contract/agent-bar-link-alignment.contract.test.ts`.
 */
describe('하단 바 — 대상 링크 정렬', () => {
  it('모양의 flex 를 지킨다 — truncate 축을 쓰면 깨진다', () => {
    const source = readFileSync(
      join(process.cwd(), 'src/features/agent-activity/ui/AgentActivityChip.tsx'),
      'utf8',
    );
    const linkCall = source.slice(source.indexOf("shape: 'link'"));
    const call = linkCall.slice(0, linkCall.indexOf('})'));
    expect(call, 'truncate 축은 block 을 넣어 inline-flex 를 밀어낸다').not.toContain('truncate: true');
    expect(source, '자르기는 안쪽 글자가 맡는다').toContain('min-w-0 truncate');
  });
});
