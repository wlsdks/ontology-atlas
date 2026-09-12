import { describe, expect, it } from 'vitest';

import type { AcpWorkReceipt } from '@/shared/lib/acp-work-receipt';
import type { AgentNotification } from '@/shared/lib/agent-notifications';
import type { AgentWorkSession } from '@/shared/lib/agent-work-session';
import { deriveBellInbox } from './bell-inbox';
import type { AgentWorkProjection } from './agent-work-projection';

/**
 * Local noon, not a UTC instant. The day grouping reads the **reader's own** calendar
 * day, so a fixture pinned to a UTC hour lands on a different day in a different
 * timezone and the labels flip (measured here first: `today` became `yesterday` at
 * UTC+9).
 */
const NOW = new Date(2026, 8, 12, 12, 0, 0).getTime();
const MINUTE = 60_000;

const IDLE: AgentWorkProjection = {
  mode: 'idle',
  agentName: null,
  rawAgentName: null,
  phase: null,
  summary: null,
  targetSlug: null,
  files: [],
  nextStep: null,
  lastTool: null,
  updatedAt: null,
};

function session(overrides: Partial<AgentWorkSession> & { id: string }): AgentWorkSession {
  return {
    startAt: NOW,
    endAt: NOW,
    entryCount: 1,
    counts: { added: 0, edited: 1, removed: 0 },
    lastTarget: null,
    lastTool: 'patch_concept',
    agent: 'claude-code',
    done: true,
    ...overrides,
  };
}

function receipt(overrides: Partial<AcpWorkReceipt> & { id: string }): AcpWorkReceipt {
  return {
    v: 1,
    at: new Date(NOW).toISOString(),
    updatedAt: new Date(NOW).toISOString(),
    agent: 'claude-code',
    request: '관계를 정리해줘',
    tool: 'add_relations',
    decision: 'allowed',
    result: 'completed',
    items: [],
    ...overrides,
  };
}

describe('deriveBellInbox — 할 일', () => {
  it('승인을 기다리는 턴은 할 일이 된다 — 사람이 놓치면 값을 치르는 유일한 줄', () => {
    const inbox = deriveBellInbox({
      sessions: [],
      notifications: [],
      receipts: [],
      work: {
        ...IDLE,
        mode: 'live',
        phase: 'blocked',
        agentName: 'Claude Agent',
        summary: '주문 도메인 관계를 정리해줘',
        lastTool: 'add_relations',
        updatedAt: NOW - 30_000,
      },
      readAt: 0,
      nowMs: NOW,
    });
    expect(inbox.todos).toHaveLength(1);
    expect(inbox.todos[0]).toMatchObject({
      kind: 'permission-ask',
      agent: 'Claude Agent',
      summary: '주문 도메인 관계를 정리해줘',
    });
  });

  it('일하는 중인 턴은 할 일이 아니다 — 사람을 기다리는 게 아니다', () => {
    const inbox = deriveBellInbox({
      sessions: [],
      notifications: [],
      receipts: [],
      work: { ...IDLE, mode: 'live', phase: 'editing', updatedAt: NOW - 1_000 },
      readAt: 0,
      nowMs: NOW,
    });
    expect(inbox.todos).toEqual([]);
  });

  it('폴더 문제는 하루가 지나면 할 일에서 기록으로 내려간다', () => {
    const fresh: AgentNotification = {
      id: 'task:1:problem',
      kind: 'vault-problem',
      at: NOW - 10 * MINUTE,
      node: null,
      problems: { unresolvedEdges: 2, dependencyCycles: 1 },
    };
    const stale: AgentNotification = { ...fresh, id: 'task:0:problem', at: NOW - 30 * 60 * MINUTE };
    const inbox = deriveBellInbox({
      sessions: [],
      notifications: [fresh, stale],
      receipts: [],
      work: IDLE,
      readAt: 0,
      nowMs: NOW,
    });
    expect(inbox.todos.map((todo) => todo.id)).toEqual(['task:1:problem']);
    // The one that stopped being a thing to do is still on record.
    expect(inbox.history.flatMap((group) => group.rows).map((row) => row.id)).toContain(
      'task:0:problem',
    );
  });
});

