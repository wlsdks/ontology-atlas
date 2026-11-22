import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import en from '../../../../messages/en.json';
import { workRuns } from '../model/work-run-store';
import { WorkRunCard } from './WorkRunCard';

const push = vi.fn();
vi.mock('@/i18n/navigation', () => ({ useRouter: () => ({ push }) }));
vi.mock('@/shared/lib/navigation/route-view-transition', () => ({ navigateWithViewTransition: (_href: string, go: () => void) => go() }));

const FOLDER = 'local:launch';

function renderCard() {
  return render(
    <NextIntlClientProvider locale="en" messages={en}>
      <WorkRunCard />
    </NextIntlClientProvider>,
  );
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(10_000);
  push.mockReset();
});

afterEach(() => {
  act(() => workRuns.reset());
  vi.useRealTimers();
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
