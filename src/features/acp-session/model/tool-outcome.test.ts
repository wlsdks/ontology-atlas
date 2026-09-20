import { describe, expect, it } from 'vitest';

import { readToolOutcome } from './tool-outcome';

/** Every case below is a call to our own server unless it says otherwise. */
const OURS = true;
/** The turn that opened the call is still running. */
const LIVE = true;
/** The turn is over and the adapter never closed the call. */
const OVER = false;

/** How our MCP server actually answers: one text block holding pretty-printed JSON. */
const mcpText = (value: unknown) => [
  { type: 'text', text: JSON.stringify(value, null, 2) },
];

describe('readToolOutcome — a finished call says how much it found', () => {
  it('reads the top-level total our read tools report', () => {
    // Measured against the live server: list_concepts({kind:'domain',limit:1})
    // answers {"total":8,"nodes":[…],"returned":1,"limited":true,"pagination":{…}}.
    expect(
      readToolOutcome(mcpText({ total: 8, nodes: [{}], returned: 1 }), 'completed', OURS, LIVE),
    ).toEqual({ kind: 'count', count: 8 });
  });

  it('reads count when the tool reports that instead', () => {
    expect(readToolOutcome(mcpText({ count: 3, issues: [] }), 'completed', OURS, LIVE)).toEqual({
      kind: 'count',
      count: 3,
    });
  });

  it('prefers total over count when a tool reports both', () => {
    expect(readToolOutcome(mcpText({ total: 12, count: 5 }), 'completed', OURS, LIVE)).toEqual({
      kind: 'count',
      count: 12,
    });
  });

  it('accepts zero — nothing found is a diagnosis, not a missing value', () => {
    expect(readToolOutcome(mcpText({ total: 0, nodes: [] }), 'completed', OURS, LIVE)).toEqual({
      kind: 'count',
      count: 0,
    });
  });

  it('accepts an already-parsed object as well as a text block', () => {
    expect(readToolOutcome({ total: 2 }, 'completed', OURS, LIVE)).toEqual({ kind: 'count', count: 2 });
  });

  it('says done rather than inventing a number when the answer carries none', () => {
    // validate_vault answers {scanned, problems, summary} — no count field exists.
    expect(
      readToolOutcome(mcpText({ scanned: 40, problems: [], summary: {} }), 'completed', OURS, LIVE),
    ).toEqual({ kind: 'status', status: 'done' });
  });

  it('never digs for a nested number', () => {
    expect(
      readToolOutcome(mcpText({ pagination: { total: 9 } }), 'completed', OURS, LIVE),
    ).toEqual({ kind: 'status', status: 'done' });
  });

  it('ignores a non-integer or negative total', () => {
    expect(readToolOutcome(mcpText({ total: 1.5 }), 'completed', OURS, LIVE)).toEqual({
      kind: 'status',
      status: 'done',
    });
    expect(readToolOutcome(mcpText({ total: -1 }), 'completed', OURS, LIVE)).toEqual({
      kind: 'status',
      status: 'done',
    });
  });

  it('survives output that is not JSON at all', () => {
    expect(readToolOutcome([{ type: 'text', text: 'no such file' }], 'completed', OURS, LIVE)).toEqual({
      kind: 'status',
      status: 'done',
    });
    expect(readToolOutcome(undefined, 'completed', OURS, LIVE)).toEqual({ kind: 'status', status: 'done' });
  });
});

describe('readToolOutcome — an unfinished or broken call never claims a count', () => {
  it('reports running while the call is still open', () => {
    expect(readToolOutcome(undefined, 'pending', OURS, LIVE)).toEqual({
      kind: 'status',
      status: 'running',
    });
    expect(readToolOutcome(undefined, 'in_progress', OURS, LIVE)).toEqual({
      kind: 'status',
      status: 'running',
    });
  });

  it('refuses a count on a failed call — the number would describe an answer nobody got', () => {
    expect(readToolOutcome(mcpText({ total: 8 }), 'failed', OURS, LIVE)).toEqual({
      kind: 'status',
      status: 'failed',
    });
  });

  it('refuses a count on a cancelled call', () => {
    expect(readToolOutcome(mcpText({ total: 8 }), 'cancelled', OURS, LIVE)).toEqual({
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
    expect(readToolOutcome(mcpText({ total: 8, nodes: [] }), 'completed', false, LIVE)).toEqual({
      kind: 'status',
      status: 'done',
    });
    expect(readToolOutcome({ count: 3 }, 'completed', false, LIVE)).toEqual({
      kind: 'status',
      status: 'done',
    });
  });

  it('still reports what a foreign tool told us about itself', () => {
    expect(readToolOutcome(undefined, 'pending', false, LIVE)).toEqual({
      kind: 'status',
      status: 'running',
    });
    expect(readToolOutcome(mcpText({ total: 8 }), 'failed', false, LIVE)).toEqual({
      kind: 'status',
      status: 'failed',
    });
  });
});

describe('readToolOutcome — a call whose turn ended stops claiming it is running', () => {
  /*
   * ⚠️ Measured in the rendered dock, 2026-09-19. Press Stop while a read is in flight, or let a
   * turn end without the adapter closing its call, and the row kept the word 「running」 and its
   * pulsing ring for the rest of the conversation — with the session at Ready and the composer
   * open. Nothing said the call had stopped, because nothing on the wire ever said so: the
   * adapter simply stops reporting.
   */
  it('reads an open call as unfinished once its turn is over', () => {
    expect(readToolOutcome(undefined, 'pending', OURS, OVER)).toEqual({
      kind: 'status',
      status: 'unfinished',
    });
    expect(readToolOutcome(undefined, 'in_progress', false, OVER)).toEqual({
      kind: 'status',
      status: 'unfinished',
    });
  });

  it('never turns a finished call into an unfinished one — the turn state decides nothing there', () => {
    expect(readToolOutcome(mcpText({ total: 8 }), 'completed', OURS, OVER)).toEqual({
      kind: 'count',
      count: 8,
    });
    expect(readToolOutcome(mcpText({ total: 8 }), 'failed', OURS, OVER)).toEqual({
      kind: 'status',
      status: 'failed',
    });
    expect(readToolOutcome(mcpText({ total: 8 }), 'cancelled', OURS, OVER)).toEqual({
      kind: 'status',
      status: 'cancelled',
    });
  });

  it('refuses a count on an unfinished call, the same way it refuses one on a broken call', () => {
    expect(readToolOutcome(mcpText({ total: 8 }), 'pending', OURS, OVER)).toEqual({
      kind: 'status',
      status: 'unfinished',
    });
  });
});