describe('deriveBellInbox — 결과', () => {
  it('시작과 끝을 한 줄로 접고 걸린 시간을 함께 말한다', () => {
    const inbox = deriveBellInbox({
      sessions: [session({ id: 'task:1', startAt: NOW - 5 * MINUTE, endAt: NOW - 2 * MINUTE })],
      notifications: [
        { id: 'task:1:start', kind: 'task-start', at: NOW - 5 * MINUTE, node: null, agent: 'claude-code' },
        {
          id: 'task:1:end',
          kind: 'task-end',
          at: NOW - 2 * MINUTE,
          node: { slug: 'domains/orders', name: '주문', kind: 'domain' },
          counts: { added: 0, edited: 1, removed: 0 },
          agent: 'claude-code',
        },
      ],
      receipts: [],
      work: IDLE,
      readAt: 0,
      nowMs: NOW,
    });
    expect(inbox.results).toHaveLength(1);
    const row = inbox.results[0];
    expect(row.kind).toBe('task');
    if (row.kind !== 'task') throw new Error('expected a task row');
    expect(row.durationMs).toBe(3 * MINUTE);
    expect(row.node?.name).toBe('주문');
    expect(row.unread).toBe(true);
  });

  it('이어진 같은 제목은 한 줄로 접히고 몇 번인지 남는다', () => {
    const notifications: AgentNotification[] = [];
    const sessions: AgentWorkSession[] = [];
    for (const index of [1, 2]) {
      const endAt = NOW - index * MINUTE;
      sessions.push(session({ id: `task:${index}`, startAt: endAt - MINUTE, endAt }));
      notifications.push({
        id: `task:${index}:end`,
        kind: 'task-end',
        at: endAt,
        node: { slug: 'domains/orders', name: '주문', kind: 'domain' },
        counts: { added: 0, edited: 1, removed: 0 },
        agent: 'claude-code',
      });
    }
    const inbox = deriveBellInbox({
      sessions,
      notifications,
      receipts: [],
      work: IDLE,
      readAt: 0,
      nowMs: NOW,
    });
    expect(inbox.results).toHaveLength(1);
    expect(inbox.results[0].repeat).toBe(2);
  });

  it('허용·거절 수는 그 작업 창 안의 사람 결정에서만 온다', () => {
    const endAt = NOW - 2 * MINUTE;
    const inbox = deriveBellInbox({
      sessions: [session({ id: 'task:1', startAt: endAt - 3 * MINUTE, endAt })],
      notifications: [
        {
          id: 'task:1:end',
          kind: 'task-end',
          at: endAt,
          node: null,
          counts: { added: 2, edited: 0, removed: 0 },
          agent: 'claude-code',
        },
      ],
      receipts: [
        receipt({ id: 'r-in', updatedAt: new Date(endAt - MINUTE).toISOString() }),
        receipt({
          id: 'r-far',
          decision: 'rejected',
          result: 'not-run',
          updatedAt: new Date(endAt - 60 * MINUTE).toISOString(),
        }),
      ],
      work: IDLE,
      readAt: 0,
      nowMs: NOW,
    });
    const task = inbox.results.find((row) => row.kind === 'task');
    if (task?.kind !== 'task') throw new Error('expected a task row');
    expect(task.allowed).toBe(1);
    expect(task.rejected).toBe(0);
    // The far-away decision is not folded into a task it had nothing to do with; a
    // rejection writes nothing at all, so its own row is the only place it can be seen.
    const decision = inbox.results.find((row) => row.kind === 'decision');
    expect(decision?.id).toBe('r-far');
  });

  /*
   * ⚠️ Keyed on the subject alone the fold could invert a decision: reject, retry, allow on
   * the same request folds into one row, the newer row wins, and the panel prints
   * 「허용했어요 ×2」 over a rejection that really happened. Receipts never reach the
   * timeline, so this row is the only rendering that decision gets.
   */
  it('반대되는 판정은 접히지 않는다 — 거절한 기록이 허용으로 덮이지 않는다', () => {
    const inbox = deriveBellInbox({
      sessions: [],
      notifications: [],
      receipts: [
        receipt({
          id: 'r-1',
          decision: 'rejected',
          result: 'not-run',
          request: '배송 도메인을 지워줘',
          updatedAt: new Date(NOW - 4 * MINUTE).toISOString(),
        }),
        receipt({
          id: 'r-2',
          decision: 'allowed',
          request: '배송 도메인을 지워줘',
          updatedAt: new Date(NOW - 2 * MINUTE).toISOString(),
        }),
      ],
      work: IDLE,
      readAt: 0,
      nowMs: NOW,
    });
    expect(inbox.results).toHaveLength(2);
    expect(inbox.results.map((row) => row.kind === 'decision' && row.decision)).toEqual([
      'allowed',
      'rejected',
    ]);
  });

  it('같은 대상이라도 한 일이 다르면 접히지 않는다', () => {
    const sessions: AgentWorkSession[] = [];
    const notifications: AgentNotification[] = [];
    const node = { slug: 'domains/orders', name: '주문', kind: 'domain' };
    for (const [index, counts] of [
      [1, { added: 12, edited: 0, removed: 0 }],
      [2, { added: 0, edited: 0, removed: 2 }],
    ] as const) {
      const endAt = NOW - index * MINUTE;
      sessions.push(session({ id: `task:${index}`, startAt: endAt - MINUTE, endAt }));
      notifications.push({
        id: `task:${index}:end`,
        kind: 'task-end',
        at: endAt,
        node,
        counts,
        agent: 'claude-code',
      });
    }
    const inbox = deriveBellInbox({
      sessions,
      notifications,
      receipts: [],
      work: IDLE,
      readAt: 0,
      nowMs: NOW,
    });
    expect(inbox.results).toHaveLength(2);
    expect(inbox.results.every((row) => row.repeat === 1)).toBe(true);
  });

  it('다른 에이전트의 작업에는 내 판정을 붙이지 않는다', () => {
    const mine = NOW - 20 * MINUTE;
    const theirs = NOW - 18 * MINUTE;
    const inbox = deriveBellInbox({
      sessions: [
        session({ id: 'task:mine', startAt: mine - MINUTE, endAt: mine, agent: 'claude-code' }),
        session({ id: 'task:theirs', startAt: theirs, endAt: theirs, agent: 'codex-mcp-client' }),
      ],
      notifications: [
        { id: 'task:mine:end', kind: 'task-end', at: mine, node: null, counts: { added: 1, edited: 0, removed: 0 }, agent: 'claude-code' },
        { id: 'task:theirs:end', kind: 'task-end', at: theirs, node: null, counts: { added: 2, edited: 0, removed: 0 }, agent: 'codex-mcp-client' },
      ],
      // The decision is closer in time to the other agent's turn, and belongs to neither
      // but the one that shares its name.
      receipts: [receipt({ id: 'r-1', agent: 'claude-acp', updatedAt: new Date(theirs - 30_000).toISOString() })],
      work: IDLE,
      readAt: 0,
      nowMs: NOW,
    });
    const rows = inbox.results.filter((row) => row.kind === 'task');
    const byId = new Map(rows.map((row) => [row.id, row.kind === 'task' ? row.allowed : 0]));
    expect(byId.get('task:mine')).toBe(1);
    expect(byId.get('task:theirs')).toBe(0);
  });

  it('읽은 시점보다 오래된 줄은 안 읽음으로 세지 않는다', () => {
    const endAt = NOW - 10 * MINUTE;
    const inbox = deriveBellInbox({
      sessions: [session({ id: 'task:1', startAt: endAt - MINUTE, endAt })],
      notifications: [
        {
          id: 'task:1:end',
          kind: 'task-end',
          at: endAt,
          node: null,
          counts: { added: 1, edited: 0, removed: 0 },
        },
      ],
      receipts: [],
      work: IDLE,
      readAt: NOW - 5 * MINUTE,
      nowMs: NOW,
    });
    expect(inbox.unreadResults).toBe(0);
  });
});

