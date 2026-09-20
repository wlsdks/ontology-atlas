import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, describe, expect, it, vi } from 'vitest';

import en from '../../../../messages/en.json';
import type { RoundPassEntry, RoundRecord } from '@/entities/library-round';
import type { RoundsRunnerValue } from '@/features/library-rounds';

import { AutomationsPage } from './AutomationsPage';

const mocks = vi.hoisted(() => ({ push: vi.fn() }));
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

function renderPage(value = runner(), onOpenDocumentSchedule = vi.fn()) {
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

    expect(screen.getByTestId('automations-last-run')).toHaveTextContent('reviewed');
    expect(screen.getByTestId('automations-last-run')).toHaveTextContent('one source binding gap');
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
});
