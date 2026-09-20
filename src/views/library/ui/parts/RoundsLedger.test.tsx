import { render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { describe, expect, it } from 'vitest';

import type { RoundPassEntry } from '@/entities/library-round';

import en from '../../../../../messages/en.json';
import { RoundsLedger, type RunningPass } from './RoundsLedger';

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
