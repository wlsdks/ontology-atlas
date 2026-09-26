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
  it.each(['ontology', 'documents'])('a folder without a schedule file can create its first %s schedule', (lane) => {
    search = `kind=${lane}`;
    const openDocuments = vi.fn();
    const value = runner({ storeStatus: 'missing' });
    renderPage(value, openDocuments);
    expect(screen.getByTestId('automations')).toHaveAttribute('data-automations-state', 'ready');
    expect(screen.queryByText(en.automations.malformedTitle)).not.toBeInTheDocument();
    fireEvent.click(screen.getByTestId('automations-new'));
    if (lane === 'ontology') expect(screen.getByTestId('ontology-automation-sheet')).toBeInTheDocument();
    else expect(openDocuments).toHaveBeenCalledOnce();
    expect(value.save).not.toHaveBeenCalled();
  });

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
    /* The same unit + rail picker as the documents sheet; every six hours is the rail's 6h detent. */
    fireEvent.click(screen.getByRole('radio', { name: 'Day' }));
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(screen.queryByTestId('ontology-automation-sheet')).not.toBeInTheDocument());
    fireEvent.click(screen.getByTestId('automations-new'));
    expect(screen.getByTestId('ontology-automation-name')).toHaveValue(en.automations.ontology.defaultName);
    expect(screen.getByTestId('ontology-automation-focus')).toHaveValue('');
    expect(screen.getByRole('radio', { name: 'Hours' })).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByRole('slider')).toHaveAttribute('aria-valuetext', 'every 6 hours');
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

    // The row header states the latest outcome; the expanded report leads with its summary.
    expect(screen.getByTestId('automation-ontology-1')).toHaveTextContent(en.automations.outcome.reviewed);
    expect(screen.getByTestId('automations-last-run')).not.toHaveTextContent(en.automations.outcome.reviewed);
    expect(screen.getByTestId('automations-last-run')).toHaveTextContent('one source binding gap');
    fireEvent.click(screen.getByRole('button', { name: 'Tool activity' }));
    expect(screen.getByTestId('automations-last-run')).toHaveTextContent('query_ontology');
  });

  /*
   * Owner review, 2026-09-26: the empty lane said "no schedules yet" in its title, then again as
   * "schedules appear here" in the list body and "results appear here after the first run" at its
   * foot. The list under the title is its frame now: title, count and column heads.
   */
  it.each(['ontology', 'documents'] as const)('says an empty %s lane once, over a list that is only its frame', (lane) => {
    search = `kind=${lane}`;
    renderPage(runner({ storeStatus: 'missing' }));
    const preview = en.automations[lane].preview;
    const list = screen.getByRole('complementary', { name: preview.title });
    expect(list.textContent).toBe(`${preview.title}0${preview.name}${preview.cadence}${preview.next}`);
    expect(screen.getAllByText(en.automations[lane].emptyTitle)).toHaveLength(1);
  });

  it('keeps the list a bare frame where no schedule can exist yet, without a count', () => {
    renderPage(runner({ storeStatus: 'no-vault' }));
    const preview = en.automations.ontology.preview;
    const list = screen.getByRole('complementary', { name: preview.title });
    expect(list.textContent).toBe(`${preview.title}${preview.name}${preview.cadence}${preview.next}`);
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

  it('says why a document pass redrafted nothing, in the sentence the Library ledger uses', () => {
    search = 'kind=documents';
    const round: RoundRecord = { id: 'docs', kind: 'consistency', name: 'Pages match sources', enabled: true, onStale: 'redraft',
      cadence: { every: 'hour' }, createdAt: '2026-09-25T00:00:00Z', nextDueAt: '2026-09-26T01:00:00Z' };
    const entry: RoundPassEntry = { v: 1, id: 'no-agent', roundId: round.id, roundName: round.name, kind: 'consistency',
      startedAt: '2026-09-25T15:08:00Z', endedAt: '2026-09-25T15:08:01Z', outcome: 'stale', checked: 4, stale: ['wiki/budget'],
      written: [], refused: [], called: [], agentTurns: 0, summary: '', trigger: 'manual', note: 'no-agent' };
    renderPage(runner({ rounds: [round], ledger: [entry] }));
    const last = screen.getByTestId('automations-last-run');
    expect(last).toHaveTextContent('Checked 4 documents.');
    expect(within(last).getByText(en.library.rounds.ledger.noAgent)).toHaveAttribute('data-run-note', 'no-agent');
  });

  it('leads a review that never ran with the reason, and never with a sentence claiming it finished', () => {
    const round: RoundRecord = { id: 'review', kind: 'ontology', name: 'Ontology refinement', enabled: true,
      cadence: { every: '6h' }, createdAt: '2026-09-25T00:00:00Z', nextDueAt: '2026-09-26T06:00:00Z' };
    const base: RoundPassEntry = { v: 1, id: 'stopped', roundId: round.id, roundName: round.name, kind: 'ontology',
      startedAt: '2026-09-25T10:00:00Z', endedAt: '2026-09-25T10:00:30Z', outcome: 'failed', checked: 0, stale: [],
      written: [], refused: [], called: [], agentTurns: 1, summary: '', trigger: 'manual', note: 'stopped' };
    const ledger: RoundPassEntry[] = [
      base,
      { ...base, id: 'turn-failed', note: undefined, endedAt: '2026-09-25T12:00:00Z' },
      { ...base, id: 'no-agent', note: 'no-agent', agentTurns: 0, endedAt: '2026-09-25T14:00:00Z' },
    ];
    renderPage(runner({ rounds: [round], ledger }));
    const last = screen.getByTestId('automations-last-run');
    expect(last).toHaveTextContent(en.automations.noAgentReview);
    expect(last).not.toHaveTextContent(en.automations.noSummary);
    fireEvent.click(screen.getByText('Earlier runs · 2'));
    const history = screen.getByTestId('automations-history');
    expect(within(history).getByText(en.automations.failedNoResult)).toBeInTheDocument();
    expect(within(history).getByText(en.library.rounds.ledger.stopped)).toHaveAttribute('data-run-note', 'stopped');
    expect(history).not.toHaveTextContent('completed');
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
