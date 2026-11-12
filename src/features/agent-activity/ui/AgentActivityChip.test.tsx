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
    work: {
      mode: 'completed',
      agentName: null,
      rawAgentName: null,
      phase: null,
      summary: null,
      targetSlug: 'capabilities/checkout',
      files: [],
      nextStep: null,
      lastTool: 'patch_concept',
      updatedAt: NOW - 5 * 60_000,
    },
    lastNode: { slug: "capabilities/checkout", name: "주문서 작성", kind: "capability" },
    lastTargetUnnamed: false,
    notifications: [],
    sessions: [],
    readAt: 0,
    markReadUpTo: vi.fn(),
    workReceipts: [],
    unreadCount: 0,
    notificationsEnabled: true,
    markAllRead: vi.fn(),
    ...overrides,
  };
}

/**
 * The status line and the bell share one chip, so tests render the chip whole. `renderBell` keeps
 * its name because seeing the bell requires a notification.
 */
function renderChip(next: Partial<AgentActivityFeed> = {}) {
  mocks.feed = feed(next);
  return render(
    <NextIntlClientProvider locale="ko" messages={koMessages}>
      <AgentActivityChip />
    </NextIntlClientProvider>,
  );
}

/** The bell is drawn **only when there is a notification to see** — no button that opens an empty box. */
function renderBell(next: Partial<AgentActivityFeed> = {}) {
  return renderChip({
    notifications: [
      { id: "seed", kind: "task-end", at: NOW - 1000, node: null, counts: { added: 1, edited: 0, removed: 0 } },
    ],
    ...next,
  });
}

/**
 * A finished task the badge can count. The badge counts **result rows**, so a test that
 * wants an unread badge has to give the feed a session and its end notification — a bare
 * `unreadCount` is the raw notification total this slice stopped showing.
 */
function finishedTask(id: string, endAt: number, counts = { added: 1, edited: 0, removed: 0 }) {
  return {
    session: {
      id,
      startAt: endAt - 60_000,
      endAt,
      entryCount: 1,
      counts,
      lastTarget: null,
      lastTool: 'add_concept',
      agent: null,
      done: true,
    },
    notification: { id, kind: 'task-end' as const, at: endAt, node: null, counts },
  };
}

