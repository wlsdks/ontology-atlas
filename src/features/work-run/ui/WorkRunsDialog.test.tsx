import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import en from '../../../../messages/en.json';
import ko from '../../../../messages/ko.json';
import { subscribeAgentChatIntent } from '@/shared/lib/agent-chat/agent-chat-intent';
import type { MappingFigures } from '../model/mapping-run';
import { seatRuns } from '../model/use-work-run';
import { workRuns } from '../model/work-run-store';
import { WorkRunsDialog } from './WorkRunsDialog';

vi.mock('@/i18n/navigation', () => ({ useRouter: () => ({ push: vi.fn() }), usePathname: () => '/topology/' }));

const FOLDER = 'local:launch';
const KEY = `mapping:${FOLDER}`;
const CATALOGUES = { en, ko } as const;

const figures = (uncovered: number, total = 120): MappingFigures => ({
  widest: { abilitiesUncovered: uncovered, abilitiesTotal: total },
  sum: { abilitiesUncovered: uncovered, abilitiesTotal: total },
});

function plantRunning() {
  workRuns.leaveFolder(FOLDER, 0);
  workRuns.beginMapping({ folder: FOLDER, folderName: 'launch', agent: 'Claude Agent', figures: figures(96), startedAt: 10_000 });
  workRuns.endMappingBatch(FOLDER, { outcome: { kind: 'completed' }, figures: figures(72), draft: false, at: 130_000 });
  workRuns.observeMappingWork(FOLDER, { kind: 'reading', label: null, target: 'src/routes/checkout.ts', asking: false }, 131_000);
}

function renderList(locale: keyof typeof CATALOGUES = 'en') {
  render(
    <NextIntlClientProvider locale={locale} messages={CATALOGUES[locale]}>
      <WorkRunsDialog open runs={seatRuns(workRuns.read())} onClose={() => {}} />
    </NextIntlClientProvider>,
  );
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(200_000);
});

afterEach(() => {
  act(() => workRuns.reset());
  vi.useRealTimers();
});

describe('a mapping run in the Runs list', () => {
  it.each([
    ['en', 'Mapping the rest of the code', 'Request 2·48 of 120 abilities on the map (40%)·about 6 minutes left'],
    ['ko', '코드의 나머지를 지도에 올리는 중', '요청 2번째·기능 120개 중 48개(40%)·약 6분 남음'],
  ] as const)('lists the run with its count on the map, what the agent reads and Stop in %s', (locale, title, figuresLine) => {
    plantRunning();
    renderList(locale);
    const dialog = screen.getByRole('dialog');
    const tab = within(dialog).getByRole('tab');
    expect(tab).toHaveTextContent(title);
    expect(tab).toHaveTextContent('48');
    expect(within(dialog).getByTestId('work-runs-pane')).toHaveAttribute('data-run-key', KEY);
    expect(within(dialog).getByTestId('work-runs-pane-title')).toHaveTextContent(title);
    expect(within(dialog).getByTestId('work-runs-pane-line')).toHaveTextContent('src/routes/checkout.ts');
    expect(within(dialog).getByTestId('work-runs-pane-figures').textContent).toBe(figuresLine);
    expect(within(dialog).getByRole('progressbar')).toHaveAttribute('aria-valuenow', '40');

    const stop = vi.fn();
    workRuns.setMappingStop(FOLDER, stop);
    fireEvent.click(within(dialog).getByTestId('work-runs-stop'));
    expect(stop).toHaveBeenCalledTimes(1);
    expect(workRuns.read().runs.get(KEY)?.run.phase).toBe('stopping');
  });

  it('says why a stopped run ended and continues in the map conversation with nothing sent', () => {
    plantRunning();
    workRuns.endMappingBatch(FOLDER, { outcome: { kind: 'completed' }, figures: figures(72), draft: false, at: 250_000 });
    renderList();
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByTestId('work-runs-pane-title')).toHaveTextContent('Stopped: the last request put nothing new on the map');
    expect(within(dialog).getByTestId('work-runs-pane-line')).toHaveTextContent('It stays at 48 of 120.');
    expect(within(dialog).queryByRole('progressbar')).not.toBeInTheDocument();
    const opened = vi.fn(() => true);
    const unsubscribe = subscribeAgentChatIntent(opened);
    fireEvent.click(within(dialog).getByTestId('work-runs-open'));
    expect(within(dialog).getByTestId('work-runs-open')).toHaveTextContent('Continue');
    expect(opened).toHaveBeenCalledExactlyOnceWith(null, null);
    unsubscribe();
    fireEvent.click(within(dialog).getByTestId('work-runs-close-run'));
    expect(workRuns.read().runs.has(KEY)).toBe(false);
  });
});
