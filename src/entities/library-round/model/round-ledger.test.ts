import { describe, expect, it } from 'vitest';

import {
  ROUNDS_LEDGER_CAP,
  type RoundPassEntry,
  appendToLedgerText,
  createMemoryRoundLedger,
  parseRoundLedger,
  parseRoundPassEntry,
} from './round-ledger';

function pass(overrides: Partial<RoundPassEntry> = {}): RoundPassEntry {
  return {
    v: 1,
    id: 'p1',
    roundId: 'r1',
    roundName: 'Pages still match',
    kind: 'consistency',
    startedAt: '2026-09-17T01:00:00.000Z',
    endedAt: '2026-09-17T01:00:04.000Z',
    outcome: 'held',
    checked: 14,
    stale: [],
    written: [],
    refused: [],
    called: [],
    agentTurns: 0,
    summary: '14 pages checked · all held',
    trigger: 'clock',
    ...overrides,
  };
}

describe('round ledger', () => {
  it('appends one line per pass and reads them back oldest first', async () => {
    const ledger = createMemoryRoundLedger();
    await ledger.append(pass({ id: 'p1' }));
    await ledger.append(pass({ id: 'p2', outcome: 'stale', stale: ['payments-api'] }));
    const entries = await ledger.read();
    expect(entries.map((entry) => entry.id)).toEqual(['p1', 'p2']);
    expect(entries[1].stale).toEqual(['payments-api']);
    expect(ledger.text()?.endsWith('\n')).toBe(true);
  });

  it('keeps the newest entries when the cap is reached', () => {
    let text = '';
    for (let i = 0; i < ROUNDS_LEDGER_CAP + 5; i += 1) {
      text = appendToLedgerText(text, pass({ id: `p${i}` }));
    }
    const entries = parseRoundLedger(text);
    expect(entries).toHaveLength(ROUNDS_LEDGER_CAP);
    expect(entries[0].id).toBe('p5');
    expect(entries.at(-1)?.id).toBe(`p${ROUNDS_LEDGER_CAP + 4}`);
  });

  it('skips a line it cannot read and keeps the rest', () => {
    const text = [JSON.stringify(pass({ id: 'a' })), '{ broken', JSON.stringify(pass({ id: 'b' }))].join('\n');
    expect(parseRoundLedger(text).map((entry) => entry.id)).toEqual(['a', 'b']);
  });

  it('an asleep gap belongs to no round', () => {
    const entry = parseRoundPassEntry(
      JSON.stringify({
        v: 1,
        id: 'gap',
        startedAt: '2026-09-17T01:12:00.000Z',
        endedAt: '2026-09-17T08:55:00.000Z',
        outcome: 'asleep',
        checked: 0,
        stale: [],
        written: [],
        refused: [],
        agentTurns: 0,
        summary: 'asleep',
      }),
    );
    expect(entry?.outcome).toBe('asleep');
    expect(entry?.roundId).toBeUndefined();
    expect(entry?.trigger).toBe('clock');
  });

  it('keeps the reason a pass did less than asked, and drops a reason it does not know', () => {
    expect(parseRoundPassEntry(JSON.stringify(pass({ note: 'no-agent' })))?.note).toBe('no-agent');
    expect(parseRoundPassEntry(JSON.stringify({ ...pass(), note: 'sunspots' }))?.note).toBeUndefined();
  });

  it('round-trips an ontology review outcome and kind', () => {
    const entry = parseRoundPassEntry(JSON.stringify(pass({ kind: 'ontology', outcome: 'reviewed', summary: 'Review only' })));
    expect(entry?.kind).toBe('ontology');
    expect(entry?.outcome).toBe('reviewed');
  });

  it('rejects an entry with an outcome it does not know', () => {
    expect(parseRoundPassEntry(JSON.stringify(pass({ outcome: 'exploded' as RoundPassEntry['outcome'] })))).toBeNull();
  });
});