describe("AgentActivityChip", () => {
  beforeEach(() => vi.clearAllMocks());

  it('turns an in-app approval into one line on the results tab with the words of the person and the verdict', () => {
    renderChip({
      showStatus: false,
      workReceipts: [{
        v: 1,
        id: 's-1:tc-1',
        at: '2026-08-01T11:55:00.000Z',
        updatedAt: '2026-08-01T11:56:00.000Z',
        agent: 'codex-acp',
        request: '관계를 정리해줘',
        tool: 'add_relations',
        decision: 'allowed',
        result: 'completed',
        items: [{
          target: 'capabilities/checkout',
          operation: 'relate',
          relation: {
            from: 'capabilities/checkout',
            type: 'depends_on',
            to: 'domains/orders',
          },
          fields: [],
        }],
      }],
    });

    fireEvent.click(screen.getByTestId('agent-activity-bell'));
    // The tab with something in it opens — the decision is a result, not a log line.
    const row = screen.getByTestId('agent-inbox-result-row');
    expect(row).toHaveTextContent('허용했어요');
    expect(row).toHaveTextContent('관계를 정리해줘');
    expect(row).toHaveTextContent('변경 1건');
    // Four dot-separated state words are gone: no decision word beside a result word.
    expect(row).not.toHaveTextContent('허용함');
    expect(row).not.toHaveTextContent('완료');
  });

  it("speaks of the current step and target only from a fresh heartbeat", () => {
    renderChip({
      writing: true,
      agentName: 'Codex',
      work: {
        ...feed().work,
        mode: 'live',
        agentName: 'Codex',
        rawAgentName: 'codex-mcp-client',
        phase: 'verifying',
        summary: '관계 편집 흐름 확인',
      },
    });
    expect(screen.getByTestId("agent-activity-chip")).toHaveAttribute('data-work-mode', 'live');
    expect(screen.getByTestId("agent-activity-status")).toHaveTextContent("Codex · 검증 중");
    expect(screen.queryByTestId("agent-activity-target")).toBeNull();
    fireEvent.click(screen.getByTestId("agent-activity-status-trigger"));
    const current = screen.getByTestId("agent-activity-current-work");
    expect(current).toHaveTextContent("현재 대상");
    expect(screen.getByTestId("agent-activity-target")).toHaveTextContent("주문서 작성");
  });

  it("does not assert work in progress when only the log is recent", () => {
    renderChip({
      writing: false,
      agentName: 'Codex',
      work: { ...feed().work, mode: 'recent-write', agentName: 'Codex', rawAgentName: 'codex-mcp-client' },
    });
    expect(screen.getByTestId("agent-activity-status")).toHaveTextContent(/Codex · 변경 감지/);
    expect(screen.getByTestId("agent-activity-status")).not.toHaveTextContent('작업 중');
  });

  it("keeps the normalized name after going quiet: 'Codex · last work N minutes ago'", () => {
    renderChip({ writing: false, agentName: "Codex", work: { ...feed().work, agentName: 'Codex' } });
    const status = screen.getByTestId("agent-activity-status");
    expect(status.textContent).toMatch(/^Codex · 마지막 작업/);
  });

  it("shows only the state without a name when the name is unknown, inventing nothing", () => {
    renderChip({
      writing: true,
      agentName: null,
      work: { ...feed().work, mode: 'live', phase: 'editing', updatedAt: NOW - 1_000 },
    });
    expect(screen.getByTestId("agent-activity-status")).toHaveTextContent(/^편집 중$/);
  });

  it("says the last work time when quiet, and never writes 'connected'", () => {
    renderChip({ writing: false });
    const status = screen.getByTestId("agent-activity-status");
    expect(status.textContent).toMatch(/마지막 작업/);
    expect(status.textContent).not.toMatch(/연결/);
  });

  it("makes no link when the target is not on the map, showing only the state without a target", () => {
    renderChip({ lastNode: null, lastTargetUnnamed: true });
    expect(screen.getByTestId("agent-activity-status")).toBeInTheDocument();
    fireEvent.click(screen.getByTestId("agent-activity-status-trigger"));
    expect(screen.getByTestId("agent-activity-current-work")).toBeInTheDocument();
    expect(screen.queryByTestId("agent-activity-target")).toBeNull();
  });

  it("makes the target link a map node deep link", () => {
    renderChip();
    fireEvent.click(screen.getByTestId("agent-activity-status-trigger"));
    expect(screen.getByTestId("agent-activity-target")).toHaveAttribute(
      "href",
      expect.stringContaining("/topology?mode=focus&p=capabilities%2Fcheckout"),
    );
  });

  it('calls same-screen node selection instead of a route link when already on the map', () => {
    const onOpenNode = vi.fn();
    mocks.feed = feed();
    render(
      <NextIntlClientProvider locale="ko" messages={koMessages}>
        <AgentActivityChip onOpenNode={onOpenNode} />
      </NextIntlClientProvider>,
    );
    fireEvent.click(screen.getByTestId('agent-activity-status-trigger'));
    const target = screen.getByTestId('agent-activity-target');
    expect(target.tagName).toBe('BUTTON');
    expect(target).not.toHaveAttribute('href');
    fireEvent.click(target);
    expect(onOpenNode).toHaveBeenCalledWith('capabilities/checkout');
  });

  it('shows the current work goal, step and next action in one place when the status line is pressed', () => {
    renderChip({
      writing: true,
      agentName: 'Codex',
      work: {
        ...feed().work,
        mode: 'live',
        agentName: 'Codex',
        phase: 'verifying',
        summary: '관계 편집 흐름 확인',
        nextStep: '변경 결과 확인',
        lastTool: 'validate_vault',
        updatedAt: NOW - 1_000,
      },
    });
    fireEvent.click(screen.getByTestId('agent-activity-status-trigger'));
    const current = screen.getByTestId('agent-activity-current-work');
    expect(current).toHaveTextContent('관계 편집 흐름 확인');
    expect(current).toHaveTextContent('검증 중');
    expect(current).toHaveTextContent('변경 결과 확인');
    expect(current).toHaveTextContent('validate_vault');
  });

  it("makes the status a toolbar piece one with the bell, not floating below the row", () => {
    renderBell({ writing: true, agentName: "Codex", work: { ...feed().work, mode: "live", agentName: "Codex", phase: "planning" } });
    const dock = screen.getByTestId("agent-activity-dock");
    const status = screen.getByTestId("agent-activity-status-trigger");
    const bell = screen.getByTestId("agent-activity-bell");
    expect(dock).toContainElement(status);
    expect(dock).toContainElement(bell);
    expect(dock).toHaveAttribute("data-agent-activity-status-slot", "utility-row-segment");
    expect(status.className).not.toMatch(/\babsolute\b/);
    expect(status.className).toMatch(/rounded-r-none/);
    expect(bell.className).toMatch(/rounded-l-none/);
    // The whole sentence stays reachable when the label folds.
    expect(status).toHaveAttribute("aria-label", expect.stringContaining("Codex · 계획 중"));
  });

  /*
   * An in-app turn's status already streams in the open conversation panel, so the toolbar does not
   * repeat it.
   */
  it("does not repeat the state of an in-app turn in the toolbar while the conversation panel is open", () => {
    mocks.feed = feed({ writing: true, agentName: "Codex", work: { ...feed().work, mode: "live", agentName: "Codex", phase: "planning", startedAt: NOW - 6_000 } });
    const liveWork = { rawAgentName: "codex-acp", phase: "planning" as const, summary: null, targetSlug: null, lastTool: null, updatedAt: NOW, startedAt: NOW - 6_000 };
    const { rerender } = render(
      <NextIntlClientProvider locale="ko" messages={koMessages}>
        <AgentActivityChip liveWork={liveWork} conversationOpen />
      </NextIntlClientProvider>,
    );
    expect(screen.queryByTestId("agent-activity-status-trigger")).toBeNull();
    rerender(
      <NextIntlClientProvider locale="ko" messages={koMessages}>
        <AgentActivityChip liveWork={liveWork} conversationOpen={false} />
      </NextIntlClientProvider>,
    );
    expect(screen.getByTestId("agent-activity-status-trigger")).toBeInTheDocument();
    expect(screen.getByTestId("agent-activity-elapsed")).toHaveTextContent("6초");
  });

  it("speaks of another agent's work the open conversation panel does not show", () => {
    mocks.feed = feed({ writing: true, agentName: "Claude Code", work: { ...feed().work, mode: "live", agentName: "Claude Code", phase: "editing" } });
    render(
      <NextIntlClientProvider locale="ko" messages={koMessages}>
        <AgentActivityChip conversationOpen />
      </NextIntlClientProvider>,
    );
    expect(screen.getByTestId("agent-activity-status")).toHaveTextContent("Claude Code · 편집 중");
  });

  it("folds the status into a dot and elapsed time when the toolbar is narrow, leaving the sentence for assistive technology", () => {
    mocks.feed = feed({ writing: true, agentName: "Codex", work: { ...feed().work, mode: "live", agentName: "Codex", phase: "planning", startedAt: NOW - 6_000 } });
    render(
      <NextIntlClientProvider locale="ko" messages={koMessages}>
        <AgentActivityChip compact />
      </NextIntlClientProvider>,
    );
    const status = screen.getByTestId("agent-activity-status-trigger");
    expect(status).toHaveAttribute("data-status-fold", "compact");
    expect(screen.getByTestId("agent-activity-status").className).toMatch(/\bsr-only\b/);
    expect(screen.getByTestId("agent-activity-elapsed")).toHaveTextContent("6초");
  });

  it("attaches the unread result count to the bell", () => {
    const first = finishedTask("a", NOW - 1000, { added: 34, edited: 2, removed: 4 });
    const second = finishedTask("b", NOW - 2000);
    renderBell({
      sessions: [second.session, first.session],
      notifications: [first.notification, second.notification],
    });
    expect(screen.getByTestId("agent-activity-unread")).toHaveTextContent("2");
    expect(screen.getByTestId("agent-activity-bell")).toContainElement(
      screen.getByTestId("agent-activity-unread"),
    );
  });

  // A badge alone does not survive a glance; the glyph itself changes (filled) so the signal is shape
  // and weight.
  it("fills the bell glyph itself when there are unread results", () => {
    const task = finishedTask("a", NOW - 1000);
    renderBell({ sessions: [task.session], notifications: [task.notification] });
    const svg = screen.getByTestId("agent-activity-bell").querySelector("svg");
    expect(svg?.getAttribute("fill")).toBe("currentColor");
  });

  it("leaves the bell empty when there are no unread results", () => {
    const task = finishedTask("a", NOW - 1000);
    renderBell({
      readAt: NOW,
      sessions: [task.session],
      notifications: [task.notification],
    });
    const svg = screen.getByTestId("agent-activity-bell").querySelector("svg");
    expect(svg?.getAttribute("fill")).toBe("none");
  });

  it('opens work status and notifications with different triggers and surfaces', () => {
    renderBell({
      writing: true,
      agentName: 'Codex',
      work: {
        ...feed().work,
        mode: 'live',
        agentName: 'Codex',
        phase: 'verifying',
        summary: '관계 편집 흐름 확인',
      },
    });
    const status = screen.getByTestId('agent-activity-status-trigger');
    const bell = screen.getByTestId('agent-activity-bell');
    // One control outline, two presses: the status segment and the bell stay apart.
    expect(status).not.toBe(bell);
    expect(status).not.toContainElement(bell);
    expect(bell).not.toContainElement(status);

    fireEvent.click(status);
    expect(screen.getByTestId('agent-activity-current-work')).toBeInTheDocument();
    expect(screen.queryByTestId('agent-inbox-panel')).toBeNull();

    fireEvent.click(status);
    fireEvent.click(bell);
    expect(screen.getByTestId('agent-inbox-panel')).toBeInTheDocument();
    expect(screen.queryByTestId('agent-activity-current-work')).toBeNull();
  });

  it("opens the inbox and shows the summary when the bell is pressed", () => {
    renderBell({
      notifications: [
        { id: "a", kind: "task-end", at: NOW - 1000, node: null, counts: { added: 34, edited: 2, removed: 4 } },
      ],
    });
    fireEvent.click(screen.getByTestId("agent-activity-bell"));
    const row = screen.getByTestId("agent-inbox-history-row");
    expect(row).toHaveAttribute("data-kind", "task-end");
    // The row says what the work did, not that a task ended: four rows reading
    // Four rows reading "<agent> finished a task" is the repetition this slice removed.
    expect(row.textContent).toContain("개념 34개를 새로 적었어요");
  });

  /*
   * Opening the bell must not mark everything read; the boundary moves only through the header door or
   * opening a row.
   */
  it("does not mark anything read just by opening the bell; 'mark all read' is that door", () => {
    const markAllRead = vi.fn();
    const task = finishedTask("a", NOW - 1000);
    renderBell({ markAllRead, sessions: [task.session], notifications: [task.notification] });
    fireEvent.click(screen.getByTestId("agent-activity-bell"));
    expect(markAllRead).not.toHaveBeenCalled();
    fireEvent.click(screen.getByTestId("agent-inbox-mark-all-read"));
    expect(markAllRead).toHaveBeenCalledOnce();
  });

  it("speaks work notifications too with the internal client id turned into the product name", () => {
    renderBell({
      notifications: [
        { id: "a", kind: "task-end", at: NOW - 1000, node: null, agent: "codex-mcp-client", counts: { added: 2, edited: 0, removed: 0 } },
        { id: "b", kind: "task-start", at: NOW - 2000, node: null },
      ],
    });
    fireEvent.click(screen.getByTestId("agent-activity-bell"));
    const rows = screen.getAllByTestId("agent-inbox-history-row");
    expect(rows[0].textContent).toContain("Codex");
    // A start with no end of its own is one running task, not a second event.
    expect(rows[1].textContent).toContain("아직 하는 중");
    expect(rows[1].textContent).not.toContain("Codex");
  });

  it("has no bell at all when notifications are turned off in settings", () => {
    renderChip({ notificationsEnabled: false });
    expect(screen.queryByTestId("agent-activity-bell")).toBeNull();
    expect(screen.getByTestId("agent-activity-status")).toBeInTheDocument();
  });

  it("takes no space when display is off and there is nothing to notify", () => {
    const { container } = renderChip({ showStatus: false, notifications: [] });
    expect(container).toBeEmptyDOMElement();
  });

  it("keeps only the bell when display is off but a notification exists", () => {
    renderBell({
      showStatus: false,
      unreadCount: 1,
      notifications: [{ id: "a", kind: "task-start", at: NOW - 1000, node: null }],
    });
    expect(screen.queryByTestId("agent-activity-status")).toBeNull();
    expect(screen.getByTestId("agent-activity-bell")).toBeInTheDocument();
  });

  it("makes a just-arisen folder problem a to-do and uses the signal tone", () => {
    renderBell({
      notifications: [
        { id: "p", kind: "vault-problem", at: NOW - 1000, node: null, problems: { unresolvedEdges: 3, dependencyCycles: 1 } },
      ],
    });
    fireEvent.click(screen.getByTestId("agent-activity-bell"));
    const row = screen.getByTestId("agent-inbox-todo-row");
    expect(row).toHaveAttribute("data-todo-kind", "folder-problem");
    expect(row.textContent).toContain("끊어진 연결 3개");
    expect(row.textContent).toContain("서로 되짚는 연결 1쌍");
    expect(row.querySelector('[class*="--color-status-warning"]')).not.toBeNull();
    // The bell says what waits, not how many lines were appended.
    expect(screen.getByTestId("agent-activity-unread")).toHaveAttribute(
      "data-badge-grade",
      "waiting",
    );
  });

  it("states a cycle rise counted past the step budget as a floor", () => {
    renderBell({
      notifications: [
        {
          id: "p",
          kind: "vault-problem",
          at: NOW - 1000,
          node: null,
          problems: { unresolvedEdges: 0, dependencyCycles: 497, dependencyCyclesPartial: true },
        },
      ],
    });
    fireEvent.click(screen.getByTestId("agent-activity-bell"));
    expect(screen.getByTestId("agent-inbox-todo-row").textContent).toContain("서로 되짚는 연결 497쌍 이상");
  });
});

