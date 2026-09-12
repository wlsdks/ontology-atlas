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

/** Each tab says what is not there in its own words, and only the To do one carries a door. */
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

/**
 * Guardian verdict, 2026-09-12 — **indigo marks what needs the person, and the strip
 * counts only what can be acted on.**
 *
 * Measured before the correction (accent-ink pixels in the panel body of the same crops
 * `pil-edges.json` reads): To do 154 · Results 128 · History 823. A settled timeline held
 * 6.4× the accent ink of the tab holding four unread results, because its node names were
 * `tone: 'accent'`. Two seats prescribed opposite ink moves; both are refused here. The
 * timeline's object keeps its link — it is the only control in an inert row — and trades
 * the hue for the app's quiet-link underline, while a result row, whose *whole row* is the
 * button, gains no word-level mark and says its destination where there is room for it.
 */
describe('패널의 잉크와 숫자 — 주의를 끄는 것만 인디고', () => {
  const history: BellInbox = {
    todos: [],
    results: [task],
    unreadResults: 1,
    history: [
      {
        key: 'today',
        label: 'today',
        at: NOW - 4 * MINUTE,
        rows: [
          {
            id: 'task:1',
            at: NOW - 4 * MINUTE,
            kind: 'task-end',
            agent: 'claude-code',
            node: { slug: 'domains/orders', name: '주문', kind: 'domain' },
            label: null,
            counts: { added: 13, edited: 0, removed: 0 },
            problems: null,
            childCount: null,
            durationMs: 2 * MINUTE,
            running: false,
            decision: null,
            result: null,
          },
        ],
      },
    ],
  };

  function renderHistory() {
    // The panel remembers the last tab in `localStorage`, so each case starts from the
    // same place rather than from the previous case's press.
    window.localStorage.clear();
    return render(
      <NextIntlClientProvider locale="ko" messages={koMessages}>
        <AgentInboxPanel inbox={history} feed={feed} onOpenNode={vi.fn()} />
      </NextIntlClientProvider>,
    );
  }

  it('기록의 대상 이름은 인디고를 내려놓고 밑줄로 눌릴 수 있음을 말한다', () => {
    renderHistory();
    fireEvent.click(screen.getByRole('tab', { name: '기록' }));
    const object = screen.getByRole('button', { name: '지도에서 주문 열기' });
    // The hue leaves: the loudest ink in the panel no longer sits on a settled timeline.
    expect(object.className).not.toContain('text-[color:var(--color-indigo-accent)]');
    // It takes the step the results tab already gives the same name, so one name reads
    // one way in both tabs.
    expect(object.className).toContain('--color-text-secondary');
    // What is left saying "this word presses" is the app's existing quiet-link underline,
    // and indigo returns only under the cursor.
    expect(object.className).toContain('decoration-[color:var(--color-indigo-line-a32)]');
    expect(object.className).toContain('hover:decoration-[color:var(--color-indigo-accent)]');
  });

  it('결과 줄은 눌렀을 때 어디로 가는지 이름으로 말한다 — 요약을 지우지 않고', () => {
    renderHistory();
    fireEvent.click(screen.getByRole('tab', { name: /결과/ }));
    const row = screen.getByTestId('agent-inbox-result-row');
    // The whole row is the button, so the destination is appended to the summary rather
    // than replacing it through `aria-label`.
    const name = screen.getByRole('button', { name: /지도에서 주문 열기/ });
    expect(name).toBe(row);
    expect(name).toHaveAccessibleName(/개념 1개를 고쳤어요/);
    // A word inside the row takes no underline — the row presses, not the word.
    expect(row.querySelector('.underline')).toBeNull();
  });

  it('기록 탭은 숫자를 달지 않는다 — 셀 수 있는 것만 센다', () => {
    renderHistory();
    // To do and Results count things a person acts on or is credited with; the timeline's
    // length is a windowed log, a different unit in the same engraved slot.
    expect(screen.getByRole('tab', { name: '할 일, 0' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: '결과, 1' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: '기록' })).toBeInTheDocument();
  });
});