describe('deriveBellInbox — 기록', () => {
  it('하루를 제목으로 올리고 작업은 한 줄로 접는다', () => {
    const today = NOW - 2 * MINUTE;
    const yesterday = NOW - 26 * 60 * MINUTE;
    const inbox = deriveBellInbox({
      sessions: [session({ id: 'task:1', startAt: today - MINUTE, endAt: today })],
      notifications: [
        { id: 'task:1:start', kind: 'task-start', at: today - MINUTE, node: null },
        {
          id: 'task:1:end',
          kind: 'task-end',
          at: today,
          node: null,
          counts: { added: 1, edited: 0, removed: 0 },
        },
        {
          id: 'task:0:domain-added',
          kind: 'domain-added',
          at: yesterday,
          node: { slug: 'domains/pay', name: '결제', kind: 'domain' },
        },
      ],
      receipts: [],
      work: IDLE,
      readAt: 0,
      nowMs: NOW,
    });
    expect(inbox.history.map((group) => group.label)).toEqual(['today', 'yesterday']);
    // One task, one row — the start and the end are not two events to a person.
    expect(inbox.history[0].rows).toHaveLength(1);
    expect(inbox.history[0].rows[0].durationMs).toBe(MINUTE);
  });

  it('끝나지 않은 작업은 아직 하는 중으로 남는다', () => {
    const inbox = deriveBellInbox({
      sessions: [session({ id: 'task:1', done: false })],
      notifications: [{ id: 'task:1:start', kind: 'task-start', at: NOW - MINUTE, node: null }],
      receipts: [],
      work: IDLE,
      readAt: 0,
      nowMs: NOW,
    });
    expect(inbox.history[0].rows[0]).toMatchObject({ kind: 'task-start', running: true });
  });
});

/**
 * The seeded fixture the render loop and the widget test share: **12 events** — 2 things
 * waiting on the person, 4 finished turns (two of them the same title in a row), and 6
 * timeline events across two days.
 */
