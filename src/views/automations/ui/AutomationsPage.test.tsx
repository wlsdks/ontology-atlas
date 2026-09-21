import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, describe, expect, it, vi } from 'vitest';

import en from '../../../../messages/en.json';
import type { RoundPassEntry, RoundRecord } from '@/entities/library-round';
import type { RoundsRunnerValue } from '@/features/library-rounds';

import { AutomationsPage } from './AutomationsPage';

const mocks = vi.hoisted(() => ({ push: vi.fn(), open: vi.fn() }));
vi.mock('@/shared/lib/tauri-vault-fs', () => ({ isTauriVaultRuntime: () => true }));
vi.mock('@/entities/vault-session', () => ({ useLocalVault: () => ({ status: 'idle', open: mocks.open }) }));
let search = '';

vi.mock('@/i18n/navigation', () => ({
  useRouter: () => ({ push: mocks.push }),
  Link: ({ href, children, ...props }: { href: string; children: React.ReactNode }) => <a href={href} {...props}>{children}</a>,
}));

vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams(search),
}));

function runner(overrides: Partial<RoundsRunnerValue> = {}): RoundsRunnerValue {
  return {
    storeStatus: 'ok',
    state: { v: 1, rounds: [] },
    rounds: [],
    ledger: [],
    running: null,
    agentReady: true,
    agentLabel: 'Claude',
    connectors: [],
    lastTickAt: null,
    revision: 1,
    save: vi.fn(async () => ({ ok: true, startedNow: false })),
    remove: vi.fn(async () => true),
    setEnabled: vi.fn(async () => true),
    runNow: vi.fn(),
    refresh: vi.fn(async () => undefined),
    ...overrides,
  };
}

function renderPage(value: RoundsRunnerValue | null = runner(), onOpenDocumentSchedule = vi.fn()) {
  return render(
    <NextIntlClientProvider locale="en" messages={en}>
      <AutomationsPage runner={value} onOpenDocumentSchedule={onOpenDocumentSchedule} />
    </NextIntlClientProvider>,
  );
}

afterEach(() => {
  search = '';
  mocks.push.mockClear();
});

