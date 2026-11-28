import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { IntlProvider } from 'use-intl';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import en from '../../../../messages/en.json';
import ko from '../../../../messages/ko.json';
import { subscribeAgentChatIntent } from '@/shared/lib/agent-chat/agent-chat-intent';
import type { MappingFigures, MappingRequestEnd } from '../model/mapping-run';
import { workRuns } from '../model/work-run-store';
import { MAP_CONVERSATION_WAIT_MS } from './use-run-doors';
import { WorkRunCard } from './WorkRunCard';

const push = vi.fn();
const route = vi.hoisted(() => ({ pathname: '/library/' }));
vi.mock('@/i18n/navigation', () => ({ useRouter: () => ({ push }), usePathname: () => route.pathname }));
vi.mock('@/shared/lib/navigation/route-view-transition', () => ({ navigateWithViewTransition: (_href: string, go: () => void) => go() }));
vi.mock('@/shared/lib/navigation/map-navigation-pending', () => ({ beginMapNavigation: (go: () => void) => go() }));

const FOLDER = 'local:launch';
const CATALOGUES = { en, ko } as const;

function renderCard(locale: keyof typeof CATALOGUES = 'en') {
  return render(
    <IntlProvider locale={locale} messages={CATALOGUES[locale]}>
      <WorkRunCard />
    </IntlProvider>,
  );
}

/** A mapping run carries the open folder's root path, as the map's conversation keys it. */
const ROOT = '/Users/probe/Ontology Atlas/launch';
const OTHER_ROOT = '/Users/probe/Ontology Atlas/atlas';

const figures = (uncovered: number, total = 120): MappingFigures => ({ abilitiesUncovered: uncovered, abilitiesTotal: total });
const requestEnd = (uncovered: number | null, at: number, outcome: MappingRequestEnd['outcome'] = { kind: 'completed' }): MappingRequestEnd =>
  ({ outcome, figures: uncovered === null ? null : figures(uncovered), draft: false, at, sessionId: `s-${at}` });

/** A run on its second request: 48 of 120 on the map after one request that took two minutes. */
function openMappingFolder() {
  act(() => {
    workRuns.leaveFolder(FOLDER, 0);
    workRuns.enterFolderRoot(ROOT);
  });
}

function runningMapping() {
  openMappingFolder();
  workRuns.beginMapping({ folder: ROOT, folderName: 'launch', project: 'launch', agent: 'Claude Agent', figures: figures(96), startedAt: 10_000 });
  workRuns.endMappingBatch(ROOT, requestEnd(72, 130_000));
  workRuns.observeMappingWork(ROOT, { kind: 'reading', label: null, target: 'src/routes/checkout.ts', asking: false }, 131_000);
}

const MAPPING_KEY = `mapping:${ROOT}`;
const mappingRun = () => {
  const entry = workRuns.read().runs.get(MAPPING_KEY);
  return entry?.kind === 'mapping' ? entry.run : null;
};
const buttons = () => within(screen.getByTestId('work-run-card')).getAllByRole('button').map((button) => button.getAttribute('data-testid'));
const ASKING = { kind: 'writing', label: null, target: 'wiki/a.md', asking: true };

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(10_000);
  push.mockReset();
});

afterEach(() => {
  act(() => workRuns.reset());
  vi.useRealTimers();
  route.pathname = '/library/';
});

