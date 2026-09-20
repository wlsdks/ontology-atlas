import { describe, expect, it } from 'vitest';

import type { ConsistencyPassResult } from './consistency-pass';
import { passLedgerFacts } from './pass-outcome';

function check(overrides: Partial<ConsistencyPassResult> = {}): ConsistencyPassResult {
  return { checked: 14, stalePages: [], staleSources: [], offTemplate: [], notCompiled: 3, ...overrides };
}

describe('what a pass writes into the ledger', () => {
  it('reads a consistency pass from its own check', () => {
    expect(passLedgerFacts({ kind: 'consistency', check: check({ stalePages: ['wiki/plan'] }), failed: false, written: [], refused: [] }))
      .toEqual({ outcome: 'stale', checked: 14, stale: ['wiki/plan'] });
    expect(passLedgerFacts({ kind: 'consistency', check: check(), failed: false, written: [], refused: [] }))
      .toEqual({ outcome: 'held', checked: 14, stale: [] });
    expect(passLedgerFacts({ kind: 'consistency', check: check({ stalePages: ['wiki/plan'] }), failed: false, written: ['wiki/plan.md'], refused: [] }).outcome)
      .toBe('redrafted');
  });

  it('never lends a service pass the consistency check it did not run', () => {
    // The round re-read four documents and changed nothing: "held", not "stale · 1" about a
    // page it never looked at.
    expect(passLedgerFacts({ kind: 'service', check: null, refreshed: 4, failed: false, written: [], refused: [] }))
      .toEqual({ outcome: 'held', checked: 4, stale: [] });
    expect(passLedgerFacts({ kind: 'service', check: null, refreshed: 4, failed: false, written: ['sources/a.md'], refused: [] }))
      .toEqual({ outcome: 'redrafted', checked: 4, stale: [] });
    expect(passLedgerFacts({ kind: 'service', check: null, refreshed: 0, failed: false, written: [], refused: ['mcp__notion__create_page'] }).outcome)
      .toBe('refused');
    expect(passLedgerFacts({ kind: 'service', check: null, failed: true, written: [], refused: [] }))
      .toEqual({ outcome: 'failed', checked: 0, stale: [] });
  });

  it('keeps a stray check out of a service row even when one is handed over', () => {
    expect(passLedgerFacts({ kind: 'service', check: check({ stalePages: ['wiki/plan'] }), refreshed: 2, failed: false, written: [], refused: [] }))
      .toEqual({ outcome: 'held', checked: 2, stale: [] });
  });
});
