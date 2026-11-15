import { describe, expect, it } from 'vitest';

import type { RoundPassEntry } from '@/entities/library-round';

import { runsNewestFirst } from './run-order';

function run(id: string, endedAt: string): RoundPassEntry {
  return { v: 1, id, roundId: 'r', roundName: 'Review', kind: 'ontology', startedAt: endedAt, endedAt, outcome: 'held',
    checked: 0, stale: [], written: [], refused: [], called: [], agentTurns: 0, summary: '', trigger: 'clock' };
}

describe('runsNewestFirst', () => {
  it('orders by end time, not by the order the ledger appended them', () => {
    const appended = [run('yesterday', '2026-11-14T08:01:00Z'), run('morning', '2026-11-15T08:02:00Z'), run('dawn', '2026-11-15T06:00:00Z')];
    expect(runsNewestFirst(appended).map((entry) => entry.id)).toEqual(['morning', 'dawn', 'yesterday']);
  });

  it('puts the later-appended run first when two ended at the same moment', () => {
    const appended = [run('first', '2026-11-15T08:00:00Z'), run('second', '2026-11-15T08:00:00Z')];
    expect(runsNewestFirst(appended).map((entry) => entry.id)).toEqual(['second', 'first']);
  });
});