describe('the work card in the notice seat', () => {
  it('shows only observed facts while a check runs: the page, the count and the time, never a total', () => {
    const id = workRuns.begin({ folder: FOLDER, owner: 'launch:claude-acp', agent: 'Claude Agent', startedAt: 10_000 });
    renderCard();
    act(() => {
      for (const page of ['wiki/alpha', 'wiki/beta']) workRuns.observeRead(id, page);
      vi.advanceTimersByTime(12_000);
    });
    expect(screen.getByTestId('work-run-title')).toHaveTextContent('Checking the wiki');
    expect(screen.getByTestId('work-run-line')).toHaveTextContent(/^wiki\/beta$/);
    expect(screen.getByTestId('work-run-figures')).toHaveTextContent('2 pages read · 12s');
    expect(screen.getByRole('progressbar')).not.toHaveAttribute('aria-valuenow');
    expect(screen.getByTestId('work-run-card').textContent).not.toMatch(/%| of \d/);
  });

  it('stands down while the check is on its own stage', () => {
    workRuns.begin({ folder: FOLDER, owner: 'launch:claude-acp', agent: 'Claude Agent', startedAt: 10_000 });
    act(() => workRuns.enterStage(FOLDER));
    renderCard();
    expect(screen.queryByTestId('work-run-card')).not.toBeInTheDocument();
  });

  it('changes in place to the result and opens Check results from it', () => {
    const id = workRuns.begin({ folder: FOLDER, owner: 'launch:claude-acp', agent: 'Claude Agent', startedAt: 10_000 });
    renderCard();
    act(() => workRuns.finish(id, { kind: 'report', report: { itemCount: 3, pageCount: 2, payload: null } }, 40_000));
    expect(screen.getByTestId('work-run-title')).toHaveTextContent('3 findings on 2 pages');
    expect(screen.getByTestId('work-run-light')).toHaveAttribute('data-tint', 'found');
    fireEvent.click(screen.getByTestId('work-run-open-results'));
    expect(push).toHaveBeenCalledWith('/library/');
    expect(workRuns.read().door).toMatchObject({ runId: id, kind: 'results' });
    expect(workRuns.read().run).toMatchObject({ unseen: false, card: 'closed' });
  });

  it('carries a scheduled check with its counted documents, then changes in place to its result with one door', () => {
    act(() => workRuns.leaveFolder(FOLDER, 10_000));
    const key = workRuns.beginScheduled({ id: 'pass-7', roundId: 'r-pages', name: 'Pages still match', lane: 'documents', folder: FOLDER, startedAt: 10_000 });
    renderCard();
    act(() => {
      for (const path of ['wiki/alpha.md', 'wiki/beta.md', 'wiki/gamma.md']) workRuns.observeScheduledDocument(key, path, true);
      vi.advanceTimersByTime(5_000);
    });
    expect(screen.getByTestId('work-run-title')).toHaveTextContent('Pages still match · scheduled check');
    expect(screen.getByTestId('work-run-line')).toHaveTextContent(/^wiki\/gamma$/);
    expect(screen.getByTestId('work-run-figures')).toHaveTextContent('3 documents checked · 5s');
    const box = screen.getByTestId('work-run-card').className;

    act(() => workRuns.finishScheduled(key, { stopped: false, result: { outcome: 'held', checked: 3, stale: 0, written: 0, summary: '' } }, 16_000));
    expect(screen.getByTestId('work-run-card').className).toBe(box);
    expect(screen.getByTestId('work-run-title')).toHaveTextContent('No changes');
    expect(screen.getByTestId('work-run-detail')).toHaveTextContent('Pages still match checked 3 documents and changed nothing.');
    expect(screen.getByTestId('work-run-light')).toHaveAttribute('data-tint', 'success');
    fireEvent.click(screen.getByTestId('work-run-open-run'));
    expect(push).toHaveBeenCalledWith('/automations/?kind=documents&round=r-pages&run=pass-7');
  });

  it('names the latest of two runs, counts the other, and lists both in a centred dialog with one selected', () => {
    act(() => workRuns.leaveFolder(FOLDER, 10_000));
    const checkStop = vi.fn();
    const scheduledStop = vi.fn();
    const checkId = workRuns.begin({ folder: FOLDER, owner: 'launch:claude-acp', agent: 'Claude Agent', startedAt: 10_000 });
    workRuns.setStop(checkId, checkStop);
    const key = workRuns.beginScheduled({ id: 'pass-8', roundId: 'r-pages', name: 'Pages still match', lane: 'documents', folder: FOLDER, startedAt: 11_000 });
    workRuns.setScheduledStop(key, scheduledStop);
    renderCard();
    expect(screen.getByTestId('work-run-card')).toHaveAttribute('data-run-kind', 'scheduled');
    fireEvent.click(screen.getByTestId('work-run-more'));
    expect(screen.getByTestId('work-run-more')).toHaveTextContent('1 more running');

    const dialog = screen.getByRole('dialog');
    const tabs = within(dialog).getAllByRole('tab');
    expect(tabs.map((tab) => tab.getAttribute('aria-selected'))).toEqual(['true', 'false']);
    expect(within(dialog).getByTestId('work-runs-pane')).toHaveAttribute('data-run-key', key);
    fireEvent.click(tabs[1]!);
    expect(within(dialog).getByTestId('work-runs-pane')).toHaveAttribute('data-run-key', `check:${checkId}`);
    expect(within(dialog).getByTestId('work-runs-pane-title')).toHaveTextContent('Checking the wiki');

    fireEvent.click(tabs[0]!);
    fireEvent.click(within(dialog).getByTestId('work-runs-stop'));
    expect(scheduledStop).toHaveBeenCalledTimes(1);
    expect(checkStop).not.toHaveBeenCalled();
    expect(screen.getByTestId('work-run-card')).toHaveAttribute('data-run-kind', 'check');
  });

  it('hides for the rest of the run while the check keeps going', () => {
    workRuns.begin({ folder: FOLDER, owner: 'launch:claude-acp', agent: 'Claude Agent', startedAt: 10_000 });
    renderCard();
    fireEvent.click(screen.getByTestId('work-run-hide'));
    expect(workRuns.read().run).toMatchObject({ phase: 'running', card: 'hidden' });
    act(() => vi.runOnlyPendingTimers());
    expect(screen.queryByTestId('work-run-card')).not.toBeInTheDocument();
  });
});

