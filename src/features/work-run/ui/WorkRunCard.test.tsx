import { act, fireEvent, render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import en from '../../../../messages/en.json';
import { workRuns } from '../model/work-run-store';
import { WorkRunCard } from './WorkRunCard';

const push = vi.fn();
vi.mock('@/i18n/navigation', () => ({ useRouter: () => ({ push }) }));
vi.mock('@/shared/lib/navigation/route-view-transition', () => ({ navigateWithViewTransition: (go: () => void) => go() }));

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
    workRuns.begin({ folder: FOLDER, agent: 'Claude Agent', startedAt: 10_000 });
    renderCard();
    act(() => {
      for (const page of ['wiki/alpha', 'wiki/beta']) workRuns.observeRead(page);
      vi.advanceTimersByTime(12_000);
    });
    expect(screen.getByTestId('work-run-title')).toHaveTextContent('Checking the wiki');
    expect(screen.getByTestId('work-run-line')).toHaveTextContent('Claude Agent · reading wiki/beta');
    expect(screen.getByTestId('work-run-figures')).toHaveTextContent('2 pages read · 12s');
    expect(screen.getByRole('progressbar')).not.toHaveAttribute('aria-valuenow');
    expect(screen.getByTestId('work-run-card').textContent).not.toMatch(/%| of \d/);
  });

  it('stands down while the check is on its own stage', () => {
    workRuns.begin({ folder: FOLDER, agent: 'Claude Agent', startedAt: 10_000 });
    act(() => workRuns.enterStage(FOLDER));
    renderCard();
    expect(screen.queryByTestId('work-run-card')).not.toBeInTheDocument();
  });

  it('changes in place to the result and opens Check results from it', () => {
    const id = workRuns.begin({ folder: FOLDER, agent: 'Claude Agent', startedAt: 10_000 });
    renderCard();
    act(() => workRuns.finish(id, { kind: 'report', report: { itemCount: 3, pageCount: 2, payload: null } }, 40_000));
    expect(screen.getByTestId('work-run-title')).toHaveTextContent('Wiki check finished');
    expect(screen.getByTestId('work-run-detail')).toHaveTextContent('3 findings on 2 pages. Check results lists them.');
    fireEvent.click(screen.getByTestId('work-run-open-results'));
    expect(push).toHaveBeenCalledWith('/library/');
    expect(workRuns.read().door).toMatchObject({ runId: id, kind: 'results' });
    expect(workRuns.read().run).toMatchObject({ unseen: false, card: 'closed' });
  });

  it('hides for the rest of the run while the check keeps going', () => {
    workRuns.begin({ folder: FOLDER, agent: 'Claude Agent', startedAt: 10_000 });
    renderCard();
    fireEvent.click(screen.getByTestId('work-run-hide'));
    expect(workRuns.read().run).toMatchObject({ phase: 'running', card: 'hidden' });
    act(() => vi.runOnlyPendingTimers());
    expect(screen.queryByTestId('work-run-card')).not.toBeInTheDocument();
  });
});
