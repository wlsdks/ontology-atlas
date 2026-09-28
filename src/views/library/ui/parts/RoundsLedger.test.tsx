import { render, screen, within } from '@testing-library/react';
import { NextIntlClientProvider, createTranslator } from 'next-intl';
import { describe, expect, it, vi } from 'vitest';

import type { RoundPassEntry } from '@/entities/library-round';

import en from '../../../../../messages/en.json';
import { RoundsLedger, type RunningPass } from './RoundsLedger';

vi.mock('@/i18n/navigation', () => ({
  Link: ({ href, children, ...props }: { href: string; children: React.ReactNode }) => <a href={href} {...props}>{children}</a>,
}));

function entry(overrides: Partial<RoundPassEntry> = {}): RoundPassEntry {
  return {
    v: 1,
    id: 'p1',
    roundId: 'r1',
    roundName: 'Pages still match',
    kind: 'consistency',
    startedAt: '2026-09-21T09:00:00.000Z',
    endedAt: '2026-09-21T09:00:04.000Z',
    outcome: 'stale',
    checked: 4,
    stale: ['wiki/meeting-notes-summary'],
    written: [],
    refused: [],
    called: [],
    agentTurns: 0,
    summary: '',
    trigger: 'clock',
    ...overrides,
  };
}

const RUNNING: RunningPass = {
  roundId: 'r1',
  roundName: 'Pages still match',
  startedAt: new Date(Date.now() - 12_000).toISOString(),
  phase: 'checking',
};

function draw(props: Partial<Parameters<typeof RoundsLedger>[0]> = {}) {
  return render(
    <NextIntlClientProvider locale="en" messages={en}>
      <RoundsLedger entries={[]} locale="en" onOpenPage={() => {}} nextDueLabel="01:00" allPaused={false} {...props} />
    </NextIntlClientProvider>,
  );
}

describe('the ledger', () => {
  it('says what stopped a failed pass and what to do next, instead of the raw error', () => {
    draw({ entries: [entry({ id: 'err', outcome: 'failed', checked: 0, stale: [], summary: 'No such file or directory (os error 2)' })] });
    const card = screen.getByTestId('library-rounds-pass-err');
    const ledger = createTranslator({ locale: 'en', messages: en, namespace: 'library.rounds.ledger' });
    expect(card).toHaveTextContent(ledger('failedError', { detail: 'No such file or directory (os error 2)' }));
    expect(card).not.toHaveTextContent(ledger('checked', { count: 0 }));
  });

  it('gives a pass that had no agent the way to the Agents screen its note names', () => {
    draw({ entries: [entry({ id: 'solo', note: 'no-agent' })] });
    const card = screen.getByTestId('library-rounds-pass-solo');
    expect(card).toHaveTextContent(en.library.rounds.ledger.noAgent);
    expect(within(card).getByRole('link', { name: en.library.rounds.ledger.openAgents })).toHaveAttribute('href', '/agents/');
  });

  it('draws the pass in flight and drops the empty sentence that contradicted it', () => {
    /*
     * Measured in the browser, 2026-09-21: the header said "running now · <name>" while this
     * column still said "No pass yet. The first one runs at 01:00." — one screen, two lines,
     * opposite claims.
     */
    const { rerender } = draw();
    expect(screen.getByTestId('library-rounds-ledger-empty')).toBeInTheDocument();

    rerender(
      <NextIntlClientProvider locale="en" messages={en}>
        <RoundsLedger entries={[]} locale="en" onOpenPage={() => {}} running={RUNNING} nextDueLabel="01:00" allPaused={false} />
      </NextIntlClientProvider>,
    );
    expect(screen.queryByTestId('library-rounds-ledger-empty')).toBeNull();
    const live = screen.getByTestId('library-rounds-ledger-live');
    expect(live).toHaveTextContent('Pages still match');
    expect(live).toHaveTextContent('Checking documents');
    expect(live.querySelector('[data-phase]')).toHaveAttribute('data-phase', 'checking');
  });

  it('the live row names the phase the pass is in', () => {
    draw({ running: { ...RUNNING, phase: 'agent' } });
    expect(screen.getByTestId('library-rounds-ledger-live')).toHaveTextContent('Agent turn in progress');
  });

  it('names a page by its title, and falls back to the slug when the page is gone', () => {
    draw({
      entries: [entry()],
      titleFor: (slug) => (slug === 'wiki/meeting-notes-summary' ? 'Release readiness sync notes' : slug),
    });
    expect(screen.getByRole('button', { name: 'Open Release readiness sync notes in Wiki' })).toBeInTheDocument();

    draw({ entries: [entry({ id: 'p2' })] });
    expect(screen.getByRole('button', { name: 'Open meeting-notes-summary in Wiki' })).toBeInTheDocument();
  });

  it('says a pass was cut short by a press rather than by a fault', () => {
    draw({ entries: [entry({ outcome: 'failed', note: 'stopped' })] });
    expect(screen.getByTestId('library-rounds-ledger')).toHaveTextContent('You removed or paused this round while it was running');
  });
});