describe('a mapping run on the work card', () => {
  it.each([
    ['en', 'Mapping the rest of the code', 'Request 2·48 of 120 abilities on the map (40%)·about 6 minutes left'],
    ['ko', '코드의 나머지를 지도에 올리는 중', '요청 2번째·기능 120개 중 48개(40%)·약 6분 남음'],
  ] as const)('shows the request, the count on the map, the time left and what the agent reads in %s', (locale, title, line) => {
    runningMapping();
    renderCard(locale);
    expect(screen.getByTestId('work-run-card')).toHaveAttribute('data-run-kind', 'mapping');
    expect(screen.getByTestId('work-run-title')).toHaveTextContent(title);
    expect(screen.getByTestId('work-run-figures').textContent).toBe(line);
    expect(screen.getByTestId('work-run-line')).toHaveTextContent('src/routes/checkout.ts');
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '40');
    expect(buttons()).toEqual(['work-run-stop', 'work-run-hide']);
  });

  it('never reads 100% while one ability is off the map', () => {
    openMappingFolder();
    workRuns.beginMapping({ folder: ROOT, folderName: 'launch', project: 'launch', agent: 'Claude Agent', figures: figures(1, 400), startedAt: 10_000 });
    renderCard();
    expect(screen.getByTestId('work-run-figures').textContent).toBe('Request 1·399 of 400 abilities on the map (99%)·about 4 minutes left');
  });

  it('stops the whole run from the card through the run key', () => {
    runningMapping();
    const stop = vi.fn();
    workRuns.setMappingStop(ROOT, stop);
    renderCard();
    fireEvent.click(screen.getByTestId('work-run-stop'));
    expect(stop).toHaveBeenCalledTimes(1);
    expect(mappingRun()).toMatchObject({ phase: 'stopping', stopReason: 'press' });
    expect(screen.getByTestId('work-run-title')).toHaveTextContent('Stopping Claude Agent');
  });

  it('stands down while the map conversation shows the run', () => {
    runningMapping();
    act(() => workRuns.enterMappingStage(ROOT));
    renderCard();
    expect(screen.queryByTestId('work-run-card')).not.toBeInTheDocument();
    act(() => workRuns.leaveMappingStage(ROOT));
    expect(screen.getByTestId('work-run-card')).toHaveAttribute('data-run-kind', 'mapping');
  });

  it('redraws the activity line at most once a second however often the agent reports', () => {
    runningMapping();
    renderCard();
    act(() => vi.advanceTimersByTime(1_000));
    const shown: string[] = [];
    for (let step = 0; step < 20; step += 1) {
      act(() => {
        workRuns.observeMappingWork(ROOT, { kind: 'reading', label: null, target: `src/file-${step}.ts`, asking: false }, 132_000 + step * 100);
        vi.advanceTimersByTime(100);
      });
      shown.push(screen.getByTestId('work-run-line').textContent ?? '');
    }
    const changes = shown.filter((line, index) => index > 0 && line !== shown[index - 1]).length;
    expect(changes).toBeLessThanOrEqual(2);
    act(() => vi.advanceTimersByTime(1_000));
    expect(screen.getByTestId('work-run-line')).toHaveTextContent('src/file-19.ts');
  });

  it.each([
    ['en', 'Waiting for your answer', 'Claude Agent asked before changing something. Mapping goes on when you answer.'],
    ['ko', '답을 기다리는 중', 'Claude Agent가 바꾸기 전에 물었어요. 답하면 이어서 진행해요.'],
  ] as const)('waits for an answer with Review and Hide in %s', (locale, title, body) => {
    runningMapping();
    workRuns.observeMappingWork(ROOT, ASKING, 140_000);
    renderCard(locale);
    expect(screen.getByTestId('work-run-title')).toHaveTextContent(title);
    expect(screen.getByTestId('work-run-detail')).toHaveTextContent(body);
    expect(buttons()).toEqual(['work-run-review', 'work-run-hide']);
    fireEvent.click(screen.getByTestId('work-run-hide'));
    expect(mappingRun()).toMatchObject({ phase: 'asking', card: 'hidden' });
  });

  it('opens the map conversation from Review with nothing sent, at once on the map', () => {
    route.pathname = '/topology/';
    runningMapping();
    workRuns.observeMappingWork(ROOT, ASKING, 140_000);
    const opened = vi.fn(() => true);
    const unsubscribe = subscribeAgentChatIntent(opened);
    renderCard();
    fireEvent.click(screen.getByTestId('work-run-review'));
    expect(opened).toHaveBeenCalledExactlyOnceWith(null, null);
    expect(push).not.toHaveBeenCalled();
    unsubscribe();
  });

  it('goes to the map from another screen and asks until its conversation opens, still with nothing sent', () => {
    runningMapping();
    workRuns.observeMappingWork(ROOT, ASKING, 140_000);
    renderCard();
    const notYet = vi.fn((_runtimeId: string | null, _prompt: string | null) => false);
    const offMap = subscribeAgentChatIntent(notYet);
    fireEvent.click(screen.getByTestId('work-run-review'));
    expect(push).toHaveBeenCalledWith('/topology/');
    offMap();
    const opened = vi.fn(() => true);
    const unsubscribe = subscribeAgentChatIntent(opened);
    act(() => vi.advanceTimersByTime(MAP_CONVERSATION_WAIT_MS));
    expect(opened).toHaveBeenCalledExactlyOnceWith(null, null);
    expect(notYet.mock.calls.every((call) => call[0] === null && call[1] === null)).toBe(true);
    unsubscribe();
  });

  it.each([
    ['en', 'Stopped: the last request put nothing new on the map', 'It stays at 48 of 120. The conversation shows what the agent did.'],
    ['ko', '멈췄어요: 마지막 요청에서 새로 올라간 것이 없어요', '120개 중 48개 그대로예요. 에이전트가 한 일은 대화에 있어요.'],
  ] as const)('says a request that put nothing new on the map stopped it, with Continue into the conversation, in %s', (locale, title, body) => {
    runningMapping();
    workRuns.endMappingBatch(ROOT, requestEnd(72, 250_000));
    renderCard(locale);
    expect(screen.getByTestId('work-run-title')).toHaveTextContent(title);
    expect(screen.getByTestId('work-run-detail')).toHaveTextContent(body);
    expect(buttons()).toEqual(['work-run-continue', 'work-run-close']);
    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
  });

  it.each([
    ['en', 'Every ability found in the code is on the map', '120 abilities, 3 requests, 6 minutes.'],
    ['ko', '코드에서 찾은 기능이 모두 지도에 올라갔어요', '기능 120개, 요청 3번, 6분 걸렸어요.'],
  ] as const)('says every ability is on the map once it finished, with Close, in %s', (locale, title, body) => {
    runningMapping();
    workRuns.endMappingBatch(ROOT, requestEnd(40, 250_000));
    workRuns.endMappingBatch(ROOT, requestEnd(0, 370_000));
    renderCard(locale);
    expect(screen.getByTestId('work-run-light')).toHaveAttribute('data-tint', 'finished');
    expect(screen.getByTestId('work-run-title')).toHaveTextContent(title);
    expect(screen.getByTestId('work-run-detail')).toHaveTextContent(body);
    expect(buttons()).toEqual(['work-run-close']);
    fireEvent.click(screen.getByTestId('work-run-close'));
    expect(mappingRun()).toBeNull();
  });

  it.each([
    {
      reason: 'a press',
      end: () => {
        workRuns.stopRun(MAPPING_KEY);
        workRuns.endMappingBatch(ROOT, requestEnd(54, 250_000, { kind: 'cancelled' }));
      },
      title: 'Stopped at 55%',
      body: 'What is already on the map stays. Continue picks up from here.',
      doors: ['work-run-continue', 'work-run-close'],
    },
    {
      reason: 'a message in the composer',
      end: () => workRuns.endMappingBatch(ROOT, { ...requestEnd(60, 250_000), draft: true }),
      title: 'Stopped at 50%',
      body: 'Stopped so you can ask. Continue picks up from here.',
      doors: ['work-run-continue', 'work-run-close'],
    },
    {
      reason: 'more requests than estimated',
      end: () => {
        for (const [index, uncovered] of Array.from({ length: 13 }, (_, step) => 70 - 2 * step).entries()) workRuns.endMappingBatch(ROOT, requestEnd(uncovered, 250_000 + index));
      },
      title: 'Stopped: this is taking more requests than estimated',
      body: '14 requests sent, 74 of 120 on the map.',
      doors: ['work-run-continue', 'work-run-close'],
    },
    {
      reason: 'an agent error',
      end: () => workRuns.endMappingBatch(ROOT, requestEnd(null, 250_000, { kind: 'failed', usageLimit: false })),
      title: 'Claude Agent ended early',
      body: '48 of 120 are on the map. What was already written stays.',
      doors: ['work-run-continue', 'work-run-close'],
    },
    {
      reason: 'a usage limit',
      end: () => workRuns.endMappingBatch(ROOT, requestEnd(null, 250_000, { kind: 'failed', usageLimit: true })),
      title: 'This agent has hit its usage limit',
      body: '48 of 120 are on the map. Continue when the limit resets, or pick another agent and continue.',
      doors: ['work-run-continue', 'work-run-close'],
    },
    {
      reason: 'the project note losing its line with more left than one request maps',
      end: () => workRuns.endMappingBatch(ROOT, requestEnd(null, 250_000)),
      title: 'Stopped: the project note no longer says what is left',
      body: 'It last said 48 of 120. Continue reads the code again.',
      doors: ['work-run-continue', 'work-run-close'],
    },
    {
      reason: 'a draft, read once another folder is open',
      end: () => {
        workRuns.endMappingBatch(ROOT, { ...requestEnd(60, 250_000), draft: true });
        workRuns.enterFolderRoot(OTHER_ROOT);
      },
      title: 'Stopped at 50%',
      body: 'Claude Agent was mapping launch. 60 of 120 are on the map there.',
      doors: ['work-run-close'],
    },
    {
      reason: 'a folder switch',
      end: () => {
        workRuns.enterFolderRoot(OTHER_ROOT);
        workRuns.endMappingBatch(ROOT, requestEnd(72, 251_000, { kind: 'cancelled' }));
      },
      title: 'Ended when you switched folders',
      body: 'Claude Agent was mapping launch. 48 of 120 are on the map there.',
      doors: ['work-run-close'],
    },
  ])('says why it stopped after $reason and offers what the spec lists', ({ end, title, body, doors }) => {
    runningMapping();
    end();
    renderCard();
    expect(screen.getByTestId('work-run-card')).toHaveAttribute('data-phase', 'stopped');
    expect(screen.getByTestId('work-run-title')).toHaveTextContent(title);
    expect(screen.getByTestId('work-run-detail')).toHaveTextContent(body);
    expect(buttons()).toEqual(doors);
  });

  it('opens the map conversation from Continue and leaves the restart to its row', () => {
    runningMapping();
    workRuns.endMappingBatch(ROOT, { ...requestEnd(60, 250_000), draft: true });
    const opened = vi.fn(() => true);
    const unsubscribe = subscribeAgentChatIntent(opened);
    renderCard();
    fireEvent.click(screen.getByTestId('work-run-continue'));
    expect(opened).toHaveBeenCalledExactlyOnceWith(null, null);
    expect(mappingRun()).toMatchObject({ phase: 'stopped', requestsSent: 2 });
    unsubscribe();
  });
});
