import { fireEvent, render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { describe, expect, it, vi } from 'vitest';

import enMessages from '../../../../messages/en.json';
import koMessages from '../../../../messages/ko.json';
import { AgentInboxPanel } from './AgentInboxPanel';
import type { BellHistoryRow, BellInbox, BellResult } from '../model/bell-inbox';
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
describe('second line of a result row: fact list', () => {
  it('says only agent, time taken, allow and reject when there is no brief', () => {
    renderPanel();
    const row = screen.getByTestId('agent-inbox-result-row');
    // The gaps between facts are CSS, so the text node reads them back without spaces.
    // The row's own age sits between the duration and the decisions it explains.
    expect(row.textContent).toContain('Claude Code·3분·3분 전·허용 2·거절 0');
  });

  it('puts the brief before the agent facts when there is one', () => {
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
describe('empty tab', () => {
  const empty: BellInbox = { todos: [], results: [], history: [], unreadResults: 0 };

  it('has the three tabs say different sentences', () => {
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

/** Both "things to fix" doors open the map INDEX, whose "To tidy" rows carry the counts. */
describe('things-to-fix doors', () => {
  it('opens the map list from the empty To do tab', () => {
    window.localStorage.clear();
    renderPanel(undefined, { todos: [], results: [], history: [], unreadResults: 0 });
    expect(screen.getByTestId('agent-inbox-todo-empty-repair').getAttribute('href')).toMatch(/^\/ko\/topology\/?\?index=expanded$/);
  });

  it('opens the map list from a folder-problem row', () => {
    window.localStorage.clear();
    renderPanel(undefined, {
      todos: [{ kind: 'folder-problem', id: 'problem:1', at: NOW - MINUTE, problems: { unresolvedEdges: 2, dependencyCycles: 0 } }],
      results: [],
      history: [],
      unreadResults: 0,
    });
    expect(screen.getByTestId('agent-inbox-problem-door').getAttribute('href')).toMatch(/^\/ko\/topology\/?\?index=expanded$/);
  });
});

/**
 * Indigo marks what needs the person, and the strip counts only what can be acted on. A settled
 * timeline's node names are not accent-coloured; a result row, whose whole row is the button, gains
 * no word-level mark.
 */
describe('ink and numbers of the panel: only what draws attention is indigo', () => {
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

  it('drops indigo from the target name in history and shows by underline that it can be pressed', () => {
    renderHistory();
    fireEvent.click(screen.getByRole('tab', { name: '기록' }));
    const object = screen.getByRole('button', { name: '지도에서 주문 열기' });
    expect(object.className).not.toContain('text-[color:var(--color-indigo-accent)]');
    // It takes the step the results tab already gives the same name, so one name reads
    // one way in both tabs.
    expect(object.className).toContain('--color-text-secondary');
    // What is left saying "this word presses" is the app's existing quiet-link underline,
    // and indigo returns only under the cursor.
    expect(object.className).toContain('decoration-[color:var(--color-indigo-line-a32)]');
    expect(object.className).toContain('hover:decoration-[color:var(--color-indigo-accent)]');
  });

  it('says by name where a result row goes when pressed, without erasing the summary', () => {
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

  it('hangs no number on the history tab, counting only what can be counted', () => {
    renderHistory();
    // To do and Results count things a person acts on or is credited with; the timeline's
    // length is a windowed log, a different unit in the same engraved slot.
    expect(screen.getByRole('tab', { name: '할 일, 0' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: '결과, 1' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: '기록' })).toBeInTheDocument();
  });
});

/**
 * A task that wrote once lasts 0 ms, so under a second the duration is left out; above it every size
 * keeps the next unit only when not zero.
 */
describe('time taken: nothing under 1 second is said, and long times follow one rule', () => {
  const historyRow = (durationMs: number | null): BellHistoryRow => ({
    id: `history:${durationMs}`,
    at: NOW - 3 * MINUTE,
    kind: 'task-end',
    agent: 'claude-code',
    node: null,
    label: null,
    counts: { added: 0, edited: 1, removed: 0 },
    problems: null,
    childCount: null,
    durationMs,
    running: false,
    decision: null,
    result: null,
  });

  function renderDurations(locale: 'ko' | 'en', durations: readonly number[]) {
    window.localStorage.clear();
    const results = durations.map((durationMs, index) => ({ ...task, id: `task:${index}`, durationMs }));
    const next: BellInbox = {
      todos: [],
      results,
      unreadResults: 0,
      history: [
        { key: 'today', label: 'today', at: NOW - 3 * MINUTE, rows: durations.map((durationMs) => historyRow(durationMs)) },
      ],
    };
    return render(
      <NextIntlClientProvider locale={locale} messages={locale === 'ko' ? koMessages : enMessages}>
        <AgentInboxPanel inbox={next} feed={feed} />
      </NextIntlClientProvider>,
    );
  }

  it('leaves a sub-second duration out of the result row and the history row', () => {
    renderDurations('ko', [0]);
    fireEvent.click(screen.getByRole('tab', { name: /결과/ }));
    const row = screen.getByTestId('agent-inbox-result-row');
    expect(row.textContent).toContain('Claude Code·3분 전·허용 2·거절 0');
    expect(row.textContent).not.toMatch(/0초/);
    fireEvent.click(screen.getByRole('tab', { name: '기록' }));
    const history = screen.getByTestId('agent-inbox-history-row');
    expect(history.textContent).not.toMatch(/0초/);
    expect(history.querySelector('[title="첫 변경부터 마지막 변경까지"]')).toBeNull();
  });

  it.each([
    ['ko', 45_000, '45초'],
    ['ko', 125_000, '2분 5초'],
    ['ko', 120_000, '2분'],
    ['ko', 3_900_000, '1시간 5분'],
    ['ko', 3_630_000, '1시간'],
    ['en', 45_000, '45s'],
    ['en', 125_000, '2m 5s'],
    ['en', 120_000, '2m'],
    ['en', 3_900_000, '1h 5m'],
    ['en', 3_630_000, '1h'],
  ] as const)('%s: %d ms reads "%s" in both tabs', (locale, durationMs, words) => {
    renderDurations(locale, [durationMs]);
    const title = locale === 'ko' ? '첫 변경부터 마지막 변경까지' : 'From the first change to the last';
    fireEvent.click(screen.getByRole('tab', { name: locale === 'ko' ? /결과/ : /Results/ }));
    expect(screen.getByTestId('agent-inbox-result-row').querySelector(`[title="${title}"]`)).toHaveTextContent(
      new RegExp(`^${words}$`),
    );
    fireEvent.click(screen.getByRole('tab', { name: locale === 'ko' ? '기록' : 'History' }));
    expect(screen.getByTestId('agent-inbox-history-row').querySelector(`[title="${title}"]`)).toHaveTextContent(
      new RegExp(`^${words}$`),
    );
  });
});
