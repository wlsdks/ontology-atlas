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
 * **One line lives in one place** (2026-08-17, reverting the split). The status line and the bell are
 * in the same chip, so the tests do not light up fragments either. `renderBell` is kept as a name —
 * that name carries the condition that seeing the bell requires having a notification to see.
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

describe("AgentActivityChip", () => {
  beforeEach(() => vi.clearAllMocks());

  it('앱 안 승인은 결과 탭에서 사람의 말과 판정으로 한 줄이 된다', () => {
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

  it("fresh heartbeat만 현재 단계와 대상으로 말한다", () => {
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
    expect(screen.getByTestId("agent-activity-target")).toHaveTextContent("현재 대상:주문서 작성");
  });

  it("로그만 최근이면 작업 중이라고 단정하지 않는다", () => {
    renderChip({
      writing: false,
      agentName: 'Codex',
      work: { ...feed().work, mode: 'recent-write', agentName: 'Codex', rawAgentName: 'codex-mcp-client' },
    });
    expect(screen.getByTestId("agent-activity-status")).toHaveTextContent(/Codex · 변경 감지/);
    expect(screen.getByTestId("agent-activity-status")).not.toHaveTextContent('작업 중');
  });

  it("조용해진 뒤에도 정규화한 이름은 남는다 — 「Codex · 마지막 작업 N분 전」", () => {
    renderChip({ writing: false, agentName: "Codex", work: { ...feed().work, agentName: 'Codex' } });
    const status = screen.getByTestId("agent-activity-status");
    expect(status.textContent).toMatch(/^Codex · 마지막 작업/);
  });

  it("이름을 모르면 이름 없이 상태만 — 지어내지 않는다", () => {
    renderChip({
      writing: true,
      agentName: null,
      work: { ...feed().work, mode: 'live', phase: 'editing', updatedAt: NOW - 1_000 },
    });
    expect(screen.getByTestId("agent-activity-status")).toHaveTextContent(/^편집 중$/);
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
      expect.stringContaining("/topology?mode=focus&p=capabilities%2Fcheckout"),
    );
  });

  it('이미 지도 위에서는 route 링크 대신 같은 화면의 노드 선택을 호출한다', () => {
    const onOpenNode = vi.fn();
    mocks.feed = feed();
    render(
      <NextIntlClientProvider locale="ko" messages={koMessages}>
        <AgentActivityChip onOpenNode={onOpenNode} />
      </NextIntlClientProvider>,
    );
    const target = screen.getByTestId('agent-activity-target');
    expect(target.tagName).toBe('BUTTON');
    expect(target).not.toHaveAttribute('href');
    fireEvent.click(target);
    expect(onOpenNode).toHaveBeenCalledWith('capabilities/checkout');
  });

  it('상태 줄을 누르면 현재 작업 목표·단계·다음 행동을 한곳에서 보여준다', () => {
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

  it("안 읽은 알림 수를 벨에 단다", () => {
    renderBell({
      unreadCount: 2,
      notifications: [
        { id: "a", kind: "task-end", at: NOW - 1000, node: null, counts: { added: 34, edited: 2, removed: 4 } },
        { id: "b", kind: "task-start", at: NOW - 2000, node: null },
      ],
    });
    expect(screen.getByTestId("agent-activity-unread")).toHaveTextContent("2");
    expect(screen.getByTestId("agent-activity-bell")).toContainElement(
      screen.getByTestId("agent-activity-unread"),
    );
  });

  // The badge alone did not survive a glance (owner report, 2026-08-24): a bell
  // holding unread receipts and an empty bell looked identical. The glyph itself
  // has to change, so the signal is shape and weight rather than a small badge.
  it("안 읽은 알림이 있으면 종 글리프 자체가 채워진다", () => {
    renderBell({
      unreadCount: 3,
      notifications: [
        { id: "a", kind: "task-end", at: NOW - 1000, node: null, counts: { added: 1, edited: 0, removed: 0 } },
      ],
    });
    const svg = screen.getByTestId("agent-activity-bell").querySelector("svg");
    expect(svg?.getAttribute("fill")).toBe("currentColor");
  });

  it("안 읽은 알림이 없으면 종은 비어 있다", () => {
    renderBell({
      unreadCount: 0,
      notifications: [
        { id: "a", kind: "task-end", at: NOW - 1000, node: null, counts: { added: 1, edited: 0, removed: 0 } },
      ],
    });
    const svg = screen.getByTestId("agent-activity-bell").querySelector("svg");
    expect(svg?.getAttribute("fill")).toBe("none");
  });

  it('작업 상태와 알림을 서로 다른 트리거와 표면으로 연다', () => {
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
    expect(status.parentElement).not.toContainElement(bell);

    fireEvent.click(status);
    expect(screen.getByTestId('agent-activity-current-work')).toBeInTheDocument();
    expect(screen.queryByTestId('agent-inbox-panel')).toBeNull();

    fireEvent.click(status);
    fireEvent.click(bell);
    expect(screen.getByTestId('agent-inbox-panel')).toBeInTheDocument();
    expect(screen.queryByTestId('agent-activity-current-work')).toBeNull();
  });

  it("벨을 누르면 알림함이 열리고 요약이 보인다", () => {
    renderBell({
      notifications: [
        { id: "a", kind: "task-end", at: NOW - 1000, node: null, counts: { added: 34, edited: 2, removed: 4 } },
      ],
    });
    fireEvent.click(screen.getByTestId("agent-activity-bell"));
    const row = screen.getByTestId("agent-inbox-history-row");
    expect(row).toHaveAttribute("data-kind", "task-end");
    // The row says what the work did, not that a task ended: four rows reading
    // 「<agent> 작업 끝」 is the repetition this slice removed.
    expect(row.textContent).toContain("개념 34개를 새로 적었어요");
  });

  /*
   * ⚠️ Opening the bell used to mark **everything** read. Looking in to check one thing
   * therefore erased the unread mark from the four results nobody had read, which is the
   * one fact the panel exists to keep. The boundary now moves only when a person says so
   * — the header door — or when they open a row.
   */
  it("벨을 여는 것만으로는 읽음이 되지 않는다 — 「모두 읽음」이 그 문이다", () => {
    const markAllRead = vi.fn();
    renderBell({
      markAllRead,
      unreadCount: 2,
      notifications: [
        { id: "a", kind: "task-end", at: NOW - 1000, node: null, counts: { added: 1, edited: 0, removed: 0 } },
      ],
    });
    fireEvent.click(screen.getByTestId("agent-activity-bell"));
    expect(markAllRead).not.toHaveBeenCalled();
    fireEvent.click(screen.getByTestId("agent-inbox-mark-all-read"));
    expect(markAllRead).toHaveBeenCalledOnce();
  });

  it("작업 알림도 내부 client id를 제품 이름으로 바꿔 말한다", () => {
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

  it("방금 생긴 폴더 문제는 할 일이 되고 신호 톤을 쓴다", () => {
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
});

/**
 * **The seeded panel — 12 events, three questions.**
 *
 * The fixture is the one the render loop uses: one request waiting on the person, one
 * folder problem, four finished turns (two of them the same title in a row), and the
 * timeline behind them. It is seeded through this file's own feed stub, so the tabs, the
 * counts and the badge are measured against the same numbers the screenshots show.
 */
describe('알림함 — 세 탭', () => {
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

  it('기다리는 일이 있으면 그 탭으로 열리고 벨은 그 수를 말한다', () => {
    openBell();
    expect(screen.getByTestId('agent-inbox-panel-todo')).toBeInTheDocument();
    const rows = screen.getAllByTestId('agent-inbox-todo-row');
    expect(rows).toHaveLength(2);
    expect(rows[0]).toHaveTextContent('Claude Agent가 허락을 기다려요');
    expect(rows[0]).toHaveTextContent('주문 도메인의 관계를 정리해줘');
    expect(rows[1]).toHaveAttribute('data-todo-kind', 'folder-problem');
    expect(screen.getByTestId('agent-activity-unread')).toHaveTextContent('2');
  });

  it('기다리는 요청의 문은 결정할 수 있는 자리로 보낸다 — 알림함에서 답하지 않는다', () => {
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

  it('결과는 한 작업 한 줄이고 이어진 같은 제목은 ×2 로 접힌다', () => {
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

  it('한 줄을 열면 그 줄까지만 읽음이 된다', () => {
    const markReadUpTo = vi.fn();
    openBell({ markReadUpTo });
    fireEvent.click(screen.getByRole('tab', { name: /결과/ }));
    fireEvent.click(screen.getAllByTestId('agent-inbox-result-row')[2]);
    expect(markReadUpTo).toHaveBeenCalledWith(NOW - 28 * MINUTE);
  });

  it('기록은 하루를 제목으로 올리고 같은 작업의 시작과 끝을 한 줄로 접는다', () => {
    openBell();
    fireEvent.click(screen.getByRole('tab', { name: /기록/ }));
    expect(screen.getAllByTestId('agent-inbox-history-day')).toHaveLength(1);
    expect(screen.getByTestId('agent-inbox-history-day')).toHaveTextContent('오늘');
    const rows = screen.getAllByTestId('agent-inbox-history-row');
    // 4 tasks (start+end folded) + a problem + a domain + a bridge.
    expect(rows).toHaveLength(7);
  });

  it('탭은 하나의 탭 스톱이고 화살표로 옮긴다 — APG 라디오 문법', () => {
    openBell();
    const tabs = screen.getAllByRole('tab');
    expect(tabs).toHaveLength(3);
    expect(tabs[0]).toHaveAttribute('aria-selected', 'true');
    expect(tabs[1]).toHaveAttribute('tabindex', '-1');
    fireEvent.keyDown(tabs[0], { key: 'ArrowRight' });
    expect(screen.getByTestId('agent-inbox-panel-results')).toBeInTheDocument();
  });

  it('마지막으로 본 탭을 기억한다 — 다시 열면 그 탭이다', () => {
    openBell();
    fireEvent.click(screen.getByRole('tab', { name: /기록/ }));
    const bell = screen.getByTestId('agent-activity-bell');
    fireEvent.click(bell);
    fireEvent.click(bell);
    expect(screen.getByTestId('agent-inbox-panel-history')).toBeInTheDocument();
  });

  it('빈 탭은 무엇이 없는지 말한다', () => {
    openBell({ work: feed().work, notifications: [], sessions: [], workReceipts: [{
      v: 1, id: 'r', at: new Date(NOW - MINUTE).toISOString(), updatedAt: new Date(NOW - MINUTE).toISOString(),
      agent: 'claude-code', request: '관계를 정리해줘', tool: 'add_relations', decision: 'allowed', result: 'completed', items: [],
    }] });
    fireEvent.click(screen.getByRole('tab', { name: /할 일/ }));
    expect(screen.getByTestId('agent-inbox-todo-empty')).toHaveTextContent('지금 기다리는 일이 없어요.');
    fireEvent.click(screen.getByRole('tab', { name: /기록/ }));
    expect(screen.getByTestId('agent-inbox-history-empty')).toBeInTheDocument();
  });
});

/**
 * The target node link does **not float above** the neighbouring text (owner report, 2026-08-17).
 * The cause and the measurements are in `tests/contract/agent-bar-link-alignment.contract.test.ts`.
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