/**
 * **The seeded panel — 12 events, three questions.**
 *
 * The fixture is the one the render loop uses: one request waiting on the person, one
 * folder problem, four finished turns (two of them the same title in a row), and the
 * timeline behind them. It is seeded through this file's own feed stub, so the tabs, the
 * counts and the badge are measured against the same numbers the screenshots show.
 */
describe('inbox: three tabs', () => {
  // The panel remembers the tab; a remembered value from the previous case would decide
  // the next one's first frame.
  beforeEach(() => window.localStorage.clear());
  const MINUTE = 60_000;
  const portfolio = { slug: 'domains/project-portfolio', name: '프로젝트 포트폴리오 관리', kind: 'domain' };
  const orders = { slug: 'domains/orders', name: '주문', kind: 'domain' };

  const seeded = (): Partial<AgentActivityFeed> => ({
    showStatus: false,
    unreadCount: 5,
    readAt: NOW - 45 * MINUTE,
    work: {
      ...feed().work,
      mode: 'live',
      phase: 'blocked',
      agentName: 'Claude Agent',
      rawAgentName: 'claude-code',
      summary: '주문 도메인의 관계를 정리해줘',
      lastTool: 'add_relations',
      updatedAt: NOW - 30_000,
    },
    sessions: [
      ['task:a', 70, 67],
      ['task:b', 40, 37],
      ['task:c', 30, 28],
      ['task:d', 20, 19],
    ].map(([id, from, to]) => ({
      id: id as string,
      startAt: NOW - (from as number) * MINUTE,
      endAt: NOW - (to as number) * MINUTE,
      entryCount: 2,
      counts: { added: 0, edited: 1, removed: 0 },
      lastTarget: null,
      lastTool: 'patch_concept',
      agent: 'claude-code',
      done: true,
    })),
    notifications: [
      { id: 'task:a:start', kind: 'task-start', at: NOW - 70 * MINUTE, node: null, agent: 'claude-code' },
      { id: 'task:a:end', kind: 'task-end', at: NOW - 67 * MINUTE, node: portfolio, agent: 'claude-code', counts: { added: 0, edited: 1, removed: 0 } },
      { id: 'task:b:end', kind: 'task-end', at: NOW - 37 * MINUTE, node: portfolio, agent: 'claude-code', counts: { added: 0, edited: 1, removed: 0 } },
      { id: 'task:c:end', kind: 'task-end', at: NOW - 28 * MINUTE, node: orders, agent: 'codex-mcp-client', counts: { added: 12, edited: 0, removed: 0 } },
      { id: 'task:d:end', kind: 'task-end', at: NOW - 19 * MINUTE, node: null, agent: 'codex-mcp-client', counts: { added: 0, edited: 0, removed: 3 } },
      { id: 'task:d:problem', kind: 'vault-problem', at: NOW - 19 * MINUTE, node: null, problems: { unresolvedEdges: 2, dependencyCycles: 1 } },
      { id: 'task:c:domain-added', kind: 'domain-added', at: NOW - 28 * MINUTE, node: orders },
      { id: 'task:c:bridge', kind: 'bridge-inserted', at: NOW - 28 * MINUTE, node: orders, childCount: 4 },
    ],
    workReceipts: [
      { v: 1, id: 'r-b', at: new Date(NOW - 38 * MINUTE).toISOString(), updatedAt: new Date(NOW - 38 * MINUTE).toISOString(), agent: 'claude-code', request: '관계를 정리해줘', tool: 'add_relations', decision: 'allowed', result: 'completed', items: [] },
      { v: 1, id: 'r-c', at: new Date(NOW - 5 * MINUTE).toISOString(), updatedAt: new Date(NOW - 5 * MINUTE).toISOString(), agent: 'claude-code', request: '배송 도메인을 지워줘', tool: 'delete_concept', decision: 'rejected', result: 'not-run', items: [] },
    ],
  });

  const openBell = (next: Partial<AgentActivityFeed> = {}) => {
    renderChip({ ...seeded(), ...next });
    fireEvent.click(screen.getByTestId('agent-activity-bell'));
  };

  it('opens on the waiting tab when something is waiting, and the bell says that count', () => {
    openBell();
    expect(screen.getByTestId('agent-inbox-panel-todo')).toBeInTheDocument();
    const rows = screen.getAllByTestId('agent-inbox-todo-row');
    expect(rows).toHaveLength(2);
    expect(rows[0]).toHaveTextContent('Claude Agent가 허락을 기다려요');
    expect(rows[0]).toHaveTextContent('주문 도메인의 관계를 정리해줘');
    expect(rows[1]).toHaveAttribute('data-todo-kind', 'folder-problem');
    expect(screen.getByTestId('agent-activity-unread')).toHaveTextContent('2');
  });

  it('sends the door of a waiting request to where it can be decided, not answered in the inbox', () => {
    const onOpenConversation = vi.fn();
    mocks.feed = { ...feed(), ...seeded() } as AgentActivityFeed;
    render(
      <NextIntlClientProvider locale="ko" messages={koMessages}>
        <AgentActivityChip onOpenConversation={onOpenConversation} />
      </NextIntlClientProvider>,
    );
    fireEvent.click(screen.getByTestId('agent-activity-bell'));
    fireEvent.click(screen.getByTestId('agent-inbox-ask-door'));
    expect(onOpenConversation).toHaveBeenCalledOnce();
  });

  it('shows a result as one line per work and folds consecutive identical titles into ×2', () => {
    openBell();
    fireEvent.click(screen.getByRole('tab', { name: /결과/ }));
    const rows = screen.getAllByTestId('agent-inbox-result-row');
    expect(rows).toHaveLength(4);
    expect(rows.filter((row) => row.textContent?.includes('×2'))).toHaveLength(1);
    // A verb-first sentence with its object, then the facts — not four states in a row.
    expect(rows[1]).toHaveTextContent('개념 3개를 지웠어요');
    expect(rows[2]).toHaveTextContent('개념 12개를 새로 적었어요');
    expect(rows[2]).toHaveTextContent('주문');
    expect(rows[2]).toHaveTextContent('2분');
  });

  it('marks read only up to a line once it is opened', () => {
    const markReadUpTo = vi.fn();
    openBell({ markReadUpTo });
    fireEvent.click(screen.getByRole('tab', { name: /결과/ }));
    fireEvent.click(screen.getAllByTestId('agent-inbox-result-row')[2]);
    expect(markReadUpTo).toHaveBeenCalledWith(NOW - 28 * MINUTE);
  });

  it('raises a day to a heading in history and folds the start and end of the same work into one line', () => {
    openBell();
    fireEvent.click(screen.getByRole('tab', { name: /기록/ }));
    expect(screen.getAllByTestId('agent-inbox-history-day')).toHaveLength(1);
    expect(screen.getByTestId('agent-inbox-history-day')).toHaveTextContent('오늘');
    const rows = screen.getAllByTestId('agent-inbox-history-row');
    // 4 tasks (start+end folded) + a problem + a domain + a bridge + the rejection, which
    // wrote nothing and so appears in no log.
    expect(rows).toHaveLength(8);
    expect(rows.some((row) => row.dataset.kind === 'human-decision')).toBe(true);
  });

  it('treats the tabs as one tab stop moved by arrows, the APG radio grammar', () => {
    openBell();
    const tabs = screen.getAllByRole('tab');
    expect(tabs).toHaveLength(3);
    expect(tabs[0]).toHaveAttribute('aria-selected', 'true');
    expect(tabs[1]).toHaveAttribute('tabindex', '-1');
    fireEvent.keyDown(tabs[0], { key: 'ArrowRight' });
    expect(screen.getByTestId('agent-inbox-panel-results')).toBeInTheDocument();
  });

  /*
   * Memory governs the quiet grade only: with something waiting, the tab that opens is the
   * one the bell's badge is pointing at, whatever was remembered.
   */
  it('remembers the last tab seen and reopens on it when nothing is waiting', () => {
    openBell({
      work: feed().work,
      notifications: seeded().notifications?.filter((item) => item.kind !== 'vault-problem'),
    });
    fireEvent.click(screen.getByRole('tab', { name: /기록/ }));
    const bell = screen.getByTestId('agent-activity-bell');
    fireEvent.click(bell);
    fireEvent.click(bell);
    expect(screen.getByTestId('agent-inbox-panel-history')).toBeInTheDocument();
  });

  it('says what is missing in an empty tab', () => {
    openBell({ work: feed().work, notifications: [], sessions: [], workReceipts: [{
      v: 1, id: 'r', at: new Date(NOW - MINUTE).toISOString(), updatedAt: new Date(NOW - MINUTE).toISOString(),
      agent: 'claude-code', request: '관계를 정리해줘', tool: 'add_relations', decision: 'allowed', result: 'completed', items: [],
    }] });
    fireEvent.click(screen.getByRole('tab', { name: /할 일/ }));
    // The sentence says what reached this list, not what is true of the world: Atlas never
    // receives the ask itself, and the repair queue stays one press away.
    expect(screen.getByTestId('agent-inbox-todo-empty')).toHaveTextContent('여기 올라온 기다리는 일은 없어요.');
    expect(screen.getByTestId('agent-inbox-todo-empty-repair')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('tab', { name: /기록/ }));
    // A decision that wrote nothing is in no log, so the timeline takes it from the receipt.
    expect(screen.getByTestId('agent-inbox-history-row')).toHaveAttribute(
      'data-kind',
      'human-decision',
    );
  });
});

/**
 * The target node link must not float above neighbouring text.
 */
describe('bottom bar: target link alignment', () => {
  it('keeps the flex of the shape, which breaks if the truncate axis is used', () => {
    const source = readFileSync(
      join(process.cwd(), 'src/features/agent-activity/ui/AgentActivityChip.tsx'),
      'utf8',
    );
    const linkCall = source.slice(source.indexOf("shape: 'link'"));
    const call = linkCall.slice(0, linkCall.indexOf('})'));
    expect(call, 'the truncate axis pushes out inline-flex by putting in block').not.toContain('truncate: true');
    expect(source, 'truncation is left to the inner text').toContain('min-w-0 truncate');
  });
});