describe('deriveBellInbox — 12건 씨앗', () => {
  const ask: AgentWorkProjection = {
    ...IDLE,
    mode: 'live',
    phase: 'blocked',
    agentName: 'Claude Agent',
    summary: '주문 도메인의 관계를 정리해줘',
    lastTool: 'add_relations',
    updatedAt: NOW - 30_000,
  };
  const sessions: AgentWorkSession[] = [
    session({ id: 'task:a', startAt: NOW - 70 * MINUTE, endAt: NOW - 67 * MINUTE }),
    session({ id: 'task:b', startAt: NOW - 40 * MINUTE, endAt: NOW - 37 * MINUTE }),
    session({ id: 'task:c', startAt: NOW - 30 * MINUTE, endAt: NOW - 28 * MINUTE }),
    session({ id: 'task:d', startAt: NOW - 20 * MINUTE, endAt: NOW - 19 * MINUTE }),
  ];
  const orders = { slug: 'domains/orders', name: '주문', kind: 'domain' } as const;
  const portfolio = {
    slug: 'domains/project-portfolio',
    name: '프로젝트 포트폴리오 관리',
    kind: 'domain',
  } as const;
  const notifications: AgentNotification[] = [
    { id: 'task:a:start', kind: 'task-start', at: NOW - 70 * MINUTE, node: null, agent: 'claude-code' },
    {
      id: 'task:a:end',
      kind: 'task-end',
      at: NOW - 67 * MINUTE,
      node: portfolio,
      counts: { added: 0, edited: 1, removed: 0 },
      agent: 'claude-code',
    },
    {
      id: 'task:b:end',
      kind: 'task-end',
      at: NOW - 37 * MINUTE,
      node: portfolio,
      counts: { added: 0, edited: 1, removed: 0 },
      agent: 'claude-code',
    },
    {
      id: 'task:c:end',
      kind: 'task-end',
      at: NOW - 28 * MINUTE,
      node: orders,
      counts: { added: 12, edited: 0, removed: 0 },
      agent: 'codex-mcp-client',
    },
    {
      id: 'task:d:end',
      kind: 'task-end',
      at: NOW - 19 * MINUTE,
      node: null,
      counts: { added: 0, edited: 0, removed: 3 },
      agent: 'codex-mcp-client',
    },
    { id: 'task:d:problem', kind: 'vault-problem', at: NOW - 19 * MINUTE, node: null, problems: { unresolvedEdges: 2, dependencyCycles: 1 } },
    { id: 'task:c:domain-added', kind: 'domain-added', at: NOW - 28 * MINUTE, node: orders },
    { id: 'task:c:bridge', kind: 'bridge-inserted', at: NOW - 28 * MINUTE, node: orders, childCount: 4 },
    { id: 'old:domain-removed', kind: 'domain-removed', at: NOW - 26 * 60 * MINUTE, node: null, label: '배송' },
  ];

  const inbox = deriveBellInbox({
    sessions,
    notifications,
    receipts: [
      receipt({ id: 'r-b', updatedAt: new Date(NOW - 38 * MINUTE).toISOString() }),
      receipt({
        id: 'r-c',
        decision: 'rejected',
        result: 'not-run',
        request: '배송 도메인을 지워줘',
        updatedAt: new Date(NOW - 5 * MINUTE).toISOString(),
      }),
    ],
    work: ask,
    readAt: NOW - 45 * MINUTE,
    nowMs: NOW,
  });

  it('할 일은 기다리는 요청과 어제 생긴 문제 둘뿐이다', () => {
    expect(inbox.todos.map((todo) => todo.kind)).toEqual(['permission-ask', 'folder-problem']);
  });

  it('결과는 접힌 뒤 네 줄이고 이어진 같은 제목은 ×2 로 남는다', () => {
    expect(inbox.results).toHaveLength(4);
    expect(inbox.results.filter((row) => row.repeat > 1)).toHaveLength(1);
    expect(inbox.results.filter((row) => row.kind === 'decision')).toHaveLength(1);
  });

  it('읽은 시점 뒤의 결과만 안 읽음이다', () => {
    expect(inbox.unreadResults).toBe(4);
  });

  it('기록은 작업별로 접히고 오늘과 어제로 나뉜다', () => {
    expect(inbox.history.map((group) => group.label)).toEqual(['today', 'yesterday']);
    // 4 folded tasks + a problem + a domain + a bridge + the rejection that wrote nothing.
    expect(inbox.history.flatMap((group) => group.rows)).toHaveLength(9);
    expect(
      inbox.history.flatMap((group) => group.rows).filter((row) => row.kind === 'human-decision'),
    ).toHaveLength(1);
  });
});
