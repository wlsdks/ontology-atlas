import { describe, expect, it } from 'vitest';

import { readToolOutcome } from './tool-outcome';

/** Every case below is a call to our own server unless it says otherwise. */
const OURS = true;

/** How our MCP server actually answers: one text block holding pretty-printed JSON. */
const mcpText = (value: unknown) => [
  { type: 'text', text: JSON.stringify(value, null, 2) },
];

describe('readToolOutcome — a finished call says how much it found', () => {
  it('reads the top-level total our read tools report', () => {
    // Measured against the live server: list_concepts({kind:'domain',limit:1})
    // answers {"total":8,"nodes":[…],"returned":1,"limited":true,"pagination":{…}}.
    expect(
      readToolOutcome(mcpText({ total: 8, nodes: [{}], returned: 1 }), 'completed', OURS),
    ).toEqual({ kind: 'count', count: 8 });
  });

  it('reads count when the tool reports that instead', () => {
    expect(readToolOutcome(mcpText({ count: 3, issues: [] }), 'completed', OURS)).toEqual({
      kind: 'count',
      count: 3,
    });
  });

  it('prefers total over count when a tool reports both', () => {
    expect(readToolOutcome(mcpText({ total: 12, count: 5 }), 'completed', OURS)).toEqual({
      kind: 'count',
      count: 12,
    });
  });

  it('accepts zero — nothing found is a diagnosis, not a missing value', () => {
    expect(readToolOutcome(mcpText({ total: 0, nodes: [] }), 'completed', OURS)).toEqual({
      kind: 'count',
      count: 0,
    });
  });

  it('accepts an already-parsed object as well as a text block', () => {
    expect(readToolOutcome({ total: 2 }, 'completed', OURS)).toEqual({ kind: 'count', count: 2 });
  });

  it('says done rather than inventing a number when the answer carries none', () => {
    // validate_vault answers {scanned, problems, summary} — no count field exists.
    expect(
      readToolOutcome(mcpText({ scanned: 40, problems: [], summary: {} }), 'completed', OURS),
    ).toEqual({ kind: 'status', status: 'done' });
  });

  it('never digs for a nested number', () => {
    expect(
      readToolOutcome(mcpText({ pagination: { total: 9 } }), 'completed', OURS),
    ).toEqual({ kind: 'status', status: 'done' });
  });

  it('ignores a non-integer or negative total', () => {
    expect(readToolOutcome(mcpText({ total: 1.5 }), 'completed', OURS)).toEqual({
      kind: 'status',
      status: 'done',
    });
    expect(readToolOutcome(mcpText({ total: -1 }), 'completed', OURS)).toEqual({
      kind: 'status',
      status: 'done',
    });
  });

  it('survives output that is not JSON at all', () => {
    expect(readToolOutcome([{ type: 'text', text: 'no such file' }], 'completed', OURS)).toEqual({
      kind: 'status',
      status: 'done',
    });
    expect(readToolOutcome(undefined, 'completed', OURS)).toEqual({ kind: 'status', status: 'done' });
  });
});

describe('readToolOutcome — an unfinished or broken call never claims a count', () => {
  it('reports running while the call is still open', () => {
    expect(readToolOutcome(undefined, 'pending', OURS)).toEqual({
      kind: 'status',
      status: 'running',
    });
    expect(readToolOutcome(undefined, 'in_progress', OURS)).toEqual({
      kind: 'status',
      status: 'running',
    });
  });

  it('refuses a count on a failed call — the number would describe an answer nobody got', () => {
    expect(readToolOutcome(mcpText({ total: 8 }), 'failed', OURS)).toEqual({
      kind: 'status',
      status: 'failed',
    });
  });

  it('refuses a count on a cancelled call', () => {
    expect(readToolOutcome(mcpText({ total: 8 }), 'cancelled', OURS)).toEqual({
      kind: 'status',
      status: 'cancelled',
    });
  });
});

describe('readToolOutcome — a number is only read from a shape we wrote', () => {
  /*
   * ⚠️ `total` and `count` are **our** server's field names. Anything else on the wire is
   * somebody else's JSON, where those words can mean a byte count, a token budget, a page
   * index — and the row would print that beside 「Read the map」 as if it were a result
   * count. A number that is confidently wrong is worse on a diagnostic row than no number
   * at all, because the row exists to be believed.
   */
  it('refuses a count from a tool that is not ours, however our-shaped it looks', () => {
    expect(readToolOutcome(mcpText({ total: 8, nodes: [] }), 'completed', false)).toEqual({
      kind: 'status',
      status: 'done',
    });
    expect(readToolOutcome({ count: 3 }, 'completed', false)).toEqual({
      kind: 'status',
      status: 'done',
    });
  });

  it('still reports what a foreign tool told us about itself', () => {
    expect(readToolOutcome(undefined, 'pending', false)).toEqual({
      kind: 'status',
      status: 'running',
    });
    expect(readToolOutcome(mcpText({ total: 8 }), 'failed', false)).toEqual({
      kind: 'status',
      status: 'failed',
    });
  });
});