describe('Automations manager', () => {
  it('opens a read-only ontology schedule from the manager and saves an ontology round', async () => {
    const value = runner();
    renderPage(value);

    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(en.automations.title);
    expect(screen.getByTestId('automations-tab-ontology')).toHaveAttribute('aria-selected', 'true');
    fireEvent.click(screen.getByTestId('automations-new'));
    expect(screen.getByRole('heading', { name: en.automations.ontology.sheet.title })).toBeInTheDocument();

    fireEvent.click(screen.getByTestId('ontology-automation-allow'));
    await waitFor(() => expect(value.save).toHaveBeenCalledTimes(1));
    expect(value.save).toHaveBeenCalledWith(expect.objectContaining({ kind: 'ontology', cadence: { every: '6h' }, enabled: true }));
  });

  it.each([[10, 'Every 10 minutes'], [120, 'Every 2 hours'], [720, 'Every 12 hours']] as const)('shows the stored interval of %i minutes in the schedule row', (minutes, label) => {
    search = 'kind=documents';
    const round: RoundRecord = { id: 'interval', kind: 'consistency', name: 'Interval check', enabled: false,
      cadence: { everyMinutes: minutes }, createdAt: '2026-09-20T08:00:00Z', nextDueAt: '2026-09-21T14:00:00Z' };
    renderPage(runner({ rounds: [round] }));
    expect(screen.getByTestId('automation-interval')).toHaveTextContent(label);
  });

  it('starts a fresh ontology draft after cancellation', async () => {
    renderPage();
    fireEvent.click(screen.getByTestId('automations-new'));
    fireEvent.change(screen.getByTestId('ontology-automation-name'), { target: { value: 'Discard this name' } });
    fireEvent.change(screen.getByTestId('ontology-automation-focus'), { target: { value: 'Discard this scope' } });
    fireEvent.click(screen.getByRole('radio', { name: 'Daily' }));
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(screen.queryByTestId('ontology-automation-sheet')).not.toBeInTheDocument());
    fireEvent.click(screen.getByTestId('automations-new'));
    expect(screen.getByTestId('ontology-automation-name')).toHaveValue('');
    expect(screen.getByTestId('ontology-automation-focus')).toHaveValue('');
    expect(screen.getByRole('radio', { name: 'Every 6 hours' })).toHaveAttribute('aria-checked', 'true');
  });

  it('shows a completed ontology review as a review result with its read receipt', () => {
    const round: RoundRecord = {
      id: 'ontology-1',
      name: 'Source gaps',
      kind: 'ontology',
      cadence: { every: '6h' },
      enabled: true,
      query: 'source binding gaps',
      createdAt: '2026-09-20T08:00:00.000Z',
      nextDueAt: '2026-09-20T14:00:00.000Z',
    };
    const entry: RoundPassEntry = {
      v: 1,
      id: 'pass-1',
      roundId: round.id,
      roundName: round.name,
      kind: 'ontology',
      startedAt: '2026-09-20T08:00:00.000Z',
      endedAt: '2026-09-20T08:01:00.000Z',
      outcome: 'reviewed',
      checked: 0,
      stale: [],
      written: [],
      refused: [],
      called: ['mcp__atlas-vault__query_ontology'],
      agentTurns: 1,
      summary: 'Review only · one source binding gap',
      trigger: 'clock',
    };
    renderPage(runner({ rounds: [round], state: { v: 1, rounds: [round] }, ledger: [entry] }));

    expect(screen.getByTestId('automations-last-run')).toHaveTextContent(en.automations.outcome.reviewed);
    expect(screen.getByTestId('automations-last-run')).toHaveTextContent('one source binding gap');
    fireEvent.click(screen.getByRole('button', { name: 'Tool activity' }));
    expect(screen.getByTestId('automations-last-run')).toHaveTextContent('query_ontology');
  });

  it('keeps the document lane as a real tabpanel and opens the existing document round sheet', () => {
    search = 'kind=documents';
    const openDocumentSchedule = vi.fn();
    renderPage(runner(), openDocumentSchedule);

    expect(screen.getByTestId('automations-tab-documents')).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tabpanel')).toHaveAttribute('id', 'automations-tabpanel-documents');
    fireEvent.click(screen.getByTestId('automations-new'));
    expect(openDocumentSchedule).toHaveBeenCalledTimes(1);
  });
  it('opens the folder picker in the app without offering to download the app again', () => {
    renderPage(runner({ storeStatus: 'no-vault' }));
    fireEvent.click(screen.getByTestId('automations-open-vault'));
    expect(mocks.open).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('link', { name: en.automations.getApp })).not.toBeInTheDocument();
    expect(screen.queryByTestId('automations-new')).not.toBeInTheDocument();
  });

  it('keeps loading and malformed stores out of schedule actions, with a retry', () => {
    const value = runner({ storeStatus: 'loading' });
    const view = renderPage(value);
    expect(screen.getByRole('status')).toHaveAttribute('aria-busy', 'true');
    expect(screen.queryByTestId('automations-new')).not.toBeInTheDocument();
    view.unmount();
    const failed = runner({ storeStatus: 'malformed' });
    renderPage(failed);
    fireEvent.click(screen.getByRole('button', { name: en.automations.retry }));
    expect(failed.refresh).toHaveBeenCalledTimes(1);
  });

  it('selects and collapses schedule details, and targets actions to the selected schedule', () => {
    const first: RoundRecord = { id: 'first', kind: 'ontology', name: 'First review', enabled: true,
      cadence: { every: '6h' }, createdAt: '2026-09-20T08:00:00Z', nextDueAt: '2026-09-21T14:00:00Z' };
    const second: RoundRecord = { ...first, id: 'second', name: 'Second review', enabled: false };
    const value = runner({ rounds: [first, second] });
    renderPage(value);
    const firstRow = screen.getByTestId('automation-first');
    const secondRow = screen.getByTestId('automation-second');
    expect(firstRow).toHaveAttribute('aria-expanded', 'true');
    expect(secondRow).toHaveTextContent(en.automations.noNextRun);
    fireEvent.click(secondRow);
    expect(firstRow).toHaveAttribute('aria-expanded', 'false');
    expect(secondRow).toHaveAttribute('aria-expanded', 'true');
    fireEvent.click(screen.getByRole('button', { name: en.automations.runNow }));
    expect(value.runNow).toHaveBeenCalledWith('second');
    fireEvent.click(screen.getByRole('button', { name: en.automations.resume }));
    expect(value.setEnabled).toHaveBeenCalledWith('second', true);
    fireEvent.click(secondRow);
    expect(screen.queryByRole('button', { name: en.automations.runNow })).not.toBeInTheDocument();
  });

  it('keeps the newest result visible while older results are available on demand', async () => {
    const round: RoundRecord = { id: 'history', kind: 'ontology', name: 'History', enabled: true,
      cadence: { every: '6h' }, createdAt: '2026-09-20T08:00:00Z', nextDueAt: '2026-09-21T14:00:00Z' };
    const entry: RoundPassEntry = { v: 1, id: 'old', roundId: round.id, roundName: round.name,
      kind: 'ontology', startedAt: '2026-09-20T08:00:00Z', endedAt: '2026-09-20T08:01:00Z',
      outcome: 'reviewed', checked: 0, stale: [], written: [], refused: [], called: [], agentTurns: 1,
      summary: 'Older finding', trigger: 'clock' };
    renderPage(runner({ rounds: [round], ledger: [entry, { ...entry, id: 'new', summary: 'Latest finding' }] }));
    expect(within(screen.getByTestId('automations-last-run')).getByText('Latest finding')).toBeVisible();
    expect(screen.queryByText('Older finding')).not.toBeInTheDocument();
    fireEvent.click(screen.getByText('Earlier runs · 1'));
    expect(await screen.findByText('Older finding')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Earlier runs · 1' })).toHaveAttribute('aria-expanded', 'true');
  });

  it('requires confirmation to remove the selected schedule and reports failed changes', async () => {
    const round: RoundRecord = { id: 'confirmed', kind: 'ontology', name: 'Confirm me', enabled: true,
      cadence: { every: '6h' }, createdAt: '2026-09-20T08:00:00Z', nextDueAt: '2026-09-21T14:00:00Z' };
    const value = runner({ rounds: [round], remove: vi.fn(async () => false) });
    renderPage(value);
    fireEvent.click(screen.getByTestId('automations-remove'));
    expect(value.remove).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: en.automations.cancel }));
    expect(screen.queryByTestId('automations-confirm-remove')).not.toBeInTheDocument();
    expect(value.remove).not.toHaveBeenCalled();
    fireEvent.click(screen.getByTestId('automations-remove'));
    fireEvent.click(screen.getByTestId('automations-confirm-remove'));
    await waitFor(() => expect(value.remove).toHaveBeenCalledWith(round.id));
    expect(await screen.findByRole('alert')).toHaveTextContent(en.automations.changeFailed);
  });

});
