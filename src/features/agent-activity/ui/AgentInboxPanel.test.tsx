import { fireEvent, render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { describe, expect, it, vi } from 'vitest';

import koMessages from '../../../../messages/ko.json';
import { AgentInboxPanel } from './AgentInboxPanel';
import type { BellInbox, BellResult } from '../model/bell-inbox';
import type { AgentActivityFeed } from '../model/use-agent-activity-feed';

const NOW = new Date(2026, 8, 12, 12, 0, 0).getTime();
const MINUTE = 60_000;

const task: BellResult = {
  kind: 'task',
  id: 'task:1',
  at: NOW - 3 * MINUTE,
  agent: 'claude-code',
  unread: true,
  repeat: 1,
  counts: { added: 0, edited: 1, removed: 0 },
  durationMs: 3 * MINUTE,
  node: { slug: 'domains/orders', name: '주문', kind: 'domain' },
  allowed: 2,
  rejected: 0,
};

const inbox: BellInbox = { todos: [], results: [task], history: [], unreadResults: 1 };

const feed = {
  nowMs: NOW,
  readAt: 0,
  markReadUpTo: vi.fn(),
  markAllRead: vi.fn(),
} as unknown as AgentActivityFeed;

function renderPanel(
  briefCountsFor?: Parameters<typeof AgentInboxPanel>[0]['briefCountsFor'],
  next: BellInbox = inbox,
) {
  return render(
    <NextIntlClientProvider locale="ko" messages={koMessages}>
      <AgentInboxPanel inbox={next} feed={feed} briefCountsFor={briefCountsFor} />
    </NextIntlClientProvider>,
  );
}

/**
 * The second line is built from a view model so a later slice can print what a turn
 * **taught** before the agent's own facts. The seam has to be free while it is empty:
 * with nothing supplied, the line is the line that shipped.
 */
describe('결과 줄의 두 번째 줄 — 사실 목록', () => {
  it('브리프가 없으면 에이전트·걸린 시간·허용·거절만 말한다', () => {
    renderPanel();
    const row = screen.getByTestId('agent-inbox-result-row');
    // The gaps between facts are CSS, so the text node reads them back without spaces.
    // The row's own age sits between the duration and the decisions it explains.
    expect(row.textContent).toContain('Claude Code·3분·3분 전·허용 2·거절 0');
  });

  it('브리프가 있으면 에이전트 사실 앞에 먼저 온다', () => {
    renderPanel(() => [
      { label: '새로 알아야 할 것', count: 4 },
      { label: '확실하지 않은 것', count: 2, tone: 'warning' },
    ]);
    const row = screen.getByTestId('agent-inbox-result-row');
    expect(row.textContent).toContain(
      '새로 알아야 할 것 4·확실하지 않은 것 2·Claude Code·3분·3분 전·허용 2·거절 0',
    );
    // The uncertain half carries the signal tone, not a second sentence.
    expect(row.querySelector('[class*="--color-status-warning"]')).not.toBeNull();
  });
});

/** Each tab says what is not there in its own words, and only the 할 일 one carries a door. */
describe('빈 탭', () => {
  const empty: BellInbox = { todos: [], results: [], history: [], unreadResults: 0 };

  it('세 탭이 서로 다른 문장을 말한다', () => {
    renderPanel(undefined, empty);
    expect(screen.getByTestId('agent-inbox-todo-empty')).toHaveTextContent(
      '여기 올라온 기다리는 일은 없어요.',
    );
    expect(screen.getByTestId('agent-inbox-todo-empty-repair')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('tab', { name: /결과/ }));
    expect(screen.getByTestId('agent-inbox-results-empty')).toHaveTextContent(
      '아직 끝난 작업이 없어요.',
    );
    fireEvent.click(screen.getByRole('tab', { name: /기록/ }));
    expect(screen.getByTestId('agent-inbox-history-empty')).toBeInTheDocument();
  });
});
